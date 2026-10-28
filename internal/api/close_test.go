package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/plaid"
	"github.com/Kolla1997/Tallyn/internal/tokencrypt"
)

// Closing an account (#56, ADR 0015). All data is fake.

type closeStore struct {
	stubStore
	blocker string
	banks   []db.ClosingBank
	steps   []string
	gotHMAC []byte
	prepErr error
}

func (s *closeStore) ClosingBlocker(context.Context, string) (string, error) {
	s.steps = append(s.steps, "check")
	return s.blocker, nil
}
func (s *closeStore) ClosingBanks(context.Context, string) ([]db.ClosingBank, error) {
	return s.banks, nil
}
func (s *closeStore) DeleteBank(_ context.Context, _, id string) error {
	s.steps = append(s.steps, "delete bank "+id)
	return nil
}
func (s *closeStore) PrepareClosing(_ context.Context, _ string, h []byte) error {
	s.steps = append(s.steps, "record")
	s.gotHMAC = h
	return s.prepErr
}

type fakeDeleter struct {
	deleted []string
	err     error
}

func (d *fakeDeleter) DeleteUser(_ context.Context, uid string) error {
	d.deleted = append(d.deleted, uid)
	return d.err
}

var closingKey = bytes.Repeat([]byte{9}, 32)

func closeSetup(t *testing.T) (*closeStore, *fakePlaidAPI, *fakeDeleter, *tokencrypt.Box, http.Handler) {
	t.Helper()
	box := newTestBox(t)
	seal := func(token, item string) []byte {
		b, err := box.Seal([]byte(token), []byte(item))
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	s := &closeStore{banks: []db.ClosingBank{
		{ID: "bank-1", PlaidItemID: "item-1", Sealed: seal("access-sandbox-1", "item-1")},
		{ID: "bank-2", PlaidItemID: "item-2", Sealed: seal("access-sandbox-2", "item-2")},
	}}
	p, d := &fakePlaidAPI{}, &fakeDeleter{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s, Plaid: p, Tokens: box, Accounts: d, ClosingKey: closingKey})
	return s, p, d, box, h
}

const closeBody = `{"email":" Sam@Example.test "}` // fakeAuth's email, typed loosely

func TestCloseAccount(t *testing.T) {
	s, p, d, _, h := closeSetup(t)
	rec := sendFresh(h, "POST", "/api/me/close", closeBody)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if strings.Join(p.removed, ",") != "access-sandbox-1,access-sandbox-2" {
		t.Errorf("removed at Plaid: %v", p.removed)
	}
	if got := strings.Join(s.steps, " / "); got != "check / delete bank bank-1 / delete bank bank-2 / record" {
		t.Errorf("steps = %s", got)
	}
	m := hmac.New(sha256.New, closingKey)
	m.Write([]byte("sam@example.test"))
	if !bytes.Equal(s.gotHMAC, m.Sum(nil)) {
		t.Error("the record didn't get the keyed hash of the email")
	}
	if strings.Join(d.deleted, "") != testUser {
		t.Errorf("sign-ins deleted: %v", d.deleted)
	}
}

func TestCloseAccountRefusals(t *testing.T) {
	for name, c := range map[string]struct {
		fresh   bool
		body    string
		blocker string
		status  int
		code    string
	}{
		"old code":    {false, closeBody, "", http.StatusForbidden, "reauth_required"},
		"wrong email": {true, `{"email":"someone@example.test"}`, "", http.StatusBadRequest, "email_mismatch"},
		"no email":    {true, `{}`, "", http.StatusBadRequest, "email_mismatch"},
		"last owner":  {true, closeBody, "last_owner", http.StatusConflict, "last_owner"},
	} {
		s, p, d, _, h := closeSetup(t)
		s.blocker = c.blocker
		send := send
		if c.fresh {
			send = sendFresh
		}
		rec := send(h, "POST", "/api/me/close", c.body)
		if rec.Code != c.status || !strings.Contains(rec.Body.String(), c.code) {
			t.Errorf("%s: %d %s, want %d %s", name, rec.Code, rec.Body, c.status, c.code)
		}
		if len(p.removed) != 0 || len(d.deleted) != 0 || s.gotHMAC != nil {
			t.Errorf("%s: something was removed or deleted", name)
		}
	}
}

// Plaid failing on a bank stops everything after it: no record, sign-in kept,
// so trying again finishes the job.
func TestCloseAccountStopsWhenPlaidFails(t *testing.T) {
	s, p, d, _, h := closeSetup(t)
	p.removeErr = errors.New("plaid down")
	rec := sendFresh(h, "POST", "/api/me/close", closeBody)
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "bank_service_error") {
		t.Fatalf("status %d %s, want 502 bank_service_error", rec.Code, rec.Body)
	}
	if s.gotHMAC != nil || len(d.deleted) != 0 || len(s.steps) != 1 {
		t.Errorf("went past the failed bank: steps %v, deleted %v", s.steps, d.deleted)
	}
}

// A bank Plaid already lost counts as removed.
func TestCloseAccountBankAlreadyGone(t *testing.T) {
	_, p, d, _, h := closeSetup(t)
	p.removeErr = &plaid.Error{Code: "ITEM_NOT_FOUND"}
	if rec := sendFresh(h, "POST", "/api/me/close", closeBody); rec.Code != http.StatusNoContent {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if len(d.deleted) != 1 {
		t.Error("sign-in not deleted")
	}
}

func TestCloseAccountSignInDeleteFails(t *testing.T) {
	_, _, d, _, h := closeSetup(t)
	d.err = errors.New("supabase down")
	if rec := sendFresh(h, "POST", "/api/me/close", closeBody); rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500", rec.Code)
	}
}

func TestCloseAccountNotConfigured(t *testing.T) {
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: &closeStore{}})
	if rec := sendFresh(h, "POST", "/api/me/close", closeBody); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d, want 503", rec.Code)
	}
}
