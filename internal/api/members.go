package api

import (
	"errors"
	"log"
	"net/http"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Members and invitations (#12, ADR 0008). Every rule is enforced in the
// database; these handlers translate its answers. Invite tokens are returned
// once, never logged.

func memberError(w http.ResponseWriter, what string, err error) {
	switch {
	case errors.Is(err, db.ErrInvalid):
		writeError(w, http.StatusBadRequest, "bad_request")
	case errors.Is(err, db.ErrForbidden):
		writeError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, db.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, db.ErrAlreadyMember):
		writeError(w, http.StatusConflict, "already_member")
	case errors.Is(err, db.ErrLastOwner):
		writeError(w, http.StatusConflict, "last_owner")
	case errors.Is(err, db.ErrInviteInvalid):
		writeError(w, http.StatusBadRequest, "invite_not_valid")
	default:
		log.Printf("api: %s: %v", what, err)
		writeError(w, http.StatusInternalServerError, "internal")
	}
}

func members(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		list, err := store.Members(r.Context(), uid, r.PathValue("id"))
		if err != nil {
			memberError(w, "members", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"members": list})
	}
}

func setMemberRole(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Role string `json:"role"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if err := store.SetMemberRole(r.Context(), uid, r.PathValue("id"), r.PathValue("user"), in.Role); err != nil {
			memberError(w, "set role", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// removeMember removes a member, or the caller themselves (leaving).
func removeMember(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		if err := store.RemoveMember(r.Context(), uid, r.PathValue("id"), r.PathValue("user")); err != nil {
			memberError(w, "remove member", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func invites(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		list, err := store.Invites(r.Context(), uid, r.PathValue("id"))
		if err != nil {
			memberError(w, "invites", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"invites": list})
	}
}

// createInvite returns the invite and, this one time only, its token.
func createInvite(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Email string `json:"email"`
			Role  string `json:"role"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		inv, token, err := store.CreateInvite(r.Context(), uid, r.PathValue("id"), in.Email, in.Role)
		if err != nil {
			memberError(w, "create invite", err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusCreated, map[string]any{"invite": inv, "token": token})
	}
}

func revokeInvite(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		if err := store.RevokeInvite(r.Context(), uid, r.PathValue("id")); err != nil {
			memberError(w, "revoke invite", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func acceptInvite(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Token string `json:"token"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		hh, err := store.AcceptInvite(r.Context(), uid, in.Token)
		if err != nil {
			memberError(w, "accept invite", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"household_id": hh})
	}
}
