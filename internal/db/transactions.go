package db

import (
	"context"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Transaction is a transaction as the user sees it. Amounts are minor units,
// Plaid's sign: positive = money out, negative = money in.
type Transaction struct {
	ID               string       `json:"id"`
	AccountID        string       `json:"account_id"`
	AccountName      string       `json:"account_name"`
	OwnerUserID      string       `json:"owner_user_id"`
	AmountMinor      int64        `json:"amount_minor"`
	Currency         string       `json:"currency"`
	Date             string       `json:"date"`
	AuthorizedDate   *string      `json:"authorized_date"`
	Merchant         string       `json:"merchant"`
	CategoryPrimary  *string      `json:"category_primary"`
	CategoryDetailed *string      `json:"category_detailed"`
	Pending          bool         `json:"pending"`
	PaymentChannel   *string      `json:"payment_channel"`
	LogoURL          *string      `json:"logo_url"`    // Plaid's logo hosts only (0009)
	Whereabouts      *Whereabouts `json:"whereabouts"` // nil when unknown or not visible to this user
}

// Whereabouts is when and where a purchase happened. Visible to the person who
// made it, parents for their kids, and members it was shared with
// (can_see_member_data in 0007_sharing.sql).
type Whereabouts struct {
	AuthorizedAt *time.Time `json:"authorized_at"`
	PostedAt     *time.Time `json:"posted_at"`
	Address      *string    `json:"address"`
	City         *string    `json:"city"`
	Region       *string    `json:"region"`
	PostalCode   *string    `json:"postal_code"`
	Country      *string    `json:"country"`
	Lat          *float64   `json:"lat"`
	Lon          *float64   `json:"lon"`
	StoreNumber  *string    `json:"store_number"`
}

// TxFilter narrows a transactions list (#42). Empty fields don't filter.
type TxFilter struct {
	Owner    string // a member's user ID: only their transactions
	Query    string // part of the merchant name, any case
	Category string // a Plaid primary category, e.g. FOOD_AND_DRINK
	Month    string // "2026-10": posted that month, the same date Spending uses
	Limit    int    // 1-100, default 50
	Offset   int    // for "Show more"
}

var categoryRE = regexp.MustCompile(`^[A-Z_]{1,60}$`)

// filterSQL is the WHERE clause shared by Transactions and Summary, so the
// list and its totals always agree: $1 is the household, then the filter's
// arguments from args.
const filterSQL = `t.household_id = $1
			  and ($2 = '' or public.transaction_owner(t.account_id) = nullif($2, '')::uuid)
			  and ($3 = '%%' or coalesce(t.merchant_name, t.name) ilike $3)
			  and ($4 = '' or t.category_primary = $4)
			  and ($5::date is null or t.date >= $5::date)
			  and ($6::date is null or t.date < $6::date)`

// args checks the filter and returns the arguments for filterSQL after the
// household ($2 to $6), or ErrInvalid.
func (f TxFilter) args() ([]any, error) {
	if f.Owner != "" && !uuidRE.MatchString(f.Owner) {
		return nil, ErrInvalid
	}
	if f.Category != "" && !categoryRE.MatchString(f.Category) {
		return nil, ErrInvalid
	}
	if len([]rune(f.Query)) > 100 {
		return nil, ErrInvalid
	}
	var from, to *string
	if f.Month != "" {
		if !monthRE.MatchString(f.Month) {
			return nil, ErrInvalid
		}
		start, err := time.Parse("2006-01", f.Month)
		if err != nil {
			return nil, ErrInvalid
		}
		a, b := start.Format(time.DateOnly), start.AddDate(0, 1, 0).Format(time.DateOnly)
		from, to = &a, &b
	}
	// The search text is a plain substring: escape LIKE's wildcards.
	like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(strings.TrimSpace(f.Query)) + "%"
	return []any{f.Owner, like, f.Category, from, to}, nil
}

// Transactions lists the household's transactions that userID may see,
// newest first, one page at a time. RLS decides which rows and which
// whereabouts come back; filters only narrow that. more reports whether
// another page exists.
func (d *DB) Transactions(ctx context.Context, userID, householdID string, f TxFilter) (list []Transaction, more bool, err error) {
	list = []Transaction{}
	if !uuidRE.MatchString(householdID) {
		return list, false, nil
	}
	fargs, err := f.args()
	if err != nil {
		return list, false, err
	}
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	if f.Offset < 0 || f.Offset > 10000 {
		return list, false, ErrInvalid
	}
	args := append([]any{householdID}, fargs...)
	args = append(args, f.Limit+1, f.Offset)

	err = d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select t.id, t.account_id, coalesce(a.name, ''), coalesce(o.owner::text, ''), t.amount_minor, t.currency,
			       t.date::text, t.authorized_date::text, coalesce(t.merchant_name, t.name),
			       t.category_primary, t.category_detailed, t.pending, t.payment_channel, t.logo_url,
			       d.transaction_id is not null,
			       d.authorized_at, d.posted_at, d.address, d.city, d.region, d.postal_code, d.country,
			       d.lat, d.lon, d.store_number
			from public.transactions t
			-- left join: transactions can be shared without balances, so the
			-- account itself may be hidden (0007_sharing.sql)
			left join public.accounts a on a.id = t.account_id
			left join public.transaction_details d on d.transaction_id = t.id
			cross join lateral (select public.transaction_owner(t.account_id) as owner) o
			where `+filterSQL+`
			order by t.date desc, t.created_at desc, t.id
			limit $7 offset $8`, args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var t Transaction
			var visible bool
			var w Whereabouts
			if err := rows.Scan(&t.ID, &t.AccountID, &t.AccountName, &t.OwnerUserID, &t.AmountMinor, &t.Currency,
				&t.Date, &t.AuthorizedDate, &t.Merchant, &t.CategoryPrimary, &t.CategoryDetailed, &t.Pending, &t.PaymentChannel,
				&t.LogoURL, &visible, &w.AuthorizedAt, &w.PostedAt, &w.Address, &w.City, &w.Region, &w.PostalCode, &w.Country,
				&w.Lat, &w.Lon, &w.StoreNumber); err != nil {
				return err
			}
			if visible {
				t.Whereabouts = &w
			}
			list = append(list, t)
		}
		return rows.Err()
	})
	if len(list) > f.Limit {
		list, more = list[:f.Limit], true
	}
	return list, more, err
}

// Spend is money out in one category and currency.
type Spend struct {
	Category    string `json:"category"`
	Currency    string `json:"currency"`
	AmountMinor int64  `json:"amount_minor"`
	Count       int    `json:"count"`
}

var monthRE = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// Spending sums money out by category for one month ("2026-10"), over the
// transactions userID may see. Income, transfers between accounts and credit
// card payments aren't spending (a card payment would count the purchases twice).
// Currencies are kept apart until conversion exists (#11).
func (d *DB) Spending(ctx context.Context, userID, householdID, month string) ([]Spend, error) {
	list := []Spend{}
	if !uuidRE.MatchString(householdID) || !monthRE.MatchString(month) {
		return list, ErrInvalid
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select coalesce(category_primary, 'OTHER'), currency, sum(amount_minor)::bigint, count(*)::int
			from public.transactions
			where household_id = $1
			  and date >= ($2 || '-01')::date and date < ($2 || '-01')::date + interval '1 month'
			  and amount_minor > 0
			  and coalesce(category_primary, '') not in ('INCOME', 'TRANSFER_IN', 'TRANSFER_OUT')
			  and coalesce(category_detailed, '') <> 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
			group by 1, 2
			order by 3 desc, 1`, householdID, month)
		if err != nil {
			return err
		}
		list, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Spend])
		return err
	})
	return list, err
}

