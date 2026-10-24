package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

// Export is everything Tallyn holds about one person (#54): their own rows
// only. Everything is read as that person (RLS on) and every query also
// filters to rows they own, because RLS lets them read money others share
// with them, which never belongs in their download. No Plaid tokens, sync
// cursors, encrypted values or backup-code hashes are read at all.
type Export struct {
	ExportedAt   time.Time           `json:"exported_at"`
	Profile      ExportProfile       `json:"profile"`
	Households   []ExportHousehold   `json:"households"`
	Banks        []ExportBank        `json:"banks"`
	Accounts     []ExportAccount     `json:"accounts"`
	Transactions []ExportTransaction `json:"transactions"`
	CreditCards  []ExportCreditCard  `json:"credit_cards"`
	Loans        []ExportLoan        `json:"loans"`
	Budgets      []ExportBudget      `json:"budgets"`
	Sharing      []ExportShare       `json:"sharing"`
	Agreements   []ExportAgreement   `json:"agreements"`
	BackupCodes  ExportBackupCodes   `json:"backup_codes"`
}

type ExportProfile struct {
	Name     string    `json:"name"`
	Email    string    `json:"email"` // from the sign-in token, filled in by the API
	JoinedAt time.Time `json:"joined_at"`
}

type ExportHousehold struct {
	Name              string    `json:"name"`
	HomeCurrency      string    `json:"home_currency"`
	Role              string    `json:"role"`
	CountMySpending   bool      `json:"count_my_spending_in_budgets"`
	JoinedHouseholdAt time.Time `json:"joined_at"`
}

type ExportBank struct {
	Household    string     `json:"household"`
	Institution  *string    `json:"institution"`
	Status       string     `json:"status"`
	LinkedAt     time.Time  `json:"linked_at"`
	LastSyncedAt *time.Time `json:"last_synced_at"`
}

type ExportAccount struct {
	Household             string     `json:"household"`
	Bank                  *string    `json:"bank"`
	Name                  string     `json:"name"`
	OfficialName          *string    `json:"official_name"`
	LastDigits            *string    `json:"last_digits"`
	Type                  string     `json:"type"`
	Subtype               *string    `json:"subtype"`
	Currency              string     `json:"currency"`
	CurrentBalanceMinor   *int64     `json:"current_balance_minor"`
	AvailableBalanceMinor *int64     `json:"available_balance_minor"`
	CreditLimitMinor      *int64     `json:"credit_limit_minor"`
	BalanceUpdatedAt      *time.Time `json:"balance_updated_at"`
}

// ExportTransaction keeps Plaid's sign: a positive amount is money out.
type ExportTransaction struct {
	Date             time.Time  `json:"date"`
	AuthorizedDate   *time.Time `json:"authorized_date"`
	Name             string     `json:"name"`
	Merchant         *string    `json:"merchant"`
	AmountMinor      int64      `json:"amount_minor"`
	Currency         string     `json:"currency"`
	Category         *string    `json:"category"`
	CategoryDetailed *string    `json:"category_detailed"`
	Channel          *string    `json:"payment_channel"`
	Pending          bool       `json:"pending"`
	Account          string     `json:"account"`
	AccountDigits    *string    `json:"account_last_digits"`
	PaidAt           *time.Time `json:"paid_at"`
	PostedAt         *time.Time `json:"posted_at"`
	Address          *string    `json:"address"`
	City             *string    `json:"city"`
	Region           *string    `json:"region"`
	PostalCode       *string    `json:"postal_code"`
	Country          *string    `json:"country"`
	Lat              *float64   `json:"lat"`
	Lon              *float64   `json:"lon"`
}

type ExportCreditCard struct {
	Account                   string          `json:"account"`
	AccountDigits             *string         `json:"account_last_digits"`
	APRs                      json.RawMessage `json:"aprs"`
	MinimumPaymentMinor       *int64          `json:"minimum_payment_minor"`
	NextPaymentDueDate        *time.Time      `json:"next_payment_due_date"`
	LastStatementBalanceMinor *int64          `json:"last_statement_balance_minor"`
	LastStatementDate         *time.Time      `json:"last_statement_date"`
	LastPaymentMinor          *int64          `json:"last_payment_minor"`
	LastPaymentDate           *time.Time      `json:"last_payment_date"`
	Overdue                   *bool           `json:"overdue"`
}

type ExportLoan struct {
	Account            string     `json:"account"`
	AccountDigits      *string    `json:"account_last_digits"`
	Kind               *string    `json:"kind"`
	RatePercent        *float64   `json:"rate_percent"`
	RateType           *string    `json:"rate_type"`
	NextPaymentMinor   *int64     `json:"next_payment_minor"`
	NextPaymentDueDate *time.Time `json:"next_payment_due_date"`
	LastPaymentMinor   *int64     `json:"last_payment_minor"`
	LastPaymentDate    *time.Time `json:"last_payment_date"`
	PayoffDate         *time.Time `json:"payoff_date"`
	OriginalMinor      *int64     `json:"original_minor"`
	OriginationDate    *time.Time `json:"origination_date"`
	PastDueMinor       *int64     `json:"past_due_minor"`
	Overdue            *bool      `json:"overdue"`
	InterestThisYear   *int64     `json:"ytd_interest_minor"`
	PrincipalThisYear  *int64     `json:"ytd_principal_minor"`
	RepaymentPlan      *string    `json:"repayment_plan"`
	Term               *string    `json:"term"`
}

// ExportBudget is a budget the person made. For is "household", "you", or
// the name of the member it's for. No category means all spending.
type ExportBudget struct {
	Household   string    `json:"household"`
	For         string    `json:"for"`
	Category    *string   `json:"category"`
	Period      string    `json:"period"`
	AmountMinor int64     `json:"amount_minor"`
	Currency    string    `json:"currency"`
	CreatedAt   time.Time `json:"created_at"`
}

