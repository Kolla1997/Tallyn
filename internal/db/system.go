package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Kolla1997/Tallyn/internal/plaid"
)

// System is the bank sync's database access (ADR 0005, ADR 0006). It has its
// own pool and login (DATABASE_URL_SYNC, as tallyn_sync), separate from the
// API's: tallyn_sync works across households, reading encrypted tokens and
// writing accounts and transactions, and nothing else.
//
// Only cmd/server opens a *System, and only internal/sync gets it. Request
// handlers only have *DB and AsUser, whose login can't reach tallyn_sync.
type System struct {
	pool *pgxpool.Pool
}

// OpenSystem connects to syncURL (DATABASE_URL_SYNC) and checks that it logs
// in as a role that can become tallyn_sync and can't bypass RLS or become
// authenticated.
func OpenSystem(ctx context.Context, syncURL string) (*System, error) {
	pool, err := openPool(ctx, "DATABASE_URL_SYNC", syncURL)
	if err != nil {
		return nil, err
	}
	l, err := describeLogin(ctx, pool)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: check DATABASE_URL_SYNC login: %w", err)
	}
	var problem string
	switch {
	case l.superuser || l.bypassRLS:
		problem = "can bypass row-level security"
	case !l.canBeSync:
		problem = "can't become tallyn_sync"
	case l.canBeAuthenticated:
		problem = "can become authenticated"
	}
	if problem != "" {
		pool.Close()
		return nil, fmt.Errorf("%w: DATABASE_URL_SYNC logs in as %q, which %s; use the tallyn_sync login", ErrUnsafeLogin, l.name, problem)
	}
	return &System{pool: pool}, nil
}

// Close closes the sync's connections.
func (s *System) Close() { s.pool.Close() }

func (s *System) as(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// LOCAL: ends with the transaction, like AsUser.
		if _, err := tx.Exec(ctx, "set local role tallyn_sync"); err != nil {
			return fmt.Errorf("db: set sync role: %w", err)
		}
		return fn(tx)
	})
}

// SyncItem is a bank the sync works on. Sealed is the encrypted access token.
type SyncItem struct {
	ID          string
	PlaidItemID string
	Sealed      []byte
	Cursor      string
	Status      string
	// When card details were last fetched (#27); nil if never.
	LiabilitiesSyncedAt *time.Time
}

// ErrStaleCursor means another sync saved this bank since we read it. The
// result is dropped; the next run starts from the newer cursor.
var ErrStaleCursor = errors.New("db: bank was synced by someone else meanwhile")

const syncItemCols = `id, plaid_item_id, access_token_encrypted, coalesce(transactions_cursor, ''), status, liabilities_synced_at`

// ItemsToSync lists the banks to sync: active ones only. Banks that need the
// person to log in again, or that were disconnected, are skipped.
func (s *System) ItemsToSync(ctx context.Context) ([]SyncItem, error) {
	var items []SyncItem
	err := s.as(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select `+syncItemCols+` from public.plaid_items where status = 'active' order by last_synced_at nulls first, id`)
		if err != nil {
			return err
		}
		items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[SyncItem])
		return err
	})
	return items, err
}

// Item returns one bank by its plaid_items.id, whatever its status.
func (s *System) Item(ctx context.Context, id string) (SyncItem, error) {
	var it SyncItem
	if !uuidRE.MatchString(id) {
		return it, ErrNotFound
	}
	err := s.as(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select `+syncItemCols+` from public.plaid_items where id = $1`, id)
		if err != nil {
			return err
		}
		it, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[SyncItem])
		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return it, ErrNotFound
	}
	return it, err
}

// SetStatus marks a bank active, needs_reauth or disconnected.
func (s *System) SetStatus(ctx context.Context, id, status string) error {
	return s.as(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `update public.plaid_items set status = $2 where id = $1`, id, status)
		return mapErr(err)
	})
}

// SyncStats counts what a save changed.
type SyncStats struct {
	Upserted, Removed, Skipped int
}

