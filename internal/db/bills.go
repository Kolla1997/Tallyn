package db

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Bills Plaid can't see (#127, 0029_bills.sql). Only household owners see
// and change them; the database enforces that. Each period a bill is due on
// its due day (the month's last day when shorter); only payments are stored.

// Bill is one bill as set up.
type Bill struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Category    *string `json:"category"`
	AmountMinor int64   `json:"amount_minor"`
	Currency    string  `json:"currency"`
	Varies      bool    `json:"varies"`
	Frequency   string  `json:"frequency"`
	DueDay      int     `json:"due_day"`
	StartsOn    string  `json:"starts_on"` // YYYY-MM
	Paused      bool    `json:"paused"`
	Note        *string `json:"note"`
}

// BillDue is one bill's payment in the month asked for.
type BillDue struct {
	BillID        string     `json:"bill_id"`
	Due           string     `json:"due"`    // YYYY-MM-DD
	Status        string     `json:"status"` // paid, due, late
	ExpectedMinor int64      `json:"expected_minor"`
	PaidMinor     *int64     `json:"paid_minor"`
	PaidOn        *string    `json:"paid_on"`
	Match         *BillMatch `json:"match"` // a bank transaction that may be this payment
}

// BillMatch is a linked-bank transaction that looks like a bill's payment:
// amount within 10% and date within 5 days. Only suggested, never applied.
type BillMatch struct {
	TransactionID string `json:"transaction_id"`
	Name          string `json:"name"`
	AmountMinor   int64  `json:"amount_minor"`
	Date          string `json:"date"`
}

// NewBill is what an owner sets. Currency empty means the household's.
type NewBill struct {
	Name        string `json:"name"`
	Category    string `json:"category"`
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
	Varies      bool   `json:"varies"`
	Frequency   string `json:"frequency"`
	DueDay      int    `json:"due_day"`
	StartsOn    string `json:"starts_on"` // YYYY-MM
	Paused      bool   `json:"paused"`
	Note        string `json:"note"`
}

var billCategories = map[string]bool{"": true, "housing": true, "utilities": true, "insurance": true, "childcare": true, "subscriptions": true, "other": true}

func (b *NewBill) clean() (time.Time, bool) {
	b.Name, b.Note = strings.TrimSpace(b.Name), strings.TrimSpace(b.Note)
	start, err := time.Parse("2006-01", b.StartsOn)
	ok := err == nil && b.Name != "" && utf8.RuneCountInString(b.Name) <= 60 && utf8.RuneCountInString(b.Note) <= 200 &&
		billCategories[b.Category] && b.AmountMinor > 0 && b.AmountMinor <= 100_000_000_000 &&
		(b.Currency == "" || currencyRE.MatchString(b.Currency)) && b.DueDay >= 1 && b.DueDay <= 31
	switch b.Frequency {
	case "monthly", "quarterly", "yearly", "once":
	default:
		ok = false
	}
	return start, ok
}

// DueIn is the bill's due date in the given month, if it falls due then.
func DueIn(frequency string, dueDay int, startsOn time.Time, year int, month time.Month) (time.Time, bool) {
	first := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	start := time.Date(startsOn.Year(), startsOn.Month(), 1, 0, 0, 0, 0, time.UTC)
	if first.Before(start) {
		return time.Time{}, false
	}
	months := (first.Year()-start.Year())*12 + int(first.Month()-start.Month())
	switch frequency {
	case "monthly":
	case "quarterly":
		if months%3 != 0 {
			return time.Time{}, false
		}
	case "yearly":
		if months%12 != 0 {
			return time.Time{}, false
		}
	case "once":
		if months != 0 {
			return time.Time{}, false
		}
	default:
		return time.Time{}, false
	}
	last := first.AddDate(0, 1, -1).Day()
	return first.AddDate(0, 0, min(dueDay, last)-1), true
}

// Bills lists the household's bills and their payments due in month, for an
// owner. Others get ErrForbidden.
func (d *DB) Bills(ctx context.Context, userID, householdID string, month, today time.Time) ([]Bill, []BillDue, error) {
	bills, dues := []Bill{}, []BillDue{}
	if !uuidRE.MatchString(householdID) {
		return bills, dues, ErrInvalid
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var owner bool
		if err := tx.QueryRow(ctx, `select public.has_household_role($1, array['owner'])`, householdID).Scan(&owner); err != nil {
			return err
		}
		if !owner {
			return ErrForbidden
		}
		rows, err := tx.Query(ctx, `
			select id, name, category, amount_minor, currency, varies, frequency, due_day, starts_on, paused, note
			from public.bills where household_id = $1 order by due_day, created_at`, householdID)
		if err != nil {
			return err
		}
		starts := map[string]time.Time{}
		for rows.Next() {
			var b Bill
			var start time.Time
			if err := rows.Scan(&b.ID, &b.Name, &b.Category, &b.AmountMinor, &b.Currency, &b.Varies, &b.Frequency, &b.DueDay, &start, &b.Paused, &b.Note); err != nil {
				return err
			}
			b.StartsOn = start.Format("2006-01")
			starts[b.ID] = start
			bills = append(bills, b)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		for _, b := range bills {
			due, ok := DueIn(b.Frequency, b.DueDay, starts[b.ID], month.Year(), month.Month())
			if !ok {
				continue
			}
			bd := BillDue{BillID: b.ID, Due: due.Format("2006-01-02"), ExpectedMinor: b.AmountMinor, Status: "due"}
			var paid int64
			var on time.Time
			err := tx.QueryRow(ctx, `select paid_minor, paid_on from public.bill_payments where bill_id = $1 and period = $2`, b.ID, due).Scan(&paid, &on)
			switch {
			case err == nil:
				s := on.Format("2006-01-02")
				bd.Status, bd.PaidMinor, bd.PaidOn = "paid", &paid, &s
			case !errors.Is(err, pgx.ErrNoRows):
				return err
			case b.Paused:
				continue
			default:
				if due.Before(today) {
					bd.Status = "late"
				}
				m, err := billMatch(ctx, tx, householdID, b, due)
				if err != nil {
					return err
				}
				bd.Match = m
			}
			dues = append(dues, bd)
		}
		return nil
	})
	return bills, dues, mapErr(err)
}

