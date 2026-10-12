package plaid

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"unicode"
)

// Liabilities is a bank's card and loan details (#27).
type Liabilities struct {
	Cards []CreditCard
	Loans []Loan
}

// Loan is what a bank reports about a student loan or mortgage (#27). Only
// what Tallyn shows: never account numbers, payment reference numbers,
// servicer or property addresses (decided 2026-10-09), escrow or PMI.
// Amounts are minor units of the account's currency; dates YYYY-MM-DD;
// nil or "" when the bank doesn't say.
type Loan struct {
	PlaidAccountID    string
	Kind              string // "student" or "mortgage"
	RatePercent       string // exact, e.g. "5.25"
	RateType          string // "fixed" or "variable" (mortgages)
	NextPaymentMinor  *int64 // minimum (student) or next monthly payment (mortgage)
	NextDueDate       string
	LastPaymentMinor  *int64
	LastPaymentDate   string
	PayoffDate        string // expected payoff (student) or maturity (mortgage)
	OriginalMinor     *int64 // amount first borrowed
	OriginationDate   string
	PastDueMinor      *int64
	Overdue           *bool
	YTDInterestMinor  *int64
	YTDPrincipalMinor *int64
	RepaymentPlan     string // student, e.g. "Standard"
	Term              string // mortgage, e.g. "30 year"
}

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

// What a Liabilities error says about a bank's card details (#51).
const (
	CardsConsentNeeded = "consent_needed" // the person must agree in Plaid first
	CardsNotOffered    = "not_offered"    // this bank doesn't offer them
	CardsNotReady      = "not_ready"      // Plaid is still fetching: try later
)

// CardDetailsState says what err means for card details: one of the states
// above, or "" when it's a real failure.
func CardDetailsState(err error) string {
	var pe *Error
	if !errors.As(err, &pe) {
		return ""
	}
	switch pe.Code {
	case "ADDITIONAL_CONSENT_REQUIRED":
		return CardsConsentNeeded
	case "PRODUCTS_NOT_SUPPORTED", "NO_LIABILITY_ACCOUNTS", "INVALID_PRODUCT", "PRODUCT_NOT_ENABLED":
		return CardsNotOffered
	case "PRODUCT_NOT_READY":
		return CardsNotReady
	}
	return ""
}

// NoLiabilities reports whether err only means this bank has no card or loan
// details to give right now (any state above), rather than a failure.
func NoLiabilities(err error) bool { return CardDetailsState(err) != "" }