// SaveSync applies one complete sync result for item in a single database
// transaction: balances, added and changed transactions with their time and
// location, removed transactions, and the new cursor. Either all of it is
// saved or none of it. If the bank's cursor changed since item was read,
// nothing is saved and ErrStaleCursor is returned.
func (s *System) SaveSync(ctx context.Context, item SyncItem, r plaid.SyncResult) (SyncStats, error) {
	var st SyncStats
	err := s.as(ctx, func(tx pgx.Tx) error {
		var household, owner, cursor string
		err := tx.QueryRow(ctx, `select household_id, owner_user_id, coalesce(transactions_cursor, '')
			from public.plaid_items where id = $1 for update`, item.ID).Scan(&household, &owner, &cursor)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound // unlinked while we were syncing
		}
		if err != nil {
			return err
		}
		if cursor != item.Cursor {
			return ErrStaleCursor
		}

		b := &pgx.Batch{}
		queueAccounts(b, household, owner, item.ID, r.Accounts)
		if err := tx.SendBatch(ctx, b).Close(); err != nil {
			return mapErr(err)
		}

		accounts := map[string]string{}
		rows, err := tx.Query(ctx, `select plaid_account_id, id from public.accounts where plaid_item_id = $1`, item.ID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var pid, id string
			if err := rows.Scan(&pid, &id); err != nil {
				return err
			}
			accounts[pid] = id
		}
		if err := rows.Err(); err != nil {
			return err
		}

		b = &pgx.Batch{}
		for _, list := range [][]plaid.Transaction{r.Added, r.Modified} {
			for _, t := range list {
				acct, ok := accounts[t.PlaidAccountID]
				if !ok {
					st.Skipped++
					continue
				}
				st.Upserted++
				queueTransaction(b, household, acct, t)
			}
		}
		if len(r.Removed) > 0 {
			b.Queue(`delete from public.transactions
				where plaid_transaction_id = any($1)
				  and account_id in (select id from public.accounts where plaid_item_id = $2)`, r.Removed, item.ID)
		}
		b.Queue(`update public.plaid_items
			set transactions_cursor = $2, last_synced_at = now(), status = 'active'
			where id = $1`, item.ID, r.NextCursor)
		if err := tx.SendBatch(ctx, b).Close(); err != nil {
			return mapErr(err)
		}
		st.Removed = len(r.Removed)
		st.Skipped += r.Skipped
		return nil
	})
	return st, err
}

// queueAccounts queues balances and limits, and accounts the bank added since
// linking. The WHERE stops an account ID from another bank ever being taken over.
func queueAccounts(b *pgx.Batch, household, owner, itemID string, accounts []plaid.Account) {
	for _, a := range accounts {
		b.Queue(`insert into public.accounts
			(household_id, plaid_item_id, owner_user_id, plaid_account_id, name, official_name, mask, type, subtype,
			 currency, current_balance_minor, available_balance_minor, credit_limit_minor, balance_updated_at)
			values ($1, $2, $3, $4, $5, nullif($6, ''), nullif($7, ''), $8, nullif($9, ''), $10, $11, $12, $13, now())
			on conflict (plaid_account_id) do update set
			  name = excluded.name, official_name = excluded.official_name, mask = excluded.mask,
			  type = excluded.type, subtype = excluded.subtype, currency = excluded.currency,
			  current_balance_minor = excluded.current_balance_minor,
			  available_balance_minor = excluded.available_balance_minor,
			  credit_limit_minor = excluded.credit_limit_minor,
			  balance_updated_at = now()
			where accounts.plaid_item_id = excluded.plaid_item_id`,
			household, itemID, owner, a.PlaidAccountID, a.Name, a.OfficialName, a.Mask, a.Type, a.Subtype,
			a.Currency, a.CurrentMinor, a.AvailableMinor, nonNegative(a.LimitMinor))
	}
}

// SaveAccounts saves a bank's current balances and limits on their own (#27):
// the transaction sync only sends them along with new transactions, so the
// sync also asks for them about once a day.
func (s *System) SaveAccounts(ctx context.Context, item SyncItem, accounts []plaid.Account) error {
	return s.as(ctx, func(tx pgx.Tx) error {
		var household, owner string
		err := tx.QueryRow(ctx, `select household_id, owner_user_id from public.plaid_items where id = $1 for update`, item.ID).Scan(&household, &owner)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		b := &pgx.Batch{}
		queueAccounts(b, household, owner, item.ID, accounts)
		return mapErr(tx.SendBatch(ctx, b).Close())
	})
}

// nonNegative drops a negative limit, which no bank should send.
func nonNegative(v *int64) *int64 {
	if v == nil || *v < 0 {
		return nil
	}
	return v
}

