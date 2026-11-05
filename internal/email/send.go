// Package email sends Coinroof's notification emails (#269) through Brevo.
package email

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// Message is one email.
type Message struct {
	To          string
	Subject     string
	HTML        string
	Text        string
	Unsubscribe string // the one-click unsubscribe URL; not sent as a header (see Brevo.Send)
}

// Sender sends an email.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// Logger only logs what it would send: for local development without a
// Brevo key. It never logs the address or the body.
type Logger struct{}

func (Logger) Send(_ context.Context, m Message) error {
	log.Printf("email: would send %q (no BREVO_API_KEY)", m.Subject)
	return nil
}

// TestOnly sends every email to one address (EMAIL_TEST_TO), whoever it was
// for: until the domain is ready, only Dinesh gets them.
type TestOnly struct {
	To   string
	Next Sender
}

func (t TestOnly) Send(ctx context.Context, m Message) error {
	m.Subject = "[test] " + m.Subject
	m.To = t.To
	return t.Next.Send(ctx, m)
}

// Brevo sends through Brevo's transactional email API.
type Brevo struct {
	Key       string
	FromEmail string
	FromName  string
	URL       string // defaults to Brevo's API; tests point it elsewhere
	Client    *http.Client
}

const brevoURL = "https://api.brevo.com/v3/smtp/email"

func (b Brevo) Send(ctx context.Context, m Message) error {
	type addr struct {
		Email string `json:"email"`
		Name  string `json:"name,omitempty"`
	}
	body := map[string]any{
		"sender":      addr{b.FromEmail, b.FromName},
		"to":          []addr{{Email: m.To}},
		"subject":     m.Subject,
		"htmlContent": m.HTML,
		"textContent": m.Text,
	}
	// A new X-Entity-Ref-ID on every email keeps Gmail from grouping them into
	// one conversation and hiding the parts that match an earlier one (#274).
	ref := make([]byte, 16)
	if _, err := rand.Read(ref); err != nil {
		return err
	}
	body["headers"] = map[string]string{"X-Entity-Ref-ID": hex.EncodeToString(ref)}
	// No List-Unsubscribe header (Dinesh, 2026-11-04): a mail app's own
	// Unsubscribe button made Brevo block every email to that address, not
	// just one kind. The "Stop … emails" link in each email does that instead.
	buf, err := json.Marshal(body)
	if err != nil {
		return err
	}
	url := b.URL
	if url == "" {
		url = brevoURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("api-key", b.Key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	c := b.Client
	if c == nil {
		c = &http.Client{Timeout: 20 * time.Second}
	}
	res, err := c.Do(req)
	if err != nil {
		return fmt.Errorf("email: brevo: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("email: brevo answered %d: %s", res.StatusCode, msg)
	}
	return nil
}
