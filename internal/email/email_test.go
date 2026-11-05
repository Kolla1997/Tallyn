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
	// No List-Unsubscribe: a mail app's button would make Brevo block every email.
	// A fresh X-Entity-Ref-ID keeps Gmail from grouping and trimming emails.
	h, _ := got["headers"].(map[string]any)
	ref, _ := h["X-Entity-Ref-ID"].(string)
	if apiKey != "test-only-key" || to != "me@example.com" || got["subject"] != "[test] Hi" || len(ref) != 32 || h["List-Unsubscribe"] != nil {
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
	list         []db.OutboxEmail
	marked       []string
	weeklyDue    []db.WeeklyDue
	summaries    map[string]json.RawMessage
	weeklyMarked []string
	monthlyDue   []db.WeeklyDue
	monthly      map[string]json.RawMessage
	monthMarked  []string
	welcomeDue   []db.WelcomeDue
	welcomed     []string
}

func (f *fakeOutbox) WelcomeDue(context.Context, time.Time) ([]db.WelcomeDue, error) {
	return f.welcomeDue, nil
}
func (f *fakeOutbox) MarkWelcome(_ context.Context, user string, sent bool) error {
	f.welcomed = append(f.welcomed, user+":"+map[bool]string{true: "sent", false: "skipped"}[sent])
	return nil
}

func (f *fakeOutbox) MonthlyDue(context.Context, time.Time) ([]db.WeeklyDue, error) {
	return f.monthlyDue, nil
}
func (f *fakeOutbox) MonthlySummary(_ context.Context, _, user string, _ time.Time) (json.RawMessage, error) {
	return f.monthly[user], nil
}
func (f *fakeOutbox) MarkMonthly(_ context.Context, _, user string, _ time.Time, sent bool) error {
	f.monthMarked = append(f.monthMarked, user+":"+map[bool]string{true: "sent", false: "skipped"}[sent])
	return nil
}

func (f *fakeOutbox) NotifyPaymentsDue(context.Context, time.Time) (int, error) { return 0, nil }
func (f *fakeOutbox) NotifyBudgets(context.Context, time.Time) (int, error)     { return 0, nil }
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

func (f *fakeOutbox) WeeklyDue(context.Context, time.Time) ([]db.WeeklyDue, error) {
	return f.weeklyDue, nil
}
func (f *fakeOutbox) WeeklySummary(_ context.Context, _, user string, _ time.Time) (json.RawMessage, error) {
	return f.summaries[user], nil
}
func (f *fakeOutbox) MarkWeekly(_ context.Context, _, user string, _ time.Time, sent bool) error {
	f.weeklyMarked = append(f.weeklyMarked, user+":"+map[bool]string{true: "sent", false: "skipped"}[sent])
	return nil
}

// A week from the sandbox, Oct 19–25: spending on Tue, Wed and Sat.
const sampleWeek = `{"week_start":"2026-10-19","week_end":"2026-10-25","currency":"USD","spent":150633,"came_in":0,
 "days":[0,100000,50000,0,0,633,0],
 "purchases":[{"name":"Madison Bicycle Center","date":"2026-10-20","amount_minor":50000,"category":"TRANSPORTATION"},
  {"name":"KFC <Fried>","date":"2026-10-20","amount_minor":50000,"category":"FOOD_AND_DRINK"}],"more":2,
 "month":{"from":"2026-10-01","to":"2026-10-25","spent":169596,"last_from":"2026-09-01","last_to":"2026-09-25","last":169596,"avg3":165861},
 "cash_minor":6258900,
 "due":[{"account":"Plaid Mortgage","due_date":"2019-11-15","amount_minor":230400,"overdue":true}],
 "shared":[{"name":"Dana","kid":false,"month":{"from":"2026-10-01","to":"2026-10-25","spent":169596,"last_from":"2026-09-01","last_to":"2026-09-25","last":150000,"avg3":163244},
   "biggest":{"name":"KFC","date":"2026-10-20","amount_minor":50000}},
  {"name":"Mia","kid":true,"month":{"from":"2026-10-01","to":"2026-10-25","spent":3000,"last_from":"2026-09-01","last_to":"2026-09-25","last":0,"avg3":null},"biggest":null}]}`

