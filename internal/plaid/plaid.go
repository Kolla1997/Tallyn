// Package plaid is a small client for the parts of the Plaid API that Tallyn
// uses: Link tokens, public token exchange, accounts and item removal.
//
// Security (ADR 0004):
//   - PLAID_SECRET stays in the backend and goes only in request headers.
//   - Access tokens are never logged or put in errors. Callers encrypt them
//     (internal/tokencrypt) before storing them.
//   - Errors carry Plaid's error code and request ID, never request bodies.
//   - Link is US-only and asks for Transactions only (collect the least data).
package plaid

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/Kolla1997/Tallyn/internal/money"
)

var baseURLs = map[string]string{
	"sandbox":    "https://sandbox.plaid.com",
	"production": "https://production.plaid.com",
}

const (
	apiVersion  = "2020-09-14"
	maxResponse = 1 << 20
)

// Client calls the Plaid API.
type Client struct {
	baseURL     string
	clientID    string
	secret      string
	redirectURI string
	http        *http.Client
}

// New returns a client for env ("sandbox" or "production"). redirectURI is
// optional: banks that use OAuth need it, and it must be registered in the
// Plaid dashboard.
func New(env, clientID, secret, redirectURI string) (*Client, error) {
	base, ok := baseURLs[env]
	if !ok {
		return nil, fmt.Errorf("plaid: PLAID_ENV must be sandbox or production (got %q)", env)
	}
	if clientID == "" || secret == "" || clientID == "replace-me" || secret == "replace-me" {
		return nil, errors.New("plaid: PLAID_CLIENT_ID and PLAID_SECRET must be set")
	}
	return newClient(base, clientID, secret, redirectURI), nil
}

func newClient(baseURL, clientID, secret, redirectURI string) *Client {
	return &Client{
		baseURL:     baseURL,
		clientID:    clientID,
		secret:      secret,
		redirectURI: redirectURI,
		http:        &http.Client{Timeout: 30 * time.Second},
	}
}

