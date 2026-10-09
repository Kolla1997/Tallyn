package plaid

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// syncServer answers /transactions/sync with pages chosen by the request's
// cursor, and records the cursors it was asked for. All data is fake.
func syncServer(t *testing.T, pages map[string]string) (*Client, *[]string) {
	t.Helper()
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		cur, _ := body["cursor"].(string)
		seen = append(seen, cur)
		resp, ok := pages[cur]
		if !ok {
			w.WriteHeader(400)
			_, _ = io.WriteString(w, `{"error_type":"INVALID_INPUT","error_code":"INVALID_FIELD","request_id":"r"}`)
			return
		}
		if strings.HasPrefix(resp, "ERR:") {
			w.WriteHeader(400)
			_, _ = io.WriteString(w, strings.TrimPrefix(resp, "ERR:"))
			return
		}
		_, _ = io.WriteString(w, resp)
	}))
	t.Cleanup(srv.Close)
	return newClient(srv.URL, fakeClientID, fakeSecret, ""), &seen
}

const (
	grocer = `{"transaction_id":"t1","account_id":"a1","amount":12.34,"iso_currency_code":"USD","unofficial_currency_code":null,
		"date":"2026-10-01","authorized_date":"2026-09-30","datetime":"2026-10-01T15:04:05Z","authorized_datetime":"2026-09-30T13:42:00Z",
		"name":"FAKE GROCER 123","merchant_name":"Fake Grocer","pending":false,"payment_channel":"in store",
		"personal_finance_category":{"primary":"FOOD_AND_DRINK","detailed":"FOOD_AND_DRINK_GROCERIES"},
		"location":{"address":"1 Test St","city":"Testville","region":"IL","postal_code":"60601","country":"us","lat":41.88,"lon":-87.63,"store_number":"42"}}`
	refund = `{"transaction_id":"t2","account_id":"a1","amount":-5,"iso_currency_code":"USD","date":"2026-10-02",
		"datetime":"2026-10-02T00:00:00Z","name":"REFUND","merchant_name":null,"pending":true,"payment_channel":"online",
		"personal_finance_category":null,"location":{"address":null,"city":null,"lat":null,"lon":null}}`
	crypto = `{"transaction_id":"t3","account_id":"a2","amount":0.1,"iso_currency_code":null,"unofficial_currency_code":"BTC",
		"date":"2026-10-03","name":"COINS","pending":false,"payment_channel":"other","location":{}}`
	badCoords = `{"transaction_id":"t4","account_id":"a1","amount":1,"iso_currency_code":"USD","date":"2026-10-04","name":"X",
		"pending":false,"payment_channel":"weird","location":{"lat":123.0,"lon":-500}}`
	balances = `[{"account_id":"a1","name":"Checking","type":"depository","balances":{"current":100.5,"available":90,"iso_currency_code":"USD"}}]`
)

func TestSyncTransactionsPages(t *testing.T) {
	c, seen := syncServer(t, map[string]string{
		"":   `{"added":[` + grocer + `,` + refund + `],"modified":[],"removed":[],"next_cursor":"c1","has_more":true}`,
		"c1": `{"added":[` + crypto + `,` + badCoords + `],"modified":[` + grocer + `],"removed":[{"transaction_id":"gone1"}],"accounts":` + balances + `,"next_cursor":"c2","has_more":false}`,
	})
	r, err := c.SyncTransactions(context.Background(), fakeToken, "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(*seen, ",") != ",c1" || r.NextCursor != "c2" {
		t.Fatalf("cursors asked = %v, next = %q", *seen, r.NextCursor)
	}
	if len(r.Added) != 3 || len(r.Modified) != 1 || len(r.Removed) != 1 || r.Removed[0] != "gone1" || r.Skipped != 1 {
		t.Fatalf("added %d, modified %d, removed %v, skipped %d", len(r.Added), len(r.Modified), r.Removed, r.Skipped)
	}
	if len(r.Accounts) != 1 || *r.Accounts[0].CurrentMinor != 10050 {
		t.Fatalf("accounts = %+v", r.Accounts)
	}

	g := r.Added[0]
	if g.AmountMinor != 1234 || g.Currency != "USD" || g.MerchantName != "Fake Grocer" || g.CategoryPrimary != "FOOD_AND_DRINK" ||
		g.PaymentChannel != "in store" || g.AuthorizedDate != "2026-09-30" {
		t.Fatalf("grocer = %+v", g)
	}
	if g.AuthorizedAt == nil || g.AuthorizedAt.Format("15:04") != "13:42" || g.PostedAt == nil {
		t.Fatalf("times = %v %v", g.AuthorizedAt, g.PostedAt)
	}
	if l := g.Location; l.City != "Testville" || l.Country != "US" || l.StoreNumber != "42" || *l.Lat != 41.88 || *l.Lon != -87.63 || l.Empty() {
		t.Fatalf("location = %+v", l)
	}

	rf := r.Added[1]
	if rf.AmountMinor != -500 || !rf.Pending || rf.PostedAt != nil || !rf.Location.Empty() || rf.CategoryPrimary != "" {
		t.Fatalf("refund (midnight time means unknown, empty location) = %+v", rf)
	}
	bc := r.Added[2]
	if bc.Location.Lat != nil || bc.Location.Lon != nil || bc.PaymentChannel != "" {
		t.Fatalf("out-of-range coordinates and unknown channels must be dropped: %+v", bc)
	}
}