// ExportShare is something the person shares with someone else.
type ExportShare struct {
	Household  string    `json:"household"`
	SharedWith string    `json:"shared_with"`
	What       string    `json:"what"` // balances, transactions or whereabouts
	Since      time.Time `json:"since"`
}

type ExportAgreement struct {
	Document   string    `json:"document"`
	Version    string    `json:"version"`
	AcceptedAt time.Time `json:"accepted_at"`
}

type ExportBackupCodes struct {
	Left   int        `json:"left"`
	MadeAt *time.Time `json:"made_at"`
}

// Export reads userID's own data as userID (#54). The email is added by the
// API from the sign-in token.
func (d *DB) Export(ctx context.Context, userID string) (Export, error) {
	e := Export{ExportedAt: time.Now().UTC()}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `select display_name, created_at from public.profiles where id = $1`, userID).
			Scan(&e.Profile.Name, &e.Profile.JoinedAt)
		if err != nil {
			return err
		}
		if e.Households, err = collect[ExportHousehold](tx.Query(ctx, `
			select h.name, h.home_currency, m.role, m.count_in_budgets, m.created_at
			from public.household_members m join public.households h on h.id = m.household_id
			where m.user_id = $1 order by m.created_at`, userID)); err != nil {
			return err
		}
		if e.Banks, err = collect[ExportBank](tx.Query(ctx, `
			select h.name, p.institution_name, p.status, p.created_at, p.last_synced_at
			from public.plaid_items p join public.households h on h.id = p.household_id
			where p.owner_user_id = $1 order by p.created_at`, userID)); err != nil {
			return err
		}
		if e.Accounts, err = collect[ExportAccount](tx.Query(ctx, `
			select h.name, p.institution_name, a.name, a.official_name, a.mask, a.type, a.subtype, a.currency,
			       a.current_balance_minor, a.available_balance_minor, a.credit_limit_minor, a.balance_updated_at
			from public.accounts a
			join public.plaid_items p on p.id = a.plaid_item_id
			join public.households h on h.id = a.household_id
			where a.owner_user_id = $1 order by a.created_at`, userID)); err != nil {
			return err
		}
		if e.Transactions, err = collect[ExportTransaction](tx.Query(ctx, `
			select t.date, t.authorized_date, t.name, t.merchant_name, t.amount_minor, t.currency,
			       t.category_primary, t.category_detailed, t.payment_channel, t.pending, a.name, a.mask,
			       d.authorized_at, d.posted_at, d.address, d.city, d.region, d.postal_code, d.country, d.lat, d.lon
			from public.transactions t
			join public.accounts a on a.id = t.account_id
			left join public.transaction_details d on d.transaction_id = t.id
			where a.owner_user_id = $1 order by t.date desc, t.created_at desc`, userID)); err != nil {
			return err
		}
		if e.CreditCards, err = collect[ExportCreditCard](tx.Query(ctx, `
			select a.name, a.mask, c.aprs, c.minimum_payment_minor, c.next_payment_due_date,
			       c.last_statement_balance_minor, c.last_statement_date, c.last_payment_minor, c.last_payment_date, c.is_overdue
			from public.credit_cards c join public.accounts a on a.id = c.account_id
			where a.owner_user_id = $1 order by a.created_at`, userID)); err != nil {
			return err
		}
		if e.Loans, err = collect[ExportLoan](tx.Query(ctx, `
			select a.name, a.mask, l.kind, l.rate_percent::float8, l.rate_type, l.next_payment_minor, l.next_payment_due_date,
			       l.last_payment_minor, l.last_payment_date, l.payoff_date, l.original_minor, l.origination_date,
			       l.past_due_minor, l.is_overdue, l.ytd_interest_minor, l.ytd_principal_minor, l.repayment_plan, l.term
			from public.loans l join public.accounts a on a.id = l.account_id
			where a.owner_user_id = $1 order by a.created_at`, userID)); err != nil {
			return err
		}
		if e.Budgets, err = collect[ExportBudget](tx.Query(ctx, `
			select h.name,
			       case when b.member_user_id is null then 'household'
			            when b.member_user_id = $1 then 'you'
			            else coalesce(nullif(p.display_name, ''), 'a member') end,
			       b.category, b.period, b.amount_minor, b.currency, b.created_at
			from public.budgets b
			join public.households h on h.id = b.household_id
			left join public.profiles p on p.id = b.member_user_id
			where b.created_by = $1 order by b.created_at`, userID)); err != nil {
			return err
		}
		if e.Sharing, err = collect[ExportShare](tx.Query(ctx, `
			select h.name, coalesce(nullif(p.display_name, ''), 'a member'), s.category, s.created_at
			from public.shares s
			join public.households h on h.id = s.household_id
			left join public.profiles p on p.id = s.viewer_user_id
			where s.owner_user_id = $1 order by s.created_at`, userID)); err != nil {
			return err
		}
		if e.Agreements, err = collect[ExportAgreement](tx.Query(ctx, `
			select document, version, accepted_at from public.consents
			where user_id = $1 order by accepted_at`, userID)); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `
			select count(*) filter (where used_at is null), max(created_at)
			from public.backup_codes where user_id = $1`, userID).Scan(&e.BackupCodes.Left, &e.BackupCodes.MadeAt)
	})
	return e, err
}

// collect reads every row of one export query into T, column by column.
// An empty result is an empty list, never null, so the JSON is predictable.
func collect[T any](rows pgx.Rows, err error) ([]T, error) {
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[T])
	if list == nil {
		list = []T{}
	}
	return list, err
}
