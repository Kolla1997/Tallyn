// Package supabaseadmin calls Supabase Auth's admin API with the project's
// server-only key (ADR 0013, 0015). Two jobs: removing a person's
// authenticators when they recover with a backup code (#23), and deleting a
// person's sign-in when they close their account (#56). The key is never used
// for the database (ADR 0002) and never reaches the browser.
package supabaseadmin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var uuidRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Client talks to <SUPABASE_URL>/auth/v1/admin.
type Client struct {
	base string
	key  string
	http *http.Client
}

// New returns a client, or an error if the URL or key can't be right.
func New(supabaseURL, key string) (*Client, error) {
	u, err := url.Parse(strings.TrimRight(supabaseURL, "/"))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return nil, fmt.Errorf("supabaseadmin: SUPABASE_URL must be an http(s) URL")
	}
	if key == "" || key == "replace-me" {
		return nil, errors.New("supabaseadmin: no key")
	}
	return &Client{base: u.String() + "/auth/v1/admin", key: key, http: &http.Client{Timeout: 15 * time.Second}}, nil
}

type factor struct {
	ID string `json:"id"`
}

// RemoveFactors removes every 2FA factor of userID, so they set up a new
// authenticator at once. A person with no factors is fine.
func (c *Client) RemoveFactors(ctx context.Context, userID string) error {
	if !uuidRE.MatchString(userID) {
		return errors.New("supabaseadmin: user ID must be a UUID")
	}
	var factors []factor
	if err := c.do(ctx, http.MethodGet, "/users/"+userID+"/factors", &factors); err != nil {
		return err
	}
	for _, f := range factors {
		if !uuidRE.MatchString(f.ID) {
			return errors.New("supabaseadmin: unexpected factor ID")
		}
		if err := c.do(ctx, http.MethodDelete, "/users/"+userID+"/factors/"+f.ID, nil); err != nil {
			return err
		}
	}
	return nil
}

// DeleteUser deletes userID's Supabase sign-in for good (#56). The database
// deletes everything else of theirs by cascade. A sign-in that's already gone
// counts as done, so a retried closing finishes.
func (c *Client) DeleteUser(ctx context.Context, userID string) error {
	if !uuidRE.MatchString(userID) {
		return errors.New("supabaseadmin: user ID must be a UUID")
	}
	err := c.do(ctx, http.MethodDelete, "/users/"+userID, nil)
	var s statusError
	if errors.As(err, &s) && s.status == http.StatusNotFound {
		return nil
	}
	return err
}

// statusError is a non-2xx answer. Its text never holds the body.
type statusError struct {
	method, what string
	status       int
}

func (e statusError) Error() string {
	return fmt.Sprintf("supabaseadmin: %s %s: status %d", e.method, e.what, e.status)
}

func (c *Client) do(ctx context.Context, method, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.key)
	req.Header.Set("Authorization", "Bearer "+c.key)
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("supabaseadmin: %s: %w", method, err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode/100 != 2 {
		// Never log the body in full: it can echo request details.
		return statusError{method: method, what: strings.SplitN(path, "/", 3)[1], status: res.StatusCode}
	}
	if out != nil && len(body) > 0 {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("supabaseadmin: decode: %w", err)
		}
	}
	return nil
}