func TestSyncRestartsAfterMutation(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body map[string]any
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		cur, _ := body["cursor"].(string)
		switch {
		case cur == "start":
			_, _ = io.WriteString(w, `{"added":[`+grocer+`],"modified":[],"removed":[],"next_cursor":"mid","has_more":true}`)
		case cur == "mid" && calls == 2: // first pass: data changed while paging
			w.WriteHeader(400)
			_, _ = io.WriteString(w, `{"error_type":"TRANSACTIONS_ERROR","error_code":"TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION","request_id":"r"}`)
		case cur == "mid":
			_, _ = io.WriteString(w, `{"added":[`+refund+`],"modified":[],"removed":[],"next_cursor":"end","has_more":false}`)
		}
	}))
	defer srv.Close()
	c := newClient(srv.URL, fakeClientID, fakeSecret, "")
	r, err := c.SyncTransactions(context.Background(), fakeToken, "start")
	if err != nil {
		t.Fatal(err)
	}
	// Restarted from "start": the first pass's page isn't double-counted.
	if calls != 4 || len(r.Added) != 2 || r.NextCursor != "end" {
		t.Fatalf("calls = %d, added = %d, next = %q", calls, len(r.Added), r.NextCursor)
	}
}

func TestSyncErrors(t *testing.T) {
	c, _ := syncServer(t, map[string]string{
		"": `ERR:{"error_type":"ITEM_ERROR","error_code":"ITEM_LOGIN_REQUIRED","error_message":"the login details of this item have changed","request_id":"r"}`,
	})
	_, err := c.SyncTransactions(context.Background(), fakeToken, "")
	var pe *Error
	if !errors.As(err, &pe) || pe.Code != "ITEM_LOGIN_REQUIRED" || !NeedsLogin(err) {
		t.Fatalf("err = %v", err)
	}

	// A new link before Plaid's first pull: not ready, nothing changes.
	c2, _ := syncServer(t, map[string]string{"": `{"added":[],"modified":[],"removed":[],"next_cursor":"","has_more":false,"transactions_update_status":"NOT_READY"}`})
	r, err := c2.SyncTransactions(context.Background(), fakeToken, "")
	if err != nil || !r.NotReady || r.NextCursor != "" {
		t.Fatalf("got %+v, %v; want NotReady", r, err)
	}
	// A missing cursor anywhere else is an error, never a silent reset to the start.
	c3, _ := syncServer(t, map[string]string{
		"":   `{"added":[` + grocer + `],"modified":[],"removed":[],"next_cursor":"c1","has_more":true}`,
		"c1": `{"added":[],"modified":[],"removed":[],"next_cursor":"","has_more":false}`,
	})
	if _, err := c3.SyncTransactions(context.Background(), fakeToken, ""); err == nil {
		t.Fatal("want an error for a missing cursor mid-sync")
	}
}

func TestLinkTokenAsksFor90Days(t *testing.T) {
	c, f := setup(t, "/link/token/create", 200, `{"link_token":"link-sandbox-fake"}`)
	if _, err := c.CreateLinkToken(context.Background(), "u"); err != nil {
		t.Fatal(err)
	}
	tx, _ := f.lastBody["transactions"].(map[string]any)
	if tx["days_requested"] != float64(90) {
		t.Fatalf("transactions = %v", f.lastBody["transactions"])
	}
}
