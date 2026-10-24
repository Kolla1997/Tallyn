package supabaseadmin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const (
	user = "11111111-1111-4111-8111-111111111111"
	f1   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	f2   = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	key  = "fake-server-key-for-tests"
)

// A stand-in for Supabase Auth's admin API (#23).
func fakeSupabase(t *testing.T, status int, calls *[]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("apikey") != key || r.Header.Get("Authorization") != "Bearer "+key {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		*calls = append(*calls, r.Method+" "+r.URL.Path)
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`[{"id":"` + f1 + `","factor_type":"totp"},{"id":"` + f2 + `","factor_type":"totp"}]`))
			return
		}
		_, _ = w.Write([]byte(`{}`))
	}))
}

func TestRemoveFactors(t *testing.T) {
	var calls []string
	srv := fakeSupabase(t, http.StatusOK, &calls)
	defer srv.Close()
	c, err := New(srv.URL, key)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.RemoveFactors(context.Background(), user); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"GET /auth/v1/admin/users/" + user + "/factors",
		"DELETE /auth/v1/admin/users/" + user + "/factors/" + f1,
		"DELETE /auth/v1/admin/users/" + user + "/factors/" + f2,
	}
	if strings.Join(calls, "\n") != strings.Join(want, "\n") {
		t.Fatalf("calls:\n%s\nwant:\n%s", strings.Join(calls, "\n"), strings.Join(want, "\n"))
	}
}

func TestRemoveFactorsErrors(t *testing.T) {
	var calls []string
	srv := fakeSupabase(t, http.StatusInternalServerError, &calls)
	defer srv.Close()
	c, _ := New(srv.URL, key)
	if err := c.RemoveFactors(context.Background(), user); err == nil || strings.Contains(err.Error(), key) {
		t.Fatalf("err = %v, want an error that doesn't contain the key", err)
	}
	if err := c.RemoveFactors(context.Background(), "../other"); err == nil {
		t.Fatal("non-UUID user accepted")
	}
	for _, bad := range [][2]string{{"", key}, {"ftp://x", key}, {"https://x.supabase.co", ""}, {"https://x.supabase.co", "replace-me"}} {
		if _, err := New(bad[0], bad[1]); err == nil {
			t.Fatalf("New(%q, %q) accepted", bad[0], bad[1])
		}
	}
}

func TestDeleteUser(t *testing.T) {
	var calls []string
	srv := fakeSupabase(t, http.StatusOK, &calls)
	defer srv.Close()
	c, _ := New(srv.URL, key)
	if err := c.DeleteUser(context.Background(), user); err != nil {
		t.Fatal(err)
	}
	if strings.Join(calls, "") != "DELETE /auth/v1/admin/users/"+user {
		t.Fatalf("calls = %v", calls)
	}
	if err := c.DeleteUser(context.Background(), "../other"); err == nil {
		t.Fatal("non-UUID user accepted")
	}
}

// A retried closing finds the sign-in already gone: that's done, not an error.
func TestDeleteUserAlreadyGone(t *testing.T) {
	var calls []string
	gone := fakeSupabase(t, http.StatusNotFound, &calls)
	defer gone.Close()
	c, _ := New(gone.URL, key)
	if err := c.DeleteUser(context.Background(), user); err != nil {
		t.Fatalf("already gone: %v", err)
	}
	broken := fakeSupabase(t, http.StatusInternalServerError, &calls)
	defer broken.Close()
	c, _ = New(broken.URL, key)
	if err := c.DeleteUser(context.Background(), user); err == nil || strings.Contains(err.Error(), key) {
		t.Fatalf("err = %v, want an error without the key", err)
	}
}
