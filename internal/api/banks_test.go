package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/plaid"
	"github.com/Kolla1997/Tallyn/internal/tokencrypt"
)

// All tokens and IDs here are fake.
const (
	testHH     = "22222222-2222-4222-8222-222222222222"
	fakeAccess = "access-sandbox-fake-token"
	fakeItemID = "fake-plaid-item"
	fakeBankID = "33333333-3333-4333-8333-333333333333"
	fakePublic = "public-sandbox-fake"
)

// stubStore fails every call; fakes embed it and override what they need.
type stubStore struct{}

func (stubStore) Me(context.Context, string) (db.Me, error) { return db.Me{}, errors.New("stub") }
func (stubStore) CreateHousehold(context.Context, string, string, string) (db.MyHousehold, error) {
	return db.MyHousehold{}, errors.New("stub")
}
func (stubStore) CanLink(context.Context, string, string) (bool, error) {
	return false, errors.New("stub")
}
func (stubStore) LinkBank(context.Context, string, string, db.NewBank) (string, error) {
	return "", errors.New("stub")
}
func (stubStore) Banks(context.Context, string, string) ([]db.Bank, error) {
	return nil, errors.New("stub")
}
func (stubStore) UnlinkTarget(context.Context, string, string) (string, []byte, error) {
	return "", nil, errors.New("stub")
}
func (stubStore) DeleteBank(context.Context, string, string) error { return errors.New("stub") }
func (stubStore) Transactions(context.Context, string, string, db.TxFilter) ([]db.Transaction, bool, error) {
	return nil, false, errors.New("stub")
}
func (stubStore) Spending(context.Context, string, string, string) ([]db.Spend, error) {
	return nil, errors.New("stub")
}
func (stubStore) Sharing(context.Context, string, string) (db.Sharing, error) {
	return db.Sharing{}, errors.New("stub")
}
func (stubStore) SetSharing(context.Context, string, string, string, []string) error {
	return errors.New("stub")
}
func (stubStore) SetDisplayName(context.Context, string, string) error { return errors.New("stub") }
func (stubStore) Members(context.Context, string, string) ([]db.Member, error) {
	return nil, errors.New("stub")
}
func (stubStore) SetMemberRole(context.Context, string, string, string, string) error {
	return errors.New("stub")
}
func (stubStore) RemoveMember(context.Context, string, string, string) error {
	return errors.New("stub")
}
func (stubStore) Invites(context.Context, string, string) ([]db.Invite, error) {
	return nil, errors.New("stub")
}
func (stubStore) CreateInvite(context.Context, string, string, string, string) (db.Invite, string, error) {
	return db.Invite{}, "", errors.New("stub")
}
func (stubStore) RevokeInvite(context.Context, string, string) error { return errors.New("stub") }
func (stubStore) AcceptInvite(context.Context, string, string) (string, error) {
	return "", errors.New("stub")
}

type bankStore struct {
	stubStore
	canLink   bool
	linkErr   error
	linked    *db.NewBank
	linkedBy  string
	sealed    []byte
	targetErr error
	deleted   bool
	household db.MyHousehold
	hhErr     error
}

func (s *bankStore) CanLink(_ context.Context, uid, hh string) (bool, error) {
	return s.canLink && uid == testUser && hh == testHH, nil
}
func (s *bankStore) LinkBank(_ context.Context, uid, _ string, b db.NewBank) (string, error) {
	s.linked, s.linkedBy = &b, uid
	return fakeBankID, s.linkErr
}
func (s *bankStore) Banks(context.Context, string, string) ([]db.Bank, error) {
	return []db.Bank{{ID: fakeBankID, Status: "active", Accounts: []db.BankAccount{}}}, nil
}
func (s *bankStore) UnlinkTarget(context.Context, string, string) (string, []byte, error) {
	if s.targetErr != nil {
		return "", nil, s.targetErr
	}
	return fakeItemID, s.sealed, nil
}
func (s *bankStore) DeleteBank(context.Context, string, string) error { s.deleted = true; return nil }
func (s *bankStore) CreateHousehold(_ context.Context, _, name, cur string) (db.MyHousehold, error) {
	return db.MyHousehold{ID: testHH, Name: name, HomeCurrency: cur, Role: "owner"}, s.hhErr
}

type fakePlaidAPI struct {
	linkErr, exchangeErr, accountsErr, removeErr error
	exchanged, removed                           []string
}

func (p *fakePlaidAPI) CreateLinkToken(context.Context, string) (string, error) {
	return "link-sandbox-fake", p.linkErr
}
func (p *fakePlaidAPI) ExchangePublicToken(_ context.Context, pt string) (string, string, error) {
	p.exchanged = append(p.exchanged, pt)
	if p.exchangeErr != nil {
		return "", "", p.exchangeErr
	}
	return fakeAccess, fakeItemID, nil
}
func (p *fakePlaidAPI) Accounts(context.Context, string) (plaid.Item, []plaid.Account, error) {
	bal := int64(11000)
	return plaid.Item{ID: fakeItemID, InstitutionID: "ins_1"},
		[]plaid.Account{{PlaidAccountID: "a1", Name: "Checking", Type: "depository", Currency: "USD", CurrentMinor: &bal}},
		p.accountsErr
}
func (p *fakePlaidAPI) InstitutionName(context.Context, string) (string, error) {
	return "Fake Bank", nil
}
func (p *fakePlaidAPI) RemoveItem(_ context.Context, at string) error {
	p.removed = append(p.removed, at)
	return p.removeErr
}

