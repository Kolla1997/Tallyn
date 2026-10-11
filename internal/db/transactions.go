package db

import (
	"context"
	"regexp"
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

// Transactions lists the household's transactions that userID may see,
// newest first, one page at a time. RLS decides which rows and which
// whereabouts come back; filters only narrow that. more reports whether
// another page exists.
func (d *DB) Transactions(ctx context.Context, userID, householdID string, f TxFilter) (list []Transaction, more bool, err error) {
	list = []Transaction{}
	if !uuidRE.MatchString(householdID) {
		return list, false, nil
	}
	if f.Owner != "" && !uuidRE.MatchString(f.Owner) {
		return list, false, ErrInvalid
	}
	if f.Category != "" && !categoryRE.MatchString(f.Category) {
		return list, false, ErrInvalid
	}
	if len([]rune(f.Query)) > 100 {
		return list, false, ErrInvalid
	}
	var from, to *string
	if f.Month != "" {
		if !monthRE.MatchString(f.Month) {
			return list, false, ErrInvalid
		}
		start, err := time.Parse("2006-01", f.Month)
		if err != nil {
			return list, false, ErrInvalid
		}
		a, b := start.Format(time.DateOnly), start.AddDate(0, 1, 0).Format(time.DateOnly)
		from, to = &a, &b
	}
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	if f.Offset < 0 || f.Offset > 10000 {
		return list, false, ErrInvalid
	}
	// The search text is a plain substring: escape LIKE's wildcards.
	like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(strings.TrimSpace(f.Query)) + "%"

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
			where t.household_id = $1
			  and ($2 = '' or o.owner = nullif($2, '')::uuid)
			  and ($3 = '%%' or coalesce(t.merchant_name, t.name) ilike $3)
			  and ($4 = '' or t.category_primary = $4)
			  and ($7::date is null or t.date >= $7::date)
			  and ($8::date is null or t.date < $8::date)
			order by t.date desc, t.created_at desc, t.id
			limit $5 offset $6`, householdID, f.Owner, like, f.Category, f.Limit+1, f.Offset, from, to)
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
