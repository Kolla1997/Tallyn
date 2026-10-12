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

// All IDs, secrets and tokens here are fake.
const (
	fakeClientID = "fake-client-id"
	fakeSecret   = "fake-secret"
	fakeToken    = "access-sandbox-fake-token"
)

// fakePlaid answers each path with a canned status and body, and records the
// last request so tests can check what was sent.
type fakePlaid struct {
	responses map[string]struct {
		status int
		body   string
	}
	lastPath   string
	lastBody   map[string]any
	lastHeader http.Header
}

func (f *fakePlaid) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.lastPath, f.lastHeader = r.URL.Path, r.Header.Clone()
	b, _ := io.ReadAll(r.Body)
	f.lastBody = nil
	_ = json.Unmarshal(b, &f.lastBody)
	resp, ok := f.responses[r.URL.Path]
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(resp.status)
	_, _ = io.WriteString(w, resp.body)
}

func setup(t *testing.T, path string, status int, body string) (*Client, *fakePlaid) {
	t.Helper()
	f := &fakePlaid{responses: map[string]struct {
		status int
		body   string
	}{path: {status, body}}}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return newClient(srv.URL, fakeClientID, fakeSecret, ""), f
}

func TestNew(t *testing.T) {
	if _, err := New("sandbox", "id", "secret", ""); err != nil {
		t.Fatal(err)
	}
	for name, args := range map[string][3]string{
		"development env": {"development", "id", "secret"},
		"empty env":       {"", "id", "secret"},
		"no client ID":    {"sandbox", "", "secret"},
		"placeholder":     {"sandbox", "replace-me", "replace-me"},
	} {
		if _, err := New(args[0], args[1], args[2], ""); err == nil {
			t.Errorf("%s: New accepted it", name)
		}
	}
}

func TestCreateLinkToken(t *testing.T) {
	c, f := setup(t, "/link/token/create", 200, `{"link_token":"link-sandbox-fake","expiration":"2026-10-08T00:00:00Z"}`)
	tok, err := c.CreateLinkToken(context.Background(), "11111111-1111-4111-8111-111111111111")
	if err != nil || tok != "link-sandbox-fake" {
		t.Fatalf("got %q, %v", tok, err)
	}
	if f.lastHeader.Get("PLAID-CLIENT-ID") != fakeClientID || f.lastHeader.Get("PLAID-SECRET") != fakeSecret {
		t.Fatal("credentials not sent in headers")
	}
	if _, ok := f.lastBody["secret"]; ok {
		t.Fatal("secret must not be in the request body")
	}
	if f.lastHeader.Get("Plaid-Version") == "" {
		t.Fatal("Plaid-Version header missing")
	}
	// Least data: US only, Transactions only, opaque user ID.
	if got := f.lastBody["country_codes"]; len(got.([]any)) != 1 || got.([]any)[0] != "US" {
		t.Fatalf("country_codes = %v", got)
	}
	if got := f.lastBody["products"]; len(got.([]any)) != 1 || got.([]any)[0] != "transactions" {
		t.Fatalf("products = %v", got)
	}
	// Card and loan details only where the bank has them (#27).
	if got := f.lastBody["optional_products"]; len(got.([]any)) != 1 || got.([]any)[0] != "liabilities" {
		t.Fatalf("optional_products = %v", got)
	}
	if u := f.lastBody["user"].(map[string]any)["client_user_id"]; u != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("client_user_id = %v", u)
	}
	if _, ok := f.lastBody["redirect_uri"]; ok {
		t.Fatal("redirect_uri sent although not configured")
	}
}

func TestExchangePublicToken(t *testing.T) {
	c, f := setup(t, "/item/public_token/exchange", 200, `{"access_token":"`+fakeToken+`","item_id":"fake-item","request_id":"r1"}`)
	tok, item, err := c.ExchangePublicToken(context.Background(), "public-sandbox-fake")
	if err != nil || tok != fakeToken || item != "fake-item" {
		t.Fatalf("got %q %q %v", tok, item, err)
	}
	if f.lastBody["public_token"] != "public-sandbox-fake" {
		t.Fatalf("body = %v", f.lastBody)
	}
}

