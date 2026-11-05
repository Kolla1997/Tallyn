package email

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// All data is fake.
const (
	ann  = "00000000-0000-4000-8000-00000000000a"
	kid  = "00000000-0000-4000-8000-00000000000c"
	home = "00000000-0000-4000-8000-0000000000aa"
)

var key = DeriveLinkKey([]byte("test-only-token-key-32-bytes-xx!"))

func TestLinkSignAndVerify(t *testing.T) {
	l := Link{UserID: ann, HouseholdID: home, Kind: db.EmailKidReconnect, Kid: kid}
	tok := Sign(key, l)
	got, err := Verify(key, tok)
	if err != nil || got != l {
		t.Fatalf("Verify = %+v, %v", got, err)
	}
	other := Sign(key, Link{UserID: kid, HouseholdID: home, Kind: db.EmailReconnect})
	payload, _, _ := strings.Cut(other, ".")
	_, sig, _ := strings.Cut(tok, ".")
	for _, bad := range []string{"", "x", tok + "x", payload + "." + sig, strings.Replace(tok, ".", "", 1)} {
		if _, err := Verify(key, bad); !errors.Is(err, ErrBadLink) {
			t.Errorf("Verify(%q) accepted", bad)
		}
	}
	if _, err := Verify(DeriveLinkKey([]byte("another key")), tok); err == nil {
		t.Error("a link from another key was accepted")
	}
}

func compose(t *testing.T, kind, data string) Message {
	t.Helper()
	m, err := Compose(Alert{Kind: kind, Data: json.RawMessage(data)}, Links{App: "https://coinroof.us"}, "tok.en", "Trail House")
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestComposePaymentDue(t *testing.T) {
	m := compose(t, "payment_due", `{"account":"Plaid Credit Card","due_date":"2026-11-07","amount_minor":2000,"statement_minor":41000,"currency":"USD","overdue":false}`)
	if m.Subject != "Payment due Saturday: Plaid Credit Card" {
		t.Errorf("subject = %q", m.Subject)
	}
	for _, want := range []string{">NOV<", ">7<", ">Saturday<", ">Statement balance<", ">$410.00<", ">Minimum payment<", ">$20.00<",
		"https://coinroof.us/unsubscribe?t=tok.en", "Stop payment-due emails", "coinroof-logo.png", "Trail House", "avoids interest"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("HTML is missing %q", want)
		}
	}
	if strings.Contains(m.HTML, `#cb0900">$20.00`) {
		t.Error("a payment not yet due is shown in red")
	}
	if m.Unsubscribe != "https://coinroof.us/api/email/unsubscribe?t=tok.en" || !strings.Contains(m.Text, "Minimum payment: $20.00") {
		t.Errorf("unsubscribe %q, text %q", m.Unsubscribe, m.Text)
	}

	o := compose(t, "payment_due", `{"account":"Plaid Credit Card","due_date":"2026-11-07","amount_minor":2000,"currency":"USD","overdue":true}`)
	if o.Subject != "Overdue: Plaid Credit Card" || !strings.Contains(o.HTML, `#cb0900">$20.00`) || !strings.Contains(o.HTML, ">Past due<") || !strings.Contains(o.HTML, "November 7") {
		t.Errorf("overdue: %q", o.Subject)
	}
}

func TestComposeReconnect(t *testing.T) {
	m := compose(t, "reconnect", `{"bank":"First Platypus <Bank>"}`)
	if m.Subject != "Reconnect First Platypus <Bank>" || !strings.Contains(m.HTML, "First Platypus &lt;Bank&gt;") || !strings.Contains(m.HTML, ">Needs sign-in<") || strings.Contains(m.HTML, ">NOV<") {
		t.Errorf("subject %q; bank name not escaped in HTML", m.Subject)
	}
	k := compose(t, "reconnect", `{"bank":"First Platypus Bank","person":"Mia"}`)
	if k.Subject != "Mia's bank needs reconnecting" || !strings.Contains(k.HTML, "Stop Mia&#39;s emails") {
		t.Errorf("child's: %q", k.Subject)
	}
	if _, err := Compose(Alert{Kind: "big_purchase", Data: json.RawMessage(`{}`)}, Links{}, "", ""); err == nil {
		t.Error("composed an email for a big purchase")
	}
}