// TxSummary totals the transactions matching a filter, in one currency
// (#58). Same rules as Spending: income and refunds are money in; transfers
// between accounts and credit card payments aren't spending.
type TxSummary struct {
	Currency       string          `json:"currency"`
	MoneyInMinor   int64           `json:"money_in_minor"`
	SpentMinor     int64           `json:"spent_minor"`
	TransfersMinor int64           `json:"transfers_minor"` // moved out to other accounts and card payments
	Categories     []Spend         `json:"categories"`      // spending by category, biggest first
	Merchants      []MerchantSpend `json:"merchants"`       // top five by spending
}

// MerchantSpend is spending at one merchant.
type MerchantSpend struct {
	Merchant    string `json:"merchant"`
	AmountMinor int64  `json:"amount_minor"`
	Count       int    `json:"count"`
}

// kindSQL sorts a transaction into transfer, spent or in (Plaid: positive
// amount = money out).
const kindSQL = `case
			  when coalesce(t.category_primary, '') in ('TRANSFER_IN', 'TRANSFER_OUT')
			    or coalesce(t.category_detailed, '') = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' then 'transfer'
			  when t.amount_minor > 0 and coalesce(t.category_primary, '') <> 'INCOME' then 'spent'
			  when t.amount_minor < 0 then 'in'
			  else 'other' end`

