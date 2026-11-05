package email

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The newsletter sender (#281). The key is fake.
func TestResend(t *testing.T) {
	var got map[string]any
	var auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(200)
	}))
	defer srv.Close()
	s := Resend{Key: "re_fake", FromEmail: "news@news.coinroof.us", FromName: "Coinroof", URL: srv.URL}
	if err := s.Send(context.Background(), Message{To: "x@example.com", Subject: "Hi", HTML: "<p>Hi</p>", Text: "Hi"}); err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer re_fake" || got["from"] != "Coinroof <news@news.coinroof.us>" || got["subject"] != "Hi" {
		t.Errorf("auth %q, body %v", auth, got)
	}
	fail := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(403) }))
	defer fail.Close()
	s.URL = fail.URL
	if err := s.Send(context.Background(), Message{To: "x@example.com"}); err == nil {
		t.Error("a 403 from Resend was taken as sent")
	}
}