func newTestBox(t *testing.T) *tokencrypt.Box {
	t.Helper()
	k := make([]byte, 32)
	_, _ = rand.Read(k)
	b, err := tokencrypt.New(base64.StdEncoding.EncodeToString(k))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func send(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer ok")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func bankRouter(t *testing.T, s *bankStore, p *fakePlaidAPI, box *tokencrypt.Box) http.Handler {
	t.Helper()
	return NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s, Plaid: p, Tokens: box})
}

func TestBankRoutesNeedPlaidConfig(t *testing.T) {
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &bankStore{canLink: true}})
	for _, tc := range [][2]string{{"POST", "/api/plaid/link-token"}, {"POST", "/api/plaid/exchange"}, {"DELETE", "/api/banks/" + fakeBankID}} {
		if rec := send(h, tc[0], tc[1], `{}`); rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s %s: status = %d, want 503", tc[0], tc[1], rec.Code)
		}
	}
	// Listing what's already linked doesn't need Plaid.
	if rec := send(h, "GET", "/api/banks?household_id="+testHH, ""); rec.Code != http.StatusOK {
		t.Fatalf("GET /api/banks: status = %d", rec.Code)
	}
}

func TestLinkToken(t *testing.T) {
	p := &fakePlaidAPI{}
	rec := send(bankRouter(t, &bankStore{canLink: false}, p, newTestBox(t)), "POST", "/api/plaid/link-token", `{"household_id":"`+testHH+`"}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("not allowed: status = %d, want 403", rec.Code)
	}

	rec = send(bankRouter(t, &bankStore{canLink: true}, p, newTestBox(t)), "POST", "/api/plaid/link-token", `{"household_id":"`+testHH+`"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "link-sandbox-fake") {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}

	p.linkErr = errors.New("plaid down")
	rec = send(bankRouter(t, &bankStore{canLink: true}, p, newTestBox(t)), "POST", "/api/plaid/link-token", `{"household_id":"`+testHH+`"}`)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("plaid error: status = %d, want 502", rec.Code)
	}
	if rec := send(bankRouter(t, &bankStore{canLink: true}, p, newTestBox(t)), "POST", "/api/plaid/link-token", `{"household_id":"x","extra":1}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("unknown field: status = %d, want 400", rec.Code)
	}
}

func TestExchange(t *testing.T) {
	body := `{"household_id":"` + testHH + `","public_token":"` + fakePublic + `"}`

	t.Run("saves the encrypted token and never returns it", func(t *testing.T) {
		s, p, box := &bankStore{canLink: true}, &fakePlaidAPI{}, newTestBox(t)
		rec := send(bankRouter(t, s, p, box), "POST", "/api/plaid/exchange", body)
		if rec.Code != http.StatusCreated || strings.Contains(rec.Body.String(), fakeAccess) {
			t.Fatalf("got %d %s", rec.Code, rec.Body)
		}
		if s.linked == nil || s.linkedBy != testUser || s.linked.PlaidItemID != fakeItemID || s.linked.InstitutionName != "Fake Bank" {
			t.Fatalf("linked = %+v by %s", s.linked, s.linkedBy)
		}
		if strings.Contains(string(s.linked.AccessTokenSealed), fakeAccess) {
			t.Fatal("token stored in plain text")
		}
		pt, err := box.Open(s.linked.AccessTokenSealed, []byte(fakeItemID))
		if err != nil || string(pt) != fakeAccess {
			t.Fatalf("stored token doesn't decrypt to the access token: %v", err)
		}
		if len(p.removed) != 0 {
			t.Fatal("a saved item must not be revoked")
		}
	})

	t.Run("checks permission before calling Plaid", func(t *testing.T) {
		p := &fakePlaidAPI{}
		rec := send(bankRouter(t, &bankStore{canLink: false}, p, newTestBox(t)), "POST", "/api/plaid/exchange", body)
		if rec.Code != http.StatusForbidden || len(p.exchanged) != 0 {
			t.Fatalf("status = %d, exchanged = %v", rec.Code, p.exchanged)
		}
	})

	t.Run("rejects something that isn't a public token", func(t *testing.T) {
		p := &fakePlaidAPI{}
		rec := send(bankRouter(t, &bankStore{canLink: true}, p, newTestBox(t)), "POST", "/api/plaid/exchange",
			`{"household_id":"`+testHH+`","public_token":"`+fakeAccess+`"}`)
		if rec.Code != http.StatusBadRequest || len(p.exchanged) != 0 {
			t.Fatalf("status = %d, exchanged = %v", rec.Code, p.exchanged)
		}
	})

	// Whenever the item can't be saved, the access token is revoked at Plaid.
	for name, tc := range map[string]struct {
		store  *bankStore
		plaid  *fakePlaidAPI
		status int
	}{
		"save refused by the database": {&bankStore{canLink: true, linkErr: db.ErrForbidden}, &fakePlaidAPI{}, http.StatusForbidden},
		"already linked":               {&bankStore{canLink: true, linkErr: db.ErrAlreadyLinked}, &fakePlaidAPI{}, http.StatusConflict},
		"database error":               {&bankStore{canLink: true, linkErr: errors.New("db down")}, &fakePlaidAPI{}, http.StatusInternalServerError},
		"accounts call fails":          {&bankStore{canLink: true}, &fakePlaidAPI{accountsErr: errors.New("plaid down")}, http.StatusBadGateway},
	} {
		t.Run("revokes when "+name, func(t *testing.T) {
			rec := send(bankRouter(t, tc.store, tc.plaid, newTestBox(t)), "POST", "/api/plaid/exchange", body)
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d", rec.Code, tc.status)
			}
			if len(tc.plaid.removed) != 1 || tc.plaid.removed[0] != fakeAccess {
				t.Fatalf("removed = %v, want the unsaved token revoked", tc.plaid.removed)
			}
		})
	}
}

func TestUnlink(t *testing.T) {
	path := "/api/banks/" + fakeBankID
	sealedWith := func(t *testing.T, box *tokencrypt.Box) []byte {
		s, err := box.Seal([]byte(fakeAccess), []byte(fakeItemID))
		if err != nil {
			t.Fatal(err)
		}
		return s
	}

	t.Run("revokes at Plaid, then deletes", func(t *testing.T) {
		box := newTestBox(t)
		s, p := &bankStore{sealed: sealedWith(t, box)}, &fakePlaidAPI{}
		rec := send(bankRouter(t, s, p, box), "DELETE", path, "")
		if rec.Code != http.StatusNoContent || !s.deleted || len(p.removed) != 1 || p.removed[0] != fakeAccess {
			t.Fatalf("status = %d, deleted = %v, removed = %v", rec.Code, s.deleted, p.removed)
		}
	})
	t.Run("already gone at Plaid still deletes", func(t *testing.T) {
		box := newTestBox(t)
		s, p := &bankStore{sealed: sealedWith(t, box)}, &fakePlaidAPI{removeErr: &plaid.Error{Code: "ITEM_NOT_FOUND"}}
		if rec := send(bankRouter(t, s, p, box), "DELETE", path, ""); rec.Code != http.StatusNoContent || !s.deleted {
			t.Fatalf("status = %d, deleted = %v", rec.Code, s.deleted)
		}
	})
	t.Run("keeps the bank if Plaid fails", func(t *testing.T) {
		box := newTestBox(t)
		s, p := &bankStore{sealed: sealedWith(t, box)}, &fakePlaidAPI{removeErr: &plaid.Error{Code: "RATE_LIMIT"}}
		if rec := send(bankRouter(t, s, p, box), "DELETE", path, ""); rec.Code != http.StatusBadGateway || s.deleted {
			t.Fatalf("status = %d, deleted = %v", rec.Code, s.deleted)
		}
	})
	t.Run("keeps the bank if the token can't be decrypted", func(t *testing.T) {
		s, p := &bankStore{sealed: sealedWith(t, newTestBox(t))}, &fakePlaidAPI{}
		rec := send(bankRouter(t, s, p, newTestBox(t)), "DELETE", path, "")
		if rec.Code != http.StatusInternalServerError || s.deleted || len(p.removed) != 0 {
			t.Fatalf("status = %d, deleted = %v, removed = %v", rec.Code, s.deleted, p.removed)
		}
	})
	t.Run("not allowed or unknown is a 404", func(t *testing.T) {
		s, p := &bankStore{targetErr: db.ErrNotFound}, &fakePlaidAPI{}
		if rec := send(bankRouter(t, s, p, newTestBox(t)), "DELETE", path, ""); rec.Code != http.StatusNotFound || len(p.removed) != 0 {
			t.Fatalf("status = %d, removed = %v", rec.Code, p.removed)
		}
	})
}

func TestCreateHousehold(t *testing.T) {
	h := bankRouter(t, &bankStore{}, &fakePlaidAPI{}, newTestBox(t))
	if rec := send(h, "POST", "/api/households", `{"name":" Home ","home_currency":"USD"}`); rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"name":"Home"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	h = bankRouter(t, &bankStore{hhErr: db.ErrInvalid}, &fakePlaidAPI{}, newTestBox(t))
	if rec := send(h, "POST", "/api/households", `{"name":"","home_currency":"dollars"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid: status = %d, want 400", rec.Code)
	}
	if rec := send(h, "POST", "/api/households", `not json`); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad JSON: status = %d, want 400", rec.Code)
	}
}