// Liabilities returns the bank's credit card, student loan and mortgage
// details (#27).
func (c *Client) Liabilities(ctx context.Context, accessToken string) (Liabilities, error) {
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
			Student []struct {
				AccountID          *string      `json:"account_id"`
				Rate               *json.Number `json:"interest_rate_percentage"`
				MinimumPayment     *json.Number `json:"minimum_payment_amount"`
				NextDueDate        *string      `json:"next_payment_due_date"`
				LastPaymentAmount  *json.Number `json:"last_payment_amount"`
				LastPaymentDate    *string      `json:"last_payment_date"`
				ExpectedPayoffDate *string      `json:"expected_payoff_date"`
				OriginalAmount     *json.Number `json:"origination_principal_amount"`
				OriginationDate    *string      `json:"origination_date"`
				Overdue            *bool        `json:"is_overdue"`
				YTDInterest        *json.Number `json:"ytd_interest_paid"`
				YTDPrincipal       *json.Number `json:"ytd_principal_paid"`
				RepaymentPlan      *struct {
					Description *string `json:"description"`
					Type        *string `json:"type"`
				} `json:"repayment_plan"`
			} `json:"student"`
			Mortgage []struct {
				AccountID    *string `json:"account_id"`
				InterestRate *struct {
					Percentage *json.Number `json:"percentage"`
					Type       *string      `json:"type"`
				} `json:"interest_rate"`
				NextMonthlyPayment *json.Number `json:"next_monthly_payment"`
				NextDueDate        *string      `json:"next_payment_due_date"`
				LastPaymentAmount  *json.Number `json:"last_payment_amount"`
				LastPaymentDate    *string      `json:"last_payment_date"`
				MaturityDate       *string      `json:"maturity_date"`
				OriginalAmount     *json.Number `json:"origination_principal_amount"`
				OriginationDate    *string      `json:"origination_date"`
				PastDueAmount      *json.Number `json:"past_due_amount"`
				YTDInterest        *json.Number `json:"ytd_interest_paid"`
				YTDPrincipal       *json.Number `json:"ytd_principal_paid"`
				LoanTerm           *string      `json:"loan_term"`
			} `json:"mortgage"`
		} `json:"liabilities"`
	}
	var res Liabilities
	if err := c.post(ctx, "/liabilities/get", map[string]string{"access_token": accessToken}, &out); err != nil {
		return res, err
	}

	// Amounts are in the account's currency.
	currency := map[string]string{}
	for _, a := range out.Accounts {
		if a.Balances.ISOCurrency != nil && *a.Balances.ISOCurrency != "" {
			currency[a.AccountID] = *a.Balances.ISOCurrency
		}
	}

	cards := []CreditCard{}
	money := func(n *json.Number, cur string) (*int64, error) { return minor(n, cur) }
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
		if card.MinimumMinor, err = money(raw.MinimumPayment, cur); err != nil {
			return res, err
		}
		if card.LastStatementMinor, err = money(raw.LastStatementAmount, cur); err != nil {
			return res, err
		}
		if card.LastPaymentMinor, err = money(raw.LastPaymentAmount, cur); err != nil {
			return res, err
		}
		for _, a := range raw.APRs {
			if a.Percent == nil || !aprTypes[a.Type] || !percentRE.MatchString(a.Percent.String()) {
				continue
			}
			card.APRs = append(card.APRs, APR{Type: a.Type, Percent: a.Percent.String()})
		}
		cards = append(cards, card)
	}
	res.Cards = cards

	res.Loans = []Loan{}
	amounts := func(cur string, dst []**int64, src []*json.Number) error {
		for i := range dst {
			v, err := money(src[i], cur)
			if err != nil {
				return err
			}
			*dst[i] = v
		}
		return nil
	}
	for _, raw := range out.Liabilities.Student {
		id := deref(raw.AccountID)
		cur, ok := currency[id]
		if id == "" || !ok {
			continue
		}
		l := Loan{PlaidAccountID: id, Kind: "student", RatePercent: rate(raw.Rate),
			NextDueDate: date(raw.NextDueDate), LastPaymentDate: date(raw.LastPaymentDate),
			PayoffDate: date(raw.ExpectedPayoffDate), OriginationDate: date(raw.OriginationDate), Overdue: raw.Overdue}
		if raw.RepaymentPlan != nil {
			l.RepaymentPlan = label(raw.RepaymentPlan.Description)
			if l.RepaymentPlan == "" {
				l.RepaymentPlan = label(raw.RepaymentPlan.Type)
			}
		}
		if err := amounts(cur,
			[]**int64{&l.NextPaymentMinor, &l.LastPaymentMinor, &l.OriginalMinor, &l.YTDInterestMinor, &l.YTDPrincipalMinor},
			[]*json.Number{raw.MinimumPayment, raw.LastPaymentAmount, raw.OriginalAmount, raw.YTDInterest, raw.YTDPrincipal}); err != nil {
			return res, err
		}
		res.Loans = append(res.Loans, l)
	}
	for _, raw := range out.Liabilities.Mortgage {
		id := deref(raw.AccountID)
		cur, ok := currency[id]
		if id == "" || !ok {
			continue
		}
		l := Loan{PlaidAccountID: id, Kind: "mortgage", NextDueDate: date(raw.NextDueDate),
			LastPaymentDate: date(raw.LastPaymentDate), PayoffDate: date(raw.MaturityDate),
			OriginationDate: date(raw.OriginationDate), Term: label(raw.LoanTerm)}
		if raw.InterestRate != nil {
			l.RatePercent = rate(raw.InterestRate.Percentage)
			if t := strings.ToLower(deref(raw.InterestRate.Type)); t == "fixed" || t == "variable" {
				l.RateType = t
			}
		}
		if err := amounts(cur,
			[]**int64{&l.NextPaymentMinor, &l.LastPaymentMinor, &l.OriginalMinor, &l.PastDueMinor, &l.YTDInterestMinor, &l.YTDPrincipalMinor},
			[]*json.Number{raw.NextMonthlyPayment, raw.LastPaymentAmount, raw.OriginalAmount, raw.PastDueAmount, raw.YTDInterest, raw.YTDPrincipal}); err != nil {
			return res, err
		}
		// Mortgages have no overdue flag: an amount past due means overdue.
		if l.PastDueMinor != nil {
			overdue := *l.PastDueMinor > 0
			l.Overdue = &overdue
		}
		res.Loans = append(res.Loans, l)
	}
	return res, nil
}

// rate keeps a percentage exactly ("5.25") if it's plausible, else "".
func rate(n *json.Number) string {
	if n == nil || !percentRE.MatchString(n.String()) {
		return ""
	}
	return n.String()
}

// label keeps a short display text from the bank: printable, at most 60
// characters. Anything else is dropped.
func label(s *string) string {
	if s == nil {
		return ""
	}
	t := strings.TrimSpace(*s)
	if t == "" || len([]rune(t)) > 60 || strings.IndexFunc(t, func(r rune) bool { return !unicode.IsPrint(r) }) >= 0 {
		return ""
	}
	return t
}

// date keeps a YYYY-MM-DD date and drops anything else.
func date(s *string) string {
	if s == nil || !dateRE.MatchString(*s) {
		return ""
	}
	return *s
}