// SaveCreditCards replaces a bank's credit card details (#27) with cards, and
// records that they were fetched now. Cards whose account isn't in this bank
// are skipped; cards the bank no longer reports are removed. An empty list
// (the bank has no cards, or doesn't support it) clears them.
func (s *System) SaveCreditCards(ctx context.Context, item SyncItem, cards []plaid.CreditCard) error {
	return s.as(ctx, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `select true from public.plaid_items where id = $1 for update`, item.ID).Scan(&exists); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound // unlinked meanwhile
			}
			return err
		}
		b := &pgx.Batch{}
		keep := []string{}
		for _, c := range cards {
			aprs, err := json.Marshal(c.APRs)
			if err != nil {
				return err
			}
			keep = append(keep, c.PlaidAccountID)
			// Only an account of this bank; its household comes from the account.
			b.Queue(`insert into public.credit_cards
				(account_id, household_id, aprs, minimum_payment_minor, next_payment_due_date,
				 last_statement_balance_minor, last_statement_date, last_payment_minor, last_payment_date, is_overdue, updated_at)
				select a.id, a.household_id, $3::jsonb, $4, nullif($5, '')::date, $6, nullif($7, '')::date, $8, nullif($9, '')::date, $10, now()
				from public.accounts a where a.plaid_account_id = $1 and a.plaid_item_id = $2
				on conflict (account_id) do update set
				  aprs = excluded.aprs, minimum_payment_minor = excluded.minimum_payment_minor,
				  next_payment_due_date = excluded.next_payment_due_date,
				  last_statement_balance_minor = excluded.last_statement_balance_minor,
				  last_statement_date = excluded.last_statement_date,
				  last_payment_minor = excluded.last_payment_minor, last_payment_date = excluded.last_payment_date,
				  is_overdue = excluded.is_overdue, updated_at = now()`,
				c.PlaidAccountID, item.ID, string(aprs), nonNegative(c.MinimumMinor), c.NextDueDate,
				c.LastStatementMinor, c.LastStatementDate, c.LastPaymentMinor, c.LastPaymentDate, c.Overdue)
		}
		b.Queue(`delete from public.credit_cards
			where account_id in (select id from public.accounts where plaid_item_id = $1 and not (plaid_account_id = any($2)))`,
			item.ID, keep)
		b.Queue(`update public.plaid_items set liabilities_synced_at = now() where id = $1`, item.ID)
		return mapErr(tx.SendBatch(ctx, b).Close())
	})
}

func queueTransaction(b *pgx.Batch, household, account string, t plaid.Transaction) {
	// The WHERE keeps an existing transaction ID in its own account and household.
	b.Queue(`insert into public.transactions
		(household_id, account_id, plaid_transaction_id, amount_minor, currency, date, authorized_date,
		 name, merchant_name, category_primary, category_detailed, pending, payment_channel, logo_url)
		values ($1, $2, $3, $4, $5, $6::date, nullif($7, '')::date, $8, nullif($9, ''), nullif($10, ''), nullif($11, ''), $12, nullif($13, ''), nullif($14, ''))
		on conflict (plaid_transaction_id) do update set
		  amount_minor = excluded.amount_minor, currency = excluded.currency, date = excluded.date,
		  authorized_date = excluded.authorized_date, name = excluded.name, merchant_name = excluded.merchant_name,
		  category_primary = excluded.category_primary, category_detailed = excluded.category_detailed,
		  pending = excluded.pending, payment_channel = excluded.payment_channel, logo_url = excluded.logo_url
		where transactions.account_id = excluded.account_id`,
		household, account, t.PlaidTransactionID, t.AmountMinor, t.Currency, t.Date, t.AuthorizedDate,
		t.Name, t.MerchantName, t.CategoryPrimary, t.CategoryDetailed, t.Pending, t.PaymentChannel, t.LogoURL)

	// Time and location: replaced on every change, so stale details never linger.
	b.Queue(`delete from public.transaction_details
		where transaction_id = (select id from public.transactions where plaid_transaction_id = $1 and account_id = $2)`,
		t.PlaidTransactionID, account)
	if t.AuthorizedAt == nil && t.PostedAt == nil && t.Location.Empty() {
		return
	}
	l := t.Location
	b.Queue(`insert into public.transaction_details
		(transaction_id, authorized_at, posted_at, address, city, region, postal_code, country, lat, lon, store_number)
		select id, $3, $4, nullif($5, ''), nullif($6, ''), nullif($7, ''), nullif($8, ''), nullif($9, ''), $10, $11, nullif($12, '')
		from public.transactions where plaid_transaction_id = $1 and account_id = $2`,
		t.PlaidTransactionID, account, t.AuthorizedAt, t.PostedAt,
		l.Address, l.City, l.Region, l.PostalCode, l.Country, l.Lat, l.Lon, l.StoreNumber)
}
