package db

import (
	"context"
	"regexp"
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
	Whereabouts      *Whereabouts `json:"whereabouts"` // nil when unknown or not visible to this user
}

// Whereabouts is when and where a purchase happened. Visible only to the
// person who made it, plus household owners for teens and children
// (can_see_whereabouts in 0005_bank_sync.sql).
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

// Transactions lists the household's most recent transactions that userID may
// see, newest first. RLS decides which rows, and which whereabouts, come back.
func (d *DB) Transactions(ctx context.Context, userID, householdID string, limit int) ([]Transaction, error) {
	list := []Transaction{}
	if !uuidRE.MatchString(householdID) {
		return list, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select t.id, t.account_id, a.name, a.owner_user_id, t.amount_minor, t.currency,
			       t.date::text, t.authorized_date::text, coalesce(t.merchant_name, t.name),
			       t.category_primary, t.category_detailed, t.pending, t.payment_channel,
			       d.transaction_id is not null,
			       d.authorized_at, d.posted_at, d.address, d.city, d.region, d.postal_code, d.country,
			       d.lat, d.lon, d.store_number
			from public.transactions t
			join public.accounts a on a.id = t.account_id
			left join public.transaction_details d on d.transaction_id = t.id
			where t.household_id = $1
			order by t.date desc, t.created_at desc, t.id
			limit $2`, householdID, limit)
		if err != nil {
			return err
		}
		for rows.Next() {
			var t Transaction
			var visible bool
			var w Whereabouts
			if err := rows.Scan(&t.ID, &t.AccountID, &t.AccountName, &t.OwnerUserID, &t.AmountMinor, &t.Currency,
				&t.Date, &t.AuthorizedDate, &t.Merchant, &t.CategoryPrimary, &t.CategoryDetailed, &t.Pending, &t.PaymentChannel,
				&visible, &w.AuthorizedAt, &w.PostedAt, &w.Address, &w.City, &w.Region, &w.PostalCode, &w.Country,
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
	return list, err
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
