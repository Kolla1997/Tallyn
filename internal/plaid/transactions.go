package plaid

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/Kolla1997/Tallyn/internal/money"
)

// Transaction is one transaction from /transactions/sync, with the amount in
// minor units. Plaid's sign: positive = money out, negative = money in.
type Transaction struct {
	PlaidTransactionID string
	PlaidAccountID     string
	AmountMinor        int64
	Currency           string
	Date               string // YYYY-MM-DD, always present
	AuthorizedDate     string // may be empty
	Name               string
	MerchantName       string
	CategoryPrimary    string
	CategoryDetailed   string
	Pending            bool
	PaymentChannel     string // online, in store, other
	LogoURL            string // merchant logo on Plaid's logo hosts only; empty if none

	// When and where. Only some banks and merchants provide these.
	AuthorizedAt *time.Time
	PostedAt     *time.Time
	Location     Location
}

// Location is where an in-store purchase happened. Fields are empty when unknown.
type Location struct {
	Address, City, Region, PostalCode, Country, StoreNumber string
	Lat, Lon                                                *float64
}

// Empty reports whether nothing is known about the location.
func (l Location) Empty() bool {
	return l.Address == "" && l.City == "" && l.Region == "" && l.PostalCode == "" &&
		l.Country == "" && l.StoreNumber == "" && l.Lat == nil && l.Lon == nil
}

// SyncResult is everything that changed since a cursor.
type SyncResult struct {
	Added, Modified []Transaction
	Removed         []string  // Plaid transaction IDs
	Accounts        []Account // current balances
	NextCursor      string
	Skipped         int // transactions in currencies whose decimals we don't know
	// NotReady means Plaid hasn't finished its first pull for a new link yet.
	// Nothing changed; try again in a few minutes. NextCursor is the input cursor.
	NotReady bool
}

const syncPageSize = 500

// SyncTransactions fetches every change since cursor ("" for the first sync),
// following has_more until the end. If the data changes while paging, Plaid
// asks for the whole loop to restart from the original cursor, so nothing is
// returned until a complete, consistent set has been read.
func (c *Client) SyncTransactions(ctx context.Context, accessToken, cursor string) (SyncResult, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		r, err := c.syncOnce(ctx, accessToken, cursor)
		var pe *Error
		if errors.As(err, &pe) && pe.Code == "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" {
			lastErr = err
			continue
		}
		return r, err
	}
	return SyncResult{}, lastErr
}

func (c *Client) syncOnce(ctx context.Context, accessToken, cursor string) (SyncResult, error) {
	var res SyncResult
	next := cursor
	for {
		body := map[string]any{"access_token": accessToken, "count": syncPageSize}
		if next != "" {
			body["cursor"] = next
		}
		var page struct {
			Added    []rawTransaction `json:"added"`
			Modified []rawTransaction `json:"modified"`
			Removed  []struct {
				TransactionID string `json:"transaction_id"`
			} `json:"removed"`
			Accounts   []rawAccount `json:"accounts"`
			NextCursor string       `json:"next_cursor"`
			HasMore    bool         `json:"has_more"`
		}
		if err := c.post(ctx, "/transactions/sync", body, &page); err != nil {
			return SyncResult{}, err
		}
		for _, list := range []struct {
			raw []rawTransaction
			out *[]Transaction
		}{{page.Added, &res.Added}, {page.Modified, &res.Modified}} {
			for _, rt := range list.raw {
				t, ok, err := rt.convert()
				if err != nil {
					return SyncResult{}, err
				}
				if !ok {
					res.Skipped++
					continue
				}
				*list.out = append(*list.out, t)
			}
		}
		for _, r := range page.Removed {
			res.Removed = append(res.Removed, r.TransactionID)
		}
		if len(page.Accounts) > 0 {
			accts, err := convertAccounts(page.Accounts)
			if err != nil {
				return SyncResult{}, err
			}
			res.Accounts = accts // the last page has the freshest balances
		}
		if page.NextCursor == "" {
			// A brand-new link before Plaid's first pull: nothing yet, no cursor.
			if !page.HasMore && len(page.Added)+len(page.Modified)+len(page.Removed) == 0 && next == cursor {
				res.NextCursor, res.NotReady = cursor, true
				return res, nil
			}
			return SyncResult{}, errors.New("plaid: /transactions/sync returned no cursor")
		}
		next = page.NextCursor
		if !page.HasMore {
			res.NextCursor = next
			return res, nil
		}
	}
}