// Error is an error returned by the Plaid API.
type Error struct {
	HTTPStatus     int
	Type           string `json:"error_type"`
	Code           string `json:"error_code"`
	Message        string `json:"error_message"`
	DisplayMessage string `json:"display_message"`
	RequestID      string `json:"request_id"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("plaid: %s %s (HTTP %d, request %s): %s", e.Type, e.Code, e.HTTPStatus, e.RequestID, e.Message)
}

// IsItemGone reports whether err means the item no longer exists at Plaid
// (already removed, or the token is no longer valid), so unlinking can
// finish on our side.
func IsItemGone(err error) bool {
	var pe *Error
	return errors.As(err, &pe) && (pe.Code == "ITEM_NOT_FOUND" || pe.Code == "INVALID_ACCESS_TOKEN")
}

func (c *Client) post(ctx context.Context, path string, body, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("PLAID-CLIENT-ID", c.clientID)
	req.Header.Set("PLAID-SECRET", c.secret)
	req.Header.Set("Plaid-Version", apiVersion)

	resp, err := c.http.Do(req)
	if err != nil {
		// Safe to wrap: the error names the URL, and the secret is only in headers.
		return fmt.Errorf("plaid: %s: %w", path, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponse))
	if err != nil {
		return fmt.Errorf("plaid: %s: read response: %w", path, err)
	}
	if resp.StatusCode != http.StatusOK {
		pe := &Error{HTTPStatus: resp.StatusCode}
		if json.Unmarshal(data, pe) != nil || pe.Code == "" {
			pe.Type, pe.Code = "API_ERROR", "UNEXPECTED_RESPONSE"
		}
		return pe
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber() // balances are parsed exactly, never as floats
	if err := dec.Decode(out); err != nil {
		return fmt.Errorf("plaid: %s: decode response: %w", path, err)
	}
	return nil
}

// CreateLinkToken returns a short-lived token that opens Plaid Link for
// userID. userID is Tallyn's opaque user ID, never an email address.
func (c *Client) CreateLinkToken(ctx context.Context, userID string) (string, error) {
	body := map[string]any{
		"client_name":   "Tallyn",
		"language":      "en",
		"country_codes": []string{"US"},
		"user":          map[string]string{"client_user_id": userID},
		"products":      []string{"transactions"},
	}
	if c.redirectURI != "" {
		body["redirect_uri"] = c.redirectURI
	}
	var out struct {
		LinkToken string `json:"link_token"`
	}
	if err := c.post(ctx, "/link/token/create", body, &out); err != nil {
		return "", err
	}
	if out.LinkToken == "" {
		return "", errors.New("plaid: empty link token")
	}
	return out.LinkToken, nil
}

// ExchangePublicToken swaps Link's one-time public token for the item's
// long-lived access token. Encrypt the access token before storing it.
func (c *Client) ExchangePublicToken(ctx context.Context, publicToken string) (accessToken, itemID string, err error) {
	var out struct {
		AccessToken string `json:"access_token"`
		ItemID      string `json:"item_id"`
	}
	if err := c.post(ctx, "/item/public_token/exchange", map[string]string{"public_token": publicToken}, &out); err != nil {
		return "", "", err
	}
	if out.AccessToken == "" || out.ItemID == "" {
		return "", "", errors.New("plaid: incomplete token exchange response")
	}
	return out.AccessToken, out.ItemID, nil
}

// Item is a bank connection.
type Item struct {
	ID              string
	InstitutionID   string
	InstitutionName string
}

// Account is a bank account or card, with balances in minor units.
// Balances are nil when the bank doesn't report them, or when the currency
// is one of Plaid's unofficial codes whose decimals we don't know.
type Account struct {
	PlaidAccountID string `json:"plaid_account_id"`
	Name           string `json:"name"`
	OfficialName   string `json:"official_name,omitempty"`
	Mask           string `json:"mask,omitempty"`
	Type           string `json:"type"`
	Subtype        string `json:"subtype,omitempty"`
	Currency       string `json:"currency"`
	CurrentMinor   *int64 `json:"current_balance_minor"`
	AvailableMinor *int64 `json:"available_balance_minor"`
}

// Accounts returns the item and its accounts.
func (c *Client) Accounts(ctx context.Context, accessToken string) (Item, []Account, error) {
	var out struct {
		Accounts []struct {
			AccountID    string  `json:"account_id"`
			Name         string  `json:"name"`
			OfficialName *string `json:"official_name"`
			Mask         *string `json:"mask"`
			Type         string  `json:"type"`
			Subtype      *string `json:"subtype"`
			Balances     struct {
				Current     *json.Number `json:"current"`
				Available   *json.Number `json:"available"`
				ISOCurrency *string      `json:"iso_currency_code"`
				Unofficial  *string      `json:"unofficial_currency_code"`
			} `json:"balances"`
		} `json:"accounts"`
		Item struct {
			ItemID          string  `json:"item_id"`
			InstitutionID   *string `json:"institution_id"`
			InstitutionName *string `json:"institution_name"`
		} `json:"item"`
	}
	if err := c.post(ctx, "/accounts/get", map[string]string{"access_token": accessToken}, &out); err != nil {
		return Item{}, nil, err
	}

	item := Item{ID: out.Item.ItemID, InstitutionID: deref(out.Item.InstitutionID), InstitutionName: deref(out.Item.InstitutionName)}
	accounts := make([]Account, 0, len(out.Accounts))
	for _, a := range out.Accounts {
		acct := Account{
			PlaidAccountID: a.AccountID,
			Name:           a.Name,
			OfficialName:   deref(a.OfficialName),
			Mask:           deref(a.Mask),
			Type:           a.Type,
			Subtype:        deref(a.Subtype),
		}
		switch {
		case a.Balances.ISOCurrency != nil && *a.Balances.ISOCurrency != "":
			acct.Currency = *a.Balances.ISOCurrency
			var err error
			if acct.CurrentMinor, err = minor(a.Balances.Current, acct.Currency); err != nil {
				return Item{}, nil, err
			}
			if acct.AvailableMinor, err = minor(a.Balances.Available, acct.Currency); err != nil {
				return Item{}, nil, err
			}
		case a.Balances.Unofficial != nil && *a.Balances.Unofficial != "":
			acct.Currency = *a.Balances.Unofficial // decimals unknown: keep balances empty
		default:
			return Item{}, nil, fmt.Errorf("plaid: account %s has no currency", a.AccountID)
		}
		accounts = append(accounts, acct)
	}
	return item, accounts, nil
}

// InstitutionName looks up a bank's display name.
func (c *Client) InstitutionName(ctx context.Context, institutionID string) (string, error) {
	var out struct {
		Institution struct {
			Name string `json:"name"`
		} `json:"institution"`
	}
	err := c.post(ctx, "/institutions/get_by_id", map[string]any{
		"institution_id": institutionID,
		"country_codes":  []string{"US"},
	}, &out)
	return out.Institution.Name, err
}

// RemoveItem revokes the access token at Plaid. This is what really
// disconnects the bank, and it ends Plaid's billing for the item.
func (c *Client) RemoveItem(ctx context.Context, accessToken string) error {
	var out struct{}
	return c.post(ctx, "/item/remove", map[string]string{"access_token": accessToken}, &out)
}

func minor(n *json.Number, currency string) (*int64, error) {
	if n == nil {
		return nil, nil
	}
	v, err := money.ToMinor(n.String(), currency)
	if err != nil {
		return nil, fmt.Errorf("plaid: balance: %w", err)
	}
	return &v, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
