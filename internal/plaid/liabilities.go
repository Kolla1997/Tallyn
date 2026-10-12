package plaid

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
)

// CreditCard is what a bank reports about one credit card (#27): its APRs,
// the minimum payment and when it's due, the last statement and payment.
// Amounts are in minor units of the card's currency; nil or "" when the bank
// doesn't say.
type CreditCard struct {
	PlaidAccountID     string
	APRs               []APR
	MinimumMinor       *int64
	NextDueDate        string // YYYY-MM-DD
	LastStatementMinor *int64
	LastStatementDate  string
	LastPaymentMinor   *int64
	LastPaymentDate    string
	Overdue            *bool
}

// APR is one of a card's rates: purchase_apr, balance_transfer_apr,
// cash_apr or special.
type APR struct {
	Type    string `json:"type"`
	Percent string `json:"percent"` // exact, e.g. "15.24"
}

var (
	dateRE    = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	percentRE = regexp.MustCompile(`^\d{1,3}(\.\d{1,4})?$`)
	aprTypes  = map[string]bool{"purchase_apr": true, "balance_transfer_apr": true, "cash_apr": true, "special": true}
)

// NoLiabilities reports whether err only means this bank has no card or loan
// details to give: not supported, not consented to, or not ready yet. The
// sync skips those quietly.
func NoLiabilities(err error) bool {
	var pe *Error
	if !errors.As(err, &pe) {
		return false
	}
	switch pe.Code {
	case "PRODUCTS_NOT_SUPPORTED", "NO_LIABILITY_ACCOUNTS", "PRODUCT_NOT_READY",
		"ADDITIONAL_CONSENT_REQUIRED", "INVALID_PRODUCT", "PRODUCT_NOT_ENABLED":
		return true
	}
	return false
}

// Liabilities returns the bank's credit card details. Student loans and
// mortgages come later (#27).
func (c *Client) Liabilities(ctx context.Context, accessToken string) ([]CreditCard, error) {
	var out struct {
		Accounts    []rawAccount `json:"accounts"`
		Liabilities struct {
			Credit []struct {
				AccountID *string `json:"account_id"`
				APRs      []struct {
					Percent *json.Number `json:"apr_percentage"`
					Type    string       `json:"apr_type"`
				} `json:"aprs"`
				Overdue             *bool        `json:"is_overdue"`
				LastPaymentAmount   *json.Number `json:"last_payment_amount"`
				LastPaymentDate     *string      `json:"last_payment_date"`
				LastStatementDate   *string      `json:"last_statement_issue_date"`
				LastStatementAmount *json.Number `json:"last_statement_balance"`
				MinimumPayment      *json.Number `json:"minimum_payment_amount"`
				NextDueDate         *string      `json:"next_payment_due_date"`
			} `json:"credit"`
		} `json:"liabilities"`
	}
	if err := c.post(ctx, "/liabilities/get", map[string]string{"access_token": accessToken}, &out); err != nil {
		return nil, err
	}

	// Amounts are in the account's currency.
	currency := map[string]string{}
	for _, a := range out.Accounts {
		if a.Balances.ISOCurrency != nil && *a.Balances.ISOCurrency != "" {
			currency[a.AccountID] = *a.Balances.ISOCurrency
		}
	}

	cards := []CreditCard{}
	for _, raw := range out.Liabilities.Credit {
		id := deref(raw.AccountID)
		cur, ok := currency[id]
		if id == "" || !ok {
			continue // no account, or decimals unknown
		}
		card := CreditCard{
			PlaidAccountID:    id,
			APRs:              []APR{},
			NextDueDate:       date(raw.NextDueDate),
			LastStatementDate: date(raw.LastStatementDate),
			LastPaymentDate:   date(raw.LastPaymentDate),
			Overdue:           raw.Overdue,
		}
		var err error
		if card.MinimumMinor, err = minor(raw.MinimumPayment, cur); err != nil {
			return nil, err
		}
		if card.LastStatementMinor, err = minor(raw.LastStatementAmount, cur); err != nil {
			return nil, err
		}
		if card.LastPaymentMinor, err = minor(raw.LastPaymentAmount, cur); err != nil {
			return nil, err
		}
		for _, a := range raw.APRs {
			if a.Percent == nil || !aprTypes[a.Type] || !percentRE.MatchString(a.Percent.String()) {
				continue
			}
			card.APRs = append(card.APRs, APR{Type: a.Type, Percent: a.Percent.String()})
		}
		cards = append(cards, card)
	}
	return cards, nil
}

// date keeps a YYYY-MM-DD date and drops anything else.
func date(s *string) string {
	if s == nil || !dateRE.MatchString(*s) {
		return ""
	}
	return *s
}