// Summary totals every transaction userID may see that matches f, not just
// one page, per currency. RLS decides what's visible, as for Transactions.
func (d *DB) Summary(ctx context.Context, userID, householdID string, f TxFilter) ([]TxSummary, error) {
	out := []TxSummary{}
	if !uuidRE.MatchString(householdID) {
		return out, nil
	}
	fargs, err := f.args()
	if err != nil {
		return out, err
	}
	args := append([]any{householdID}, fargs...)

	// Transfers are counted separately below: only what moved out, since money
	// moved in from your own accounts isn't new money.
	err = d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		byCur := map[string]*TxSummary{}
		get := func(cur string) *TxSummary {
			if byCur[cur] == nil {
				byCur[cur] = &TxSummary{Currency: cur, Categories: []Spend{}, Merchants: []MerchantSpend{}}
			}
			return byCur[cur]
		}

		rows, err := tx.Query(ctx, `
			select t.currency, `+kindSQL+` as kind, sum(abs(t.amount_minor))::bigint
			from public.transactions t
			where `+filterSQL+`
			group by 1, 2`, args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var cur, kind string
			var amt int64
			if err := rows.Scan(&cur, &kind, &amt); err != nil {
				return err
			}
			s := get(cur)
			switch kind {
			case "spent":
				s.SpentMinor = amt
			case "in":
				s.MoneyInMinor = amt
			}
		}
		if err := rows.Err(); err != nil {
			return err
		}

		rows, err = tx.Query(ctx, `
			select t.currency, sum(t.amount_minor)::bigint
			from public.transactions t
			where `+filterSQL+` and (`+kindSQL+`) = 'transfer' and t.amount_minor > 0
			group by 1`, args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var cur string
			var amt int64
			if err := rows.Scan(&cur, &amt); err != nil {
				return err
			}
			get(cur).TransfersMinor = amt
		}
		if err := rows.Err(); err != nil {
			return err
		}

		rows, err = tx.Query(ctx, `
			select coalesce(t.category_primary, 'OTHER'), t.currency, sum(t.amount_minor)::bigint, count(*)::int
			from public.transactions t
			where `+filterSQL+` and (`+kindSQL+`) = 'spent'
			group by 1, 2
			order by 3 desc, 1`, args...)
		if err != nil {
			return err
		}
		cats, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Spend])
		if err != nil {
			return err
		}
		for _, c := range cats {
			s := get(c.Currency)
			s.Categories = append(s.Categories, c)
		}

		rows, err = tx.Query(ctx, `
			select currency, merchant, amount, n from (
			  select t.currency, coalesce(t.merchant_name, t.name) as merchant,
			         sum(t.amount_minor)::bigint as amount, count(*)::int as n,
			         row_number() over (partition by t.currency order by sum(t.amount_minor) desc, coalesce(t.merchant_name, t.name)) as rank
			  from public.transactions t
			  where `+filterSQL+` and (`+kindSQL+`) = 'spent'
			  group by 1, 2
			) m where rank <= 5
			order by currency, amount desc, merchant`, args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var cur string
			var m MerchantSpend
			if err := rows.Scan(&cur, &m.Merchant, &m.AmountMinor, &m.Count); err != nil {
				return err
			}
			s := get(cur)
			s.Merchants = append(s.Merchants, m)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		for _, s := range byCur {
			out = append(out, *s)
		}
		slices.SortFunc(out, func(a, b TxSummary) int { return strings.Compare(a.Currency, b.Currency) })
		return nil
	})
	return out, err
}