func TestComposeWeekly(t *testing.T) {
	var w Weekly
	if err := json.Unmarshal([]byte(sampleWeek), &w); err != nil {
		t.Fatal(err)
	}
	m, err := ComposeWeekly(w, Links{App: "https://coinroof.us"}, "tok.en", "Trail House")
	if err != nil {
		t.Fatal(err)
	}
	if m.Subject != "Your week: $1,506.33 spent (Oct 19 – 25)" {
		t.Errorf("subject = %q", m.Subject)
	}
	for _, want := range []string{"Your week, Oct 19 – 25", ">$1,506.33<", "spent, and nothing came in", ">Tue<", "height:64px", "height:32px",
		">Month so far<", ">$1,695.96<", ">vs Sep 1–25<", ">Same<", ">$62,589.00<", "Where it went", "Tuesday, transportation", "KFC &lt;Fried&gt;", "And 2 more",
		"Coming up", "$2,304.00 overdue", "#cb0900", "Shared with you", "Dana, Oct 1–25", "$195.96 more than last month so far", "Biggest this month",
		"Mia, Oct 1–25", "Stop weekly summaries", "https://coinroof.us/unsubscribe?t=tok.en", "Trail House"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("HTML is missing %q", want)
		}
	}
	// A child's part has totals only.
	if strings.Count(m.HTML, "Biggest this month") != 1 {
		t.Error("a child's biggest purchase is shown")
	}
	if !strings.Contains(m.Text, "$1,506.33 spent") || m.Unsubscribe != "https://coinroof.us/api/email/unsubscribe?t=tok.en" {
		t.Errorf("text %q", m.Text)
	}
	if _, err := ComposeWeekly(Weekly{}, Links{}, "", ""); err == nil {
		t.Error("composed a week without dates")
	}
}

func TestJobWeekly(t *testing.T) {
	quiet := `{"week_start":"2026-10-19","week_end":"2026-10-25","currency":"USD","spent":0,"came_in":0,"days":[0,0,0,0,0,0,0],"month":{}}`
	wk := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	out := &fakeOutbox{
		weeklyDue: []db.WeeklyDue{
			{UserID: ann, HouseholdID: home, Household: "Trail House", Email: "ann@example.com", WeekStart: wk},
			{UserID: kid, HouseholdID: home, Household: "Trail House", Email: "down@example.com", WeekStart: wk},
			{UserID: "quiet", HouseholdID: home, Household: "Trail House", Email: "q@example.com", WeekStart: wk},
		},
		summaries: map[string]json.RawMessage{ann: json.RawMessage(sampleWeek), kid: json.RawMessage(sampleWeek), "quiet": json.RawMessage(quiet)},
	}
	s := &fakeSender{fail: "down@example.com"}
	j := Job{Outbox: out, Sender: s, LinkKey: key, AppURL: "https://coinroof.us"}
	j.Once(context.Background(), time.Now())
	if len(s.sent) != 1 || s.sent[0].To != "ann@example.com" {
		t.Fatalf("sent %+v", s.sent)
	}
	if strings.Join(out.weeklyMarked, ",") != ann+":sent,quiet:skipped" {
		t.Errorf("marked %v: a failed send must be tried again", out.weeklyMarked)
	}
	tok := s.sent[0].Unsubscribe[strings.Index(s.sent[0].Unsubscribe, "t=")+2:]
	if l, err := Verify(key, strings.ReplaceAll(tok, "%2E", ".")); err != nil || l.Kind != db.EmailWeekly {
		t.Errorf("weekly link = %+v, %v", l, err)
	}
}

// October 2026 from the sandbox (a Thursday start).
const sampleMonth = `{"month_start":"2026-10-01","month_end":"2026-10-31","currency":"USD","spent":439192,"came_in":100000,
 "compare":{"spent":439192,"last":439192,"avg3":429347},
 "days":[0,0,0,0,0,0,17880,3266,15700,0,1080,0,0,0,0,0,0,0,0,200000,100000,0,0,1266,0,100000,0,0,0,0,0],
 "busiest":{"date":"2026-10-20","amount_minor":200000},
 "biggest":{"name":"United Airlines","date":"2026-10-26","amount_minor":50000},
 "biggest_in":{"name":"United Airlines","date":"2026-10-09","amount_minor":50000},
 "categories":[{"category":"FOOD_AND_DRINK","amount_minor":103266},{"category":"TRANSPORTATION","amount_minor":102346},
  {"category":"RENT_AND_UTILITIES","amount_minor":100000},{"category":"TRAVEL","amount_minor":100000},
  {"category":"GENERAL_MERCHANDISE","amount_minor":17880},{"category":"PERSONAL_CARE","amount_minor":15700}],
 "shared":[{"name":"Mia","kid":true,"compare":{"spent":3000,"last":0,"avg3":null},"biggest":null}]}`

