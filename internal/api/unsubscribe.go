package api

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/email"
)

// Unsubscribe links (#269, Dinesh picked page A). No sign-in: the signed
// link (email.Sign) is the proof, and it can only turn its one email off or
// back on. Nothing about the person's money is shown.
//
//	GET  /api/email/unsubscribe?t=…  which email the link is for
//	POST /api/email/unsubscribe?t=…  {"on": false} from the page's button, or
//	                                 List-Unsubscribe=One-Click from a mail app (RFC 8058)
type unsubscriber struct {
	store Store
	key   []byte
	lim   *limiter
}

func (u unsubscriber) link(w http.ResponseWriter, r *http.Request) (email.Link, bool) {
	l, err := email.Verify(u.key, r.URL.Query().Get("t"))
	if err != nil || (l.Kind != db.EmailReconnect && l.Kind != db.EmailPaymentDue && l.Kind != db.EmailKidReconnect && l.Kind != db.EmailWeekly && l.Kind != db.EmailMonthly) {
		writeError(w, http.StatusBadRequest, "bad_link")
		return email.Link{}, false
	}
	if ok, wait := u.lim.allow(l.UserID); !ok {
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		writeError(w, http.StatusTooManyRequests, "too_many_requests")
		return email.Link{}, false
	}
	return l, true
}

func (u unsubscriber) which(w http.ResponseWriter, r *http.Request) {
	if l, ok := u.link(w, r); ok {
		writeJSON(w, http.StatusOK, map[string]string{"kind": l.Kind})
	}
}

func (u unsubscriber) set(w http.ResponseWriter, r *http.Request) {
	l, ok := u.link(w, r)
	if !ok {
		return
	}
	var on bool
	if r.Header.Get("Content-Type") == "application/json" {
		var in struct {
			On bool `json:"on"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		on = in.On
	} else {
		// A mail app's one-click unsubscribe: always off.
		r.Body = http.MaxBytesReader(w, r.Body, 1<<10)
		if err := r.ParseForm(); err != nil || r.PostForm.Get("List-Unsubscribe") != "One-Click" {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
	}
	err := u.store.SetEmail(r.Context(), l.UserID, l.HouseholdID, l.Kind, l.Kid, on)
	switch {
	case errors.Is(err, db.ErrForbidden), errors.Is(err, db.ErrInvalid):
		// Left the household, or the account is closed: nothing to change.
		writeError(w, http.StatusGone, "link_no_longer_works")
	case err != nil:
		log.Printf("api: unsubscribe: %v", err)
		writeError(w, http.StatusInternalServerError, "internal")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"kind": l.Kind, "on": on})
	}
}
