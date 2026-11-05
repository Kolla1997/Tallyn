package email

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// The welcome email (#280): F, the short letter.
func TestComposeWelcome(t *testing.T) {
	m, err := ComposeWelcome(Welcome{Name: "Dinesh Kolla"}, Links{App: "https://coinroof.us"})
	if err != nil {
		t.Fatal(err)
	}
	if m.Subject != "Welcome to Coinroof" {
		t.Errorf("subject %q", m.Subject)
	}
	for _, want := range []string{"Hi Dinesh. It all", "adds up", "from checking to credit cards", "Connect your first bank", "https://coinroof.us/settings", "The Coinroof team"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("HTML lacks %q", want)
		}
	}
	if strings.Contains(m.HTML, "currency") || strings.Contains(m.HTML, "unsubscribe") {
		t.Error("welcome mentions currencies or has a stop link: Coinroof is US only, and this is an account email")
	}
	if !strings.Contains(m.Text, "Connect your first bank: https://coinroof.us/") {
		t.Errorf("text version: %q", m.Text)
	}
	if m, _ := ComposeWelcome(Welcome{}, Links{App: "https://coinroof.us"}); !strings.Contains(m.HTML, "Hi. It all") {
		t.Error("no name should read \"Hi.\"")
	}
}

func TestComposeInvite(t *testing.T) {
	in := Invited{From: "DK Adult", Household: "Kolla <family>", Role: "teen", Link: "https://coinroof.us/join#abc", Days: 7}
	m, err := ComposeInvite(in, Links{App: "https://coinroof.us"})
	if err != nil {
		t.Fatal(err)
	}
	if m.Subject != "DK Adult invited you to Coinroof" {
		t.Errorf("subject %q", m.Subject)
	}
	for _, want := range []string{"DK Adult wants to", "add things up", "Kolla &lt;family&gt;", "as <b style=\"color:#18181b\">a teen</b>", "https://coinroof.us/join#abc", "works for 7 days"} {
		if !strings.Contains(m.HTML, want) {
			t.Errorf("HTML lacks %q", want)
		}
	}
	if strings.Contains(m.HTML, "Kolla <family>") {
		t.Error("household name not escaped")
	}
	if _, err := ComposeInvite(Invited{Role: "owner", Link: "x"}, Links{}); err == nil {
		t.Error("an owner invite was built")
	}
	if m, _ := ComposeInvite(Invited{Role: "adult", Link: "x"}, Links{}); !strings.Contains(m.Subject, "Someone invited you") {
		t.Errorf("no inviter name: %q", m.Subject)
	}
}

func TestJobWelcome(t *testing.T) {
	out := &fakeOutbox{welcomeDue: []db.WelcomeDue{
		{UserID: ann, Email: "ann@example.com", Name: "Ann"},
		{UserID: kid, Email: "down@example.com"},
	}}
	s := &fakeSender{fail: "down@example.com"}
	j := Job{Outbox: out, Sender: s, LinkKey: key, AppURL: "https://coinroof.us"}
	j.Once(context.Background(), time.Now())
	if len(s.sent) != 1 || s.sent[0].To != "ann@example.com" {
		t.Fatalf("sent %+v", s.sent)
	}
	if strings.Join(out.welcomed, ",") != ann+":sent" {
		t.Errorf("marked %v: a failed send must be tried again", out.welcomed)
	}
}