// billMatch finds the closest money-out transaction the owner can see that
// looks like this payment.
func billMatch(ctx context.Context, tx pgx.Tx, householdID string, b Bill, due time.Time) (*BillMatch, error) {
	var m BillMatch
	var date time.Time
	err := tx.QueryRow(ctx, `
		select t.id, coalesce(t.merchant_name, t.name), t.amount_minor, t.date
		from public.transactions t
		where t.household_id = $1 and t.currency = $2 and not t.pending
		  and t.amount_minor between $3 * 9 / 10 and $3 * 11 / 10
		  and t.date between $4::date - 5 and $4::date + 5
		order by abs(t.amount_minor - $3), abs(t.date - $4::date)
		limit 1`, householdID, b.Currency, b.AmountMinor, due).Scan(&m.TransactionID, &m.Name, &m.AmountMinor, &date)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	m.Date = date.Format("2006-01-02")
	return &m, nil
}

// CreateBill adds a bill and returns its ID.
func (d *DB) CreateBill(ctx context.Context, userID, householdID string, b NewBill) (string, error) {
	start, ok := b.clean()
	if !uuidRE.MatchString(householdID) || !ok {
		return "", ErrInvalid
	}
	var id string
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		cur := b.Currency
		if cur == "" {
			if err := tx.QueryRow(ctx, `select home_currency from public.households where id = $1`, householdID).Scan(&cur); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return ErrForbidden
				}
				return err
			}
		}
		return tx.QueryRow(ctx, `
			insert into public.bills (household_id, name, category, amount_minor, currency, varies, frequency, due_day, starts_on, paused, note)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
			householdID, b.Name, nullable(b.Category), b.AmountMinor, cur, b.Varies, b.Frequency, b.DueDay, start, b.Paused, nullable(b.Note)).Scan(&id)
	})
	return id, mapErr(err)
}

// UpdateBill changes a bill. ErrNotFound if userID can't see it.
func (d *DB) UpdateBill(ctx context.Context, userID, billID string, b NewBill) error {
	start, ok := b.clean()
	if !uuidRE.MatchString(billID) || !ok {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update public.bills set name = $2, category = $3, amount_minor = $4, varies = $5, frequency = $6, due_day = $7, starts_on = $8, paused = $9, note = $10
			where id = $1`, billID, b.Name, nullable(b.Category), b.AmountMinor, b.Varies, b.Frequency, b.DueDay, start, b.Paused, nullable(b.Note))
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}))
}

// DeleteBill removes a bill and its payments.
func (d *DB) DeleteBill(ctx context.Context, userID, billID string) error {
	if !uuidRE.MatchString(billID) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from public.bills where id = $1`, billID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}))
}

// MarkBillPaid records (or corrects) the payment for the period due on due.
// ErrInvalid if the bill isn't due that day. transactionID, when set, is the
// bank transaction it was paid with: that payment adds no spending line of its
// own (0030), so it isn't counted twice.
func (d *DB) MarkBillPaid(ctx context.Context, userID, billID string, due time.Time, paidMinor int64, paidOn time.Time, transactionID string) error {
	if !uuidRE.MatchString(billID) || paidMinor <= 0 || paidMinor > 100_000_000_000 || (transactionID != "" && !uuidRE.MatchString(transactionID)) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var freq string
		var day int
		var start time.Time
		if err := tx.QueryRow(ctx, `select frequency, due_day, starts_on from public.bills where id = $1`, billID).Scan(&freq, &day, &start); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if want, ok := DueIn(freq, day, start, due.Year(), due.Month()); !ok || !want.Equal(due) {
			return ErrInvalid
		}
		_, err := tx.Exec(ctx, `
			insert into public.bill_payments (bill_id, period, paid_minor, paid_on, transaction_id) values ($1, $2, $3, $4, $5)
			on conflict (bill_id, period) do update set paid_minor = excluded.paid_minor, paid_on = excluded.paid_on, transaction_id = excluded.transaction_id`,
			billID, due, paidMinor, paidOn, nullable(transactionID))
		return err
	}))
}

// UnmarkBillPaid takes a payment back (marked by mistake).
func (d *DB) UnmarkBillPaid(ctx context.Context, userID, billID string, due time.Time) error {
	if !uuidRE.MatchString(billID) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from public.bill_payments where bill_id = $1 and period = $2`, billID, due)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}))
}
