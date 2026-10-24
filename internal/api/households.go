package api

import "net/http"

// PUT /api/households/{id} {"name": "..."}: rename a household (#53).
// Owners only; the database enforces it.
func renameHousehold(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok {
			return
		}
		var in struct {
			Name string `json:"name"`
		}
		if !readJSON(w, r, &in) {
			return
		}
		name, err := store.RenameHousehold(r.Context(), uid, r.PathValue("id"), in.Name)
		if err != nil {
			memberError(w, "rename household", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"name": name})
	}
}