func TestAccounts(t *testing.T) {
	c, _ := setup(t, "/accounts/get", 200, `{
		"accounts": [
			{"account_id":"a1","name":"Plaid Checking","official_name":"Plaid Gold Standard","mask":"0000","type":"depository","subtype":"checking",
			 "balances":{"current":110,"available":100.1,"iso_currency_code":"USD","unofficial_currency_code":null}},
			{"account_id":"a2","name":"Plaid Credit Card","official_name":null,"mask":"3333","type":"credit","subtype":"credit card",
			 "balances":{"current":410.07,"available":null,"limit":2000,"iso_currency_code":"USD","unofficial_currency_code":null}},
			{"account_id":"a3","name":"Coins","type":"investment","subtype":null,
			 "balances":{"current":0.5,"available":null,"iso_currency_code":null,"unofficial_currency_code":"BTC"}}
		],
		"item": {"item_id":"fake-item","institution_id":"ins_109508","institution_name":"First Platypus Bank"}
	}`)
	item, accts, err := c.Accounts(context.Background(), fakeToken)
	if err != nil {
		t.Fatal(err)
	}
	if item.ID != "fake-item" || item.InstitutionID != "ins_109508" || item.InstitutionName != "First Platypus Bank" {
		t.Fatalf("item = %+v", item)
	}
	if len(accts) != 3 {
		t.Fatalf("got %d accounts", len(accts))
	}
	if a := accts[0]; a.Currency != "USD" || *a.CurrentMinor != 11000 || *a.AvailableMinor != 10010 || a.Mask != "0000" {
		t.Fatalf("checking = %+v", a)
	}
	if a := accts[0]; a.LimitMinor != nil {
		t.Fatalf("checking has no limit: %+v", a)
	}
	if a := accts[1]; *a.CurrentMinor != 41007 || a.AvailableMinor != nil || a.OfficialName != "" || a.LimitMinor == nil || *a.LimitMinor != 200000 {
		t.Fatalf("credit = %+v", a)
	}
	if a := accts[2]; a.Currency != "BTC" || a.CurrentMinor != nil {
		t.Fatalf("unofficial currency should keep balances empty: %+v", a)
	}
}

func TestAccountsWithoutCurrency(t *testing.T) {
	c, _ := setup(t, "/accounts/get", 200, `{"accounts":[{"account_id":"a1","name":"X","type":"depository",
		"balances":{"current":1,"iso_currency_code":null,"unofficial_currency_code":null}}],"item":{"item_id":"i"}}`)
	if _, _, err := c.Accounts(context.Background(), fakeToken); err == nil {
		t.Fatal("want an error for an account with no currency")
	}
}

func TestErrors(t *testing.T) {
	c, _ := setup(t, "/item/remove", 400, `{"error_type":"ITEM_ERROR","error_code":"ITEM_NOT_FOUND","error_message":"the Item you requested cannot be found","display_message":null,"request_id":"req-1"}`)
	err := c.RemoveItem(context.Background(), fakeToken)
	var pe *Error
	if !errors.As(err, &pe) || pe.Code != "ITEM_NOT_FOUND" || pe.HTTPStatus != 400 || pe.RequestID != "req-1" {
		t.Fatalf("err = %#v", err)
	}
	if !IsItemGone(err) {
		t.Fatal("ITEM_NOT_FOUND should count as gone")
	}
	if strings.Contains(err.Error(), fakeToken) || strings.Contains(err.Error(), fakeSecret) {
		t.Fatal("error leaks a token or the secret")
	}

	c2, _ := setup(t, "/item/remove", 400, `{"error_type":"INVALID_INPUT","error_code":"INVALID_ACCESS_TOKEN","error_message":"could not find matching access token","request_id":"req-2"}`)
	if !IsItemGone(c2.RemoveItem(context.Background(), fakeToken)) {
		t.Fatal("INVALID_ACCESS_TOKEN should count as gone")
	}

	c3, _ := setup(t, "/item/remove", 500, `<html>oops</html>`)
	err = c3.RemoveItem(context.Background(), fakeToken)
	if !errors.As(err, &pe) || pe.Code != "UNEXPECTED_RESPONSE" || IsItemGone(err) {
		t.Fatalf("err = %#v", err)
	}

	c4, _ := setup(t, "/item/remove", 400, `{"error_type":"RATE_LIMIT_EXCEEDED","error_code":"RATE_LIMIT","request_id":"r"}`)
	if IsItemGone(c4.RemoveItem(context.Background(), fakeToken)) {
		t.Fatal("a rate limit isn't a removed item")
	}
}

func TestInstitutionName(t *testing.T) {
	c, f := setup(t, "/institutions/get_by_id", 200, `{"institution":{"institution_id":"ins_1","name":"Fake Bank"}}`)
	name, err := c.InstitutionName(context.Background(), "ins_1")
	if err != nil || name != "Fake Bank" {
		t.Fatalf("got %q, %v", name, err)
	}
	if f.lastBody["institution_id"] != "ins_1" {
		t.Fatalf("body = %v", f.lastBody)
	}
}

// Update mode (#51): the existing item's access token, consent for card and
// loan details, and no products (Plaid refuses products in update mode).
func TestCreateUpdateLinkToken(t *testing.T) {
	c, f := setup(t, "/link/token/create", 200, `{"link_token":"link-sandbox-update"}`)
	tok, err := c.CreateUpdateLinkToken(context.Background(), "11111111-1111-4111-8111-111111111111", fakeToken)
	if err != nil || tok != "link-sandbox-update" {
		t.Fatalf("got %q, %v", tok, err)
	}
	if f.lastBody["access_token"] != fakeToken {
		t.Fatalf("access_token = %v", f.lastBody["access_token"])
	}
	if _, ok := f.lastBody["products"]; ok {
		t.Fatal("products sent in update mode")
	}
	if got := f.lastBody["additional_consented_products"]; len(got.([]any)) != 1 || got.([]any)[0] != "liabilities" {
		t.Fatalf("additional_consented_products = %v", got)
	}
}