func TestComposeMonthly(t *testing.T) {
	var mo Monthly
	if err := json.Unmarshal([]byte(sampleMonth), &mo); err != nil {
		t.Fatal(err)
	}
	m, err := ComposeMonthly(mo, Links{App: "https://coinroof.us"}, "tok.en", "Trail House")
	if err != nil {
		t.Fatal(err)
	}
	if m.Subject != "Your October: $4,391.92 spent" {
		t.Errorf("subject = %q", m.Subject)
	}
	for _, want := range []string{"Your October", "spent, and $1,000.00 came in", ">vs September<", ">Same<", ">$98.45 more<",
		"Busiest day", "Tue, Oct 20", "Biggest purchase", "United Airlines, Oct 26", "Most spent on", ">Food and drink<", "Came in",
		"Day by day", "Busiest: Tue, Oct 20 ($2,000.00)", "Where it went", ">24%<", "Same as September. Food and drink was the biggest share.",
		"Mia, October", "Stop monthly highlights", "https://coinroof.us/unsubscribe?t=tok.en"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("HTML is missing %q", want)
		}
	}
	// Red for the biggest day and category, green for the smallest.
	if !strings.Contains(m.HTML, "background:#cb0900;color:#ffffff\">20<") {
		t.Error("Oct 20 isn't red")
	}
	if !strings.Contains(m.HTML, "background:#067b00;color:#ffffff\">11<") {
		t.Error("Oct 11 ($10.80) isn't green")
	}
	if strings.Count(m.HTML, "background:#f7c6c2;color:#3f1a17") != 2 {
		t.Error("the two equal categories don't share a colour")
	}
	if strings.Contains(m.HTML, "Biggest this month") {
		t.Error("a child's biggest purchase is shown")
	}
	if _, err := ComposeMonthly(Monthly{}, Links{}, "", ""); err == nil {
		t.Error("composed a month without dates")
	}
}

func TestJobMonthly(t *testing.T) {
	quiet := `{"month_start":"2026-10-01","month_end":"2026-10-31","currency":"USD","spent":0,"came_in":0,"days":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}`
	mo := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	out := &fakeOutbox{
		monthlyDue: []db.WeeklyDue{{UserID: ann, HouseholdID: home, Household: "Trail House", Email: "ann@example.com", WeekStart: mo},
			{UserID: "quiet", HouseholdID: home, Household: "Trail House", Email: "q@example.com", WeekStart: mo}},
		monthly: map[string]json.RawMessage{ann: json.RawMessage(sampleMonth), "quiet": json.RawMessage(quiet)},
	}
	s := &fakeSender{}
	j := Job{Outbox: out, Sender: s, LinkKey: key, AppURL: "https://coinroof.us"}
	j.Once(context.Background(), time.Now())
	if len(s.sent) != 1 || strings.Join(out.monthMarked, ",") != ann+":sent,quiet:skipped" {
		t.Fatalf("sent %d, marked %v", len(s.sent), out.monthMarked)
	}
	tok := s.sent[0].Unsubscribe[strings.Index(s.sent[0].Unsubscribe, "t=")+2:]
	if l, err := Verify(key, strings.ReplaceAll(tok, "%2E", ".")); err != nil || l.Kind != db.EmailMonthly {
		t.Errorf("monthly link = %+v, %v", l, err)
	}
}

func TestWeeklyBarColours(t *testing.T) {
	var w Weekly
	_ = json.Unmarshal([]byte(sampleWeek), &w)
	m, _ := ComposeWeekly(w, Links{App: "https://coinroof.us"}, "t", "Trail House")
	// Tue is the week's biggest (red), Wed half of it (light red), Sat tiny (green).
	for _, want := range []string{"height:64px;line-height:64px;font-size:0;max-width:34px;margin:0 auto;border-radius:6px 6px 2px 2px;background:#cb0900",
		"height:32px;line-height:32px;font-size:0;max-width:34px;margin:0 auto;border-radius:6px 6px 2px 2px;background:#e06b66", "background:#067b00"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("weekly bars missing %q", want)
		}
	}
}

// Spending-limit emails (#55).
func TestComposeBudget(t *testing.T) {
	near := json.RawMessage(`{"category":"FOOD_AND_DRINK","limit_minor":50000,"spent_minor":41200,"currency":"USD","days_left":9}`)
	m, err := Compose(Alert{Kind: "budget_near", Data: near}, Links{App: "https://coinroof.us"}, "tok", "Kolla family")
	if err != nil {
		t.Fatal(err)
	}
	if m.Subject != "Food and drink: $88.00 left" || !strings.Contains(m.HTML, "9 days to go") || !strings.Contains(m.HTML, "Stop spending-limit emails") {
		t.Errorf("near: %q", m.Subject)
	}
	over := json.RawMessage(`{"limit_minor":20000,"spent_minor":23100,"currency":"USD","days_left":1,"person":"Mia"}`)
	m, err = Compose(Alert{Kind: "budget_over", Data: over}, Links{App: "https://coinroof.us"}, "tok", "Kolla family")
	if err != nil {
		t.Fatal(err)
	}
	if m.Subject != "Mia's everything: $31.00 over" || !strings.Contains(m.HTML, "1 day to go") {
		t.Errorf("over: %q", m.Subject)
	}
}
