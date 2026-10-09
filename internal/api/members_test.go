package api

import (
	"bytes"
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// All data here is fake.

const fakeInviteToken = "fake-invite-token-0000000000000000000000000"

type memberStore struct {
	stubStore
	err                        error
	gotUser, gotHH, gotEmail   string
	gotRole, gotMember, gotTok string
}

func (s *memberStore) CreateInvite(_ context.Context, uid, hh, email, role string) (db.Invite, string, error) {
	s.gotUser, s.gotHH, s.gotEmail, s.gotRole = uid, hh, email, role
	return db.Invite{ID: "inv-1", Email: email, Role: role}, fakeInviteToken, s.err
}
func (s *memberStore) AcceptInvite(_ context.Context, uid, token string) (string, error) {
	s.gotUser, s.gotTok = uid, token
	return testHH, s.err
}
func (s *memberStore) Invites(context.Context, string, string) ([]db.Invite, error) {
	return []db.Invite{{ID: "inv-1", Email: "x@example.test", Role: "adult"}}, s.err
}
func (s *memberStore) SetMemberRole(_ context.Context, uid, hh, member, role string) error {
	s.gotUser, s.gotHH, s.gotMember, s.gotRole = uid, hh, member, role
	return s.err
}
func (s *memberStore) RemoveMember(_ context.Context, uid, hh, member string) error {
	s.gotUser, s.gotHH, s.gotMember = uid, hh, member
	return s.err
}

func TestInviteRoutes(t *testing.T) {
	var logs bytes.Buffer
	log.SetOutput(&logs)
	defer log.SetOutput(os.Stderr)

	s := &memberStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})

	rec := send(h, "POST", "/api/households/"+testHH+"/invites", `{"email":"x@example.test","role":"adult"}`)
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), fakeInviteToken) {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("the response carrying a token must not be cached")
	}
	if s.gotUser != testUser || s.gotHH != testHH {
		t.Fatalf("inviter must be the session's user: %q in %q", s.gotUser, s.gotHH)
	}

	// The list never carries tokens.
	if rec := send(h, "GET", "/api/households/"+testHH+"/invites", ""); rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), "token") {
		t.Fatalf("list: %d %s", rec.Code, rec.Body)
	}

	if rec := send(h, "POST", "/api/invites/accept", `{"token":"`+fakeInviteToken+`"}`); rec.Code != http.StatusOK || s.gotTok != fakeInviteToken || s.gotUser != testUser {
		t.Fatalf("accept: %d", rec.Code)
	}

	for err, want := range map[error]int{
		db.ErrInviteInvalid: http.StatusBadRequest,
		db.ErrForbidden:     http.StatusForbidden,
		db.ErrAlreadyMember: http.StatusConflict,
		db.ErrInvalid:       http.StatusBadRequest,
	} {
		s.err = err
		path, body := "/api/households/"+testHH+"/invites", `{"email":"x@example.test","role":"adult"}`
		if err == db.ErrInviteInvalid {
			path, body = "/api/invites/accept", `{"token":"`+fakeInviteToken+`"}`
		}
		if rec := send(h, "POST", path, body); rec.Code != want {
			t.Fatalf("%v: %d, want %d", err, rec.Code, want)
		}
	}
	if strings.Contains(logs.String(), fakeInviteToken) {
		t.Fatal("a token reached the log")
	}
}

func TestMemberRoutes(t *testing.T) {
	s := &memberStore{}
	h := NewRouter(Deps{WebDir: t.TempDir(), RequireAuth: fakeAuth, Store: s})
	if rec := send(h, "PUT", "/api/households/"+testHH+"/members/m1", `{"role":"viewer"}`); rec.Code != http.StatusNoContent || s.gotMember != "m1" || s.gotRole != "viewer" {
		t.Fatalf("set role: %d", rec.Code)
	}
	if rec := send(h, "DELETE", "/api/households/"+testHH+"/members/m1", ""); rec.Code != http.StatusNoContent || s.gotUser != testUser {
		t.Fatalf("remove: %d", rec.Code)
	}
	s.err = db.ErrLastOwner
	if rec := send(h, "DELETE", "/api/households/"+testHH+"/members/"+testUser, ""); rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "last_owner") {
		t.Fatalf("last owner: %d %s", rec.Code, rec.Body)
	}
}
