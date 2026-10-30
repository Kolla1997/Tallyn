package api

import (
	"log"
	"net/http"
	"slices"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Current versions of the documents people agree to (#36). They must match
// the `version` in legal/terms.md and legal/privacy.md (a test checks it).
// Publishing a new version here asks everyone to agree again.
var CurrentVersions = map[string]string{
	"terms":   "0.2-draft",
	"privacy": "0.2-draft",
}

// consent reports the current versions and whether the caller has agreed to
// them. The web app shows "Before you start" until they have.
func consent(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		list, err := store.Consents(r.Context(), uid)
		if err != nil {
			log.Printf("api: consents: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		accepted := func(doc string) bool {
			return slices.ContainsFunc(list, func(c db.Consent) bool { return c.Document == doc && c.Version == CurrentVersions[doc] })
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"versions": CurrentVersions,
			"needed":   !accepted("terms") || !accepted("privacy"),
		})
	}
}

// acceptConsent records agreement to the current versions. The versions the
// person saw are sent back, so an agreement to an older text is refused.
func acceptConsent(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Terms   string `json:"terms"`
			Privacy string `json:"privacy"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		if in.Terms != CurrentVersions["terms"] || in.Privacy != CurrentVersions["privacy"] {
			writeError(w, http.StatusConflict, "version_changed")
			return
		}
		if err := store.Accept(r.Context(), uid, map[string]string{"terms": in.Terms, "privacy": in.Privacy}); err != nil {
			log.Printf("api: accept consent: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