func TestFormatMoney(t *testing.T) {
	for minor, want := range map[int64]string{0: "$0.00", 5: "$0.05", 123456789: "$1,234,567.89", -2000: "-$20.00"} {
		if got := formatMoney(minor, "USD"); got != want {
			t.Errorf("formatMoney(%d) = %q, want %q", minor, got, want)
		}
	}
	if got := formatMoney(1500, "JPY"); got != "JPY 1,500" {
		t.Errorf("JPY = %q", got)
	}
}

func TestBrevo(t *testing.T) {
	var got map[string]any
	var apiKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey = r.Header.Get("api-key")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &got)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()
	b := Brevo{Key: "test-only-key", FromEmail: "alerts@coinroof.us", FromName: "Coinroof", URL: srv.URL}
	s := TestOnly{To: "me@example.com", Next: b}
	if err := s.Send(context.Background(), Message{To: "family@example.com", Subject: "Hi", HTML: "<p>x</p>", Text: "x", Unsubscribe: "https://coinroof.us/api/email/unsubscribe?t=a"}); err != nil {
		t.Fatal(err)
	}
	to := got["to"].([]any)[0].(map[string]any)["email"]
	h := got["headers"].(map[string]any)
	if apiKey != "test-only-key" || to != "me@example.com" || got["subject"] != "[test] Hi" ||
		h["List-Unsubscribe-Post"] != "List-Unsubscribe=One-Click" || h["List-Unsubscribe"] != "<https://coinroof.us/api/email/unsubscribe?t=a>" {
		t.Errorf("sent %v with key %q", got, apiKey)
	}

	fail := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer fail.Close()
	b.URL = fail.URL
	if err := b.Send(context.Background(), Message{To: "x@example.com"}); err == nil {
		t.Error("a 401 from Brevo was taken as sent")
	}
}

type fakeOutbox struct {
	list   []db.OutboxEmail
	marked []string
}

func (f *fakeOutbox) NotifyPaymentsDue(context.Context, time.Time) (int, error) { return 0, nil }
func (f *fakeOutbox) EmailOutbox(context.Context, int) ([]db.OutboxEmail, error) {
	return f.list, nil
}
func (f *fakeOutbox) MarkEmailed(_ context.Context, ids []string) error {
	f.marked = append(f.marked, ids...)
	return nil
}

type fakeSender struct {
	sent []Message
	fail string // fail for this address
}

func (s *fakeSender) Send(_ context.Context, m Message) error {
	if m.To == s.fail {
		return errors.New("brevo down")
	}
	s.sent = append(s.sent, m)
	return nil
}

func TestJobOnce(t *testing.T) {
	data := json.RawMessage(`{"bank":"First Platypus Bank"}`)
	out := &fakeOutbox{list: []db.OutboxEmail{
		{ID: "1", UserID: ann, OwnerID: ann, HouseholdID: home, Kind: "reconnect", Data: data, Email: "ann@example.com", Send: true},
		{ID: "2", UserID: ann, OwnerID: ann, HouseholdID: home, Kind: "joined", Data: data, Send: false},
		{ID: "3", UserID: ann, OwnerID: kid, HouseholdID: home, Kind: "reconnect", Data: json.RawMessage(`{"bank":"First Platypus Bank","person":"Mia"}`), Email: "ann@example.com", Send: true},
		{ID: "4", UserID: kid, OwnerID: kid, HouseholdID: home, Kind: "reconnect", Data: data, Email: "down@example.com", Send: true},
	}}
	s := &fakeSender{fail: "down@example.com"}
	j := Job{Outbox: out, Sender: s, LinkKey: key, AppURL: "https://coinroof.us"}
	j.Once(context.Background(), time.Now())
	if len(s.sent) != 2 {
		t.Fatalf("sent %d, want 2", len(s.sent))
	}
	if strings.Join(out.marked, ",") != "1,2,3" {
		t.Errorf("marked %v: a failed send must be tried again", out.marked)
	}
	// The child's email links to the child's switch, not the parent's own.
	tok := s.sent[1].Unsubscribe[strings.Index(s.sent[1].Unsubscribe, "t=")+2:]
	if l, err := Verify(key, strings.ReplaceAll(tok, "%2E", ".")); err != nil || l.Kind != db.EmailKidReconnect || l.Kid != kid || l.UserID != ann {
		t.Errorf("child's link = %+v, %v", l, err)
	}
}