type rawTransaction struct {
	TransactionID      string      `json:"transaction_id"`
	AccountID          string      `json:"account_id"`
	Amount             json.Number `json:"amount"`
	ISOCurrency        *string     `json:"iso_currency_code"`
	Unofficial         *string     `json:"unofficial_currency_code"`
	Date               string      `json:"date"`
	AuthorizedDate     *string     `json:"authorized_date"`
	Datetime           *string     `json:"datetime"`
	AuthorizedDatetime *string     `json:"authorized_datetime"`
	Name               string      `json:"name"`
	MerchantName       *string     `json:"merchant_name"`
	Pending            bool        `json:"pending"`
	PaymentChannel     string      `json:"payment_channel"`
	LogoURL            *string     `json:"logo_url"`
	Counterparties     []struct {
		LogoURL *string `json:"logo_url"`
	} `json:"counterparties"`
	Category *struct {
		Primary  string `json:"primary"`
		Detailed string `json:"detailed"`
	} `json:"personal_finance_category"`
	Location struct {
		Address     *string      `json:"address"`
		City        *string      `json:"city"`
		Region      *string      `json:"region"`
		PostalCode  *string      `json:"postal_code"`
		Country     *string      `json:"country"`
		Lat         *json.Number `json:"lat"`
		Lon         *json.Number `json:"lon"`
		StoreNumber *string      `json:"store_number"`
	} `json:"location"`
}

// convert returns ok = false for a transaction in a currency whose decimals
// we don't know (Plaid's unofficial codes): its amount can't be stored exactly.
func (r rawTransaction) convert() (Transaction, bool, error) {
	if r.ISOCurrency == nil || *r.ISOCurrency == "" {
		return Transaction{}, false, nil
	}
	amount, err := money.ToMinor(r.Amount.String(), *r.ISOCurrency)
	if errors.Is(err, money.ErrUnknownCurrency) {
		return Transaction{}, false, nil
	}
	if err != nil {
		return Transaction{}, false, fmt.Errorf("plaid: transaction amount: %w", err)
	}
	t := Transaction{
		PlaidTransactionID: r.TransactionID,
		PlaidAccountID:     r.AccountID,
		AmountMinor:        amount,
		Currency:           strings.ToUpper(*r.ISOCurrency),
		Date:               r.Date,
		AuthorizedDate:     deref(r.AuthorizedDate),
		Name:               r.Name,
		MerchantName:       deref(r.MerchantName),
		Pending:            r.Pending,
		PaymentChannel:     r.PaymentChannel,
		AuthorizedAt:       parseTime(r.AuthorizedDatetime),
		PostedAt:           parseTime(r.Datetime),
		Location: Location{
			Address:     deref(r.Location.Address),
			City:        deref(r.Location.City),
			Region:      deref(r.Location.Region),
			PostalCode:  deref(r.Location.PostalCode),
			Country:     strings.ToUpper(deref(r.Location.Country)),
			StoreNumber: deref(r.Location.StoreNumber),
			Lat:         coord(r.Location.Lat, 90),
			Lon:         coord(r.Location.Lon, 180),
		},
	}
	if r.Category != nil {
		t.CategoryPrimary, t.CategoryDetailed = r.Category.Primary, r.Category.Detailed
	}
	// The transaction's own logo first, then a counterparty's.
	candidates := []*string{r.LogoURL}
	for _, c := range r.Counterparties {
		candidates = append(candidates, c.LogoURL)
	}
	for _, c := range candidates {
		if c != nil && logoRE.MatchString(*c) {
			t.LogoURL = *c
			break
		}
	}
	switch t.PaymentChannel {
	case "online", "in store", "other":
	default:
		t.PaymentChannel = ""
	}
	return t, true, nil
}

// logoRE accepts only Plaid's logo hosts (0009_transaction_logos.sql checks
// the same), so no other site's images can get into the app.
var logoRE = regexp.MustCompile(`^https://plaid-(merchant|counterparty)-logos\.plaid\.com/[A-Za-z0-9._-]+\.png$`)

// parseTime reads Plaid's ISO 8601 timestamps. Banks that don't really know
// the time send midnight (00:00:00), which is treated as unknown.
func parseTime(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, *s)
	if err != nil {
		return nil
	}
	if h, m, sec := t.UTC().Clock(); h == 0 && m == 0 && sec == 0 {
		return nil
	}
	return &t
}

// coord parses a latitude (limit 90) or longitude (limit 180), dropping
// anything out of range.
func coord(n *json.Number, limit float64) *float64 {
	if n == nil {
		return nil
	}
	v, err := n.Float64()
	if err != nil || v < -limit || v > limit {
		return nil
	}
	return &v
}
