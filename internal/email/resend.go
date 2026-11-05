package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Resend sends the newsletter (#281) through Resend, from its own address
// (news.coinroof.us once verified), apart from the account emails on Brevo:
// if someone reports a newsletter, their alerts and sign-in emails still
// arrive. Product news always carries its own stop link.
type Resend struct {
	Key       string
	FromEmail string // onboarding@resend.dev until the domain is verified
	FromName  string
	URL       string // defaults to Resend's API; tests point it elsewhere
	Client    *http.Client
}

const resendURL = "https://api.resend.com/emails"

func (s Resend) Send(ctx context.Context, m Message) error {
	body := map[string]any{
		"from":    fmt.Sprintf("%s <%s>", s.FromName, s.FromEmail),
		"to":      []string{m.To},
		"subject": m.Subject,
		"html":    m.HTML,
		"text":    m.Text,
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return err
	}
	url := s.URL
	if url == "" {
		url = resendURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.Key)
	req.Header.Set("Content-Type", "application/json")
	c := s.Client
	if c == nil {
		c = &http.Client{Timeout: 20 * time.Second}
	}
	res, err := c.Do(req)
	if err != nil {
		return fmt.Errorf("email: resend: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("email: resend answered %d: %s", res.StatusCode, msg)
	}
	return nil
}
