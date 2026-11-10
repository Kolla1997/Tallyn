package db

import (
	"context"
	"errors"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

// Loans Plaid can't see, like a car loan (#306, 0032_loans_manual.sql). A
// manual loan is a bill with loan terms: the bill is its monthly payment,
// marked paid on Bills or from the reminder. Owners only, like Bills.

// LoanPayment is the fixed monthly payment that pays off principal over
// months at aprBP (basis points: 4.9% = 490), rounded to the cent.
func LoanPayment(principal int64, aprBP, months int) int64 {
	if months <= 0 {
		return principal
	}
	if aprBP == 0 {
		return (principal + int64(months) - 1) / int64(months)
	}
	r := float64(aprBP) / 10000 / 12
	return int64(math.Round(float64(principal) * r / (1 - math.Pow(1+r, -float64(months)))))
}

// LoanEvent is a payment towards a loan: a monthly one (interest first) or
// an extra one (all off the balance).
type LoanEvent struct {
	On    time.Time
	Minor int64
	Extra bool
}

// LoanSplit is where one payment went.
type LoanSplit struct {
	On            string `json:"on"`
	PaidMinor     int64  `json:"paid_minor"`
	InterestMinor int64  `json:"interest_minor"`
	BalanceMinor  int64  `json:"principal_minor"` // what came off the balance
	Extra         bool   `json:"extra"`
}

// LoanState is a loan worked out from its start (or the last correction)
// and its payments, in date order.
type LoanState struct {
	Balance          int64
	InterestPaid     int64 // since the start (or correction)
	InterestThisYear int64
	Payments         int // monthly payments counted
	Last             *LoanSplit
}

// RunLoan applies payments to a starting balance. Each monthly payment pays a
// month's interest on the balance first; the rest comes off the balance.
func RunLoan(start int64, aprBP int, events []LoanEvent, year int) LoanState {
	sort.SliceStable(events, func(i, j int) bool { return events[i].On.Before(events[j].On) })
	r := float64(aprBP) / 10000 / 12
	s := LoanState{Balance: start}
	for _, e := range events {
		sp := LoanSplit{On: e.On.Format("2006-01-02"), PaidMinor: e.Minor, Extra: e.Extra}
		if !e.Extra {
			sp.InterestMinor = min(int64(math.Round(float64(s.Balance)*r)), e.Minor)
			s.Payments++
		}
		sp.BalanceMinor = min(e.Minor-sp.InterestMinor, s.Balance)
		s.Balance -= sp.BalanceMinor
		s.InterestPaid += sp.InterestMinor
		if e.On.Year() == year {
			s.InterestThisYear += sp.InterestMinor
		}
		last := sp
		s.Last = &last
	}
	return s
}

// PayoffMonths is how many more monthly payments clear balance, or -1 when
// the payment doesn't cover the interest (or it would take over 50 years).
func PayoffMonths(balance int64, aprBP int, payment int64) int {
	r := float64(aprBP) / 10000 / 12
	for n := 0; n <= 600; n++ {
		if balance <= 0 {
			return n
		}
		interest := int64(math.Round(float64(balance) * r))
		if payment <= interest {
			return -1
		}
		balance -= payment - interest
	}
	return -1
}

// ManualLoan is a manual loan as an owner sees it.
type ManualLoan struct {
	ID                    string     `json:"id"` // its bill's ID
	Name                  string     `json:"name"`
	Lender                *string    `json:"lender"`
	Currency              string     `json:"currency"`
	PrincipalMinor        int64      `json:"principal_minor"`
	APR                   string     `json:"apr"` // "4.9"
	Months                int        `json:"months"`
	FirstDue              string     `json:"first_due"`
	PaymentMinor          int64      `json:"payment_minor"`
	DueDay                int        `json:"due_day"`
	BalanceMinor          int64      `json:"balance_minor"`
	InterestPaidMinor     int64      `json:"interest_paid_minor"`
	InterestThisYearMinor int64      `json:"interest_this_year_minor"`
	PaymentsMade          int        `json:"payments_made"`
	NextDue               *string    `json:"next_due"`    // nil once paid off
	PayoffDate            *string    `json:"payoff_date"` // nil when the payment doesn't cover the interest
	Last                  *LoanSplit `json:"last"`
	CorrectedMinor        *int64     `json:"corrected_minor"`
	CorrectedOn           *string    `json:"corrected_on"`
}

// NewLoan is what an owner sets. APR is a percent like "4.9". BalanceMinor,
// when set, is today's balance from the lender (a loan part-way through).
type NewLoan struct {
	Name           string `json:"name"`
	Lender         string `json:"lender"`
	PrincipalMinor int64  `json:"principal_minor"`
	APR            string `json:"apr"`
	Months         int    `json:"months"`
	FirstDue       string `json:"first_due"` // YYYY-MM-DD
	BalanceMinor   *int64 `json:"balance_minor"`
}

// aprBP turns "4.9" into 490. At most two decimals, 0 to 100%.
func aprBP(s string) (int, bool) {
	s = strings.TrimSuffix(strings.TrimSpace(s), "%")
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f < 0 || f > 100 || math.Abs(f*100-math.Round(f*100)) > 1e-6 {
		return 0, false
	}
	return int(math.Round(f * 100)), true
}

func (l *NewLoan) clean() (int, time.Time, bool) {
	l.Name, l.Lender = strings.TrimSpace(l.Name), strings.TrimSpace(l.Lender)
	bp, okAPR := aprBP(l.APR)
	first, err := time.Parse("2006-01-02", l.FirstDue)
	ok := okAPR && err == nil && l.Name != "" && utf8.RuneCountInString(l.Name) <= 60 && utf8.RuneCountInString(l.Lender) <= 60 &&
		l.PrincipalMinor > 0 && l.PrincipalMinor <= 100_000_000_000 && l.Months >= 1 && l.Months <= 600 &&
		(l.BalanceMinor == nil || (*l.BalanceMinor >= 0 && *l.BalanceMinor <= 100_000_000_000))
	return bp, first, ok
}

// Loans lists the household's manual loans for an owner; others get ErrForbidden.
func (d *DB) Loans(ctx context.Context, userID, householdID string, today time.Time) ([]ManualLoan, error) {
	list := []ManualLoan{}
	if !uuidRE.MatchString(householdID) {
		return list, ErrInvalid
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
			select b.id, b.name, l.lender, b.currency, l.principal_minor, l.apr_bp, l.months, l.first_due, b.amount_minor, b.due_day,
			       l.balance_minor, l.balance_on
			from public.loans_manual l join public.bills b on b.id = l.bill_id
			where l.household_id = $1 order by b.name`, householdID)
		if err != nil {
			return err
		}
		type raw struct {
			l        ManualLoan
			bp       int
			first    time.Time
			fixOn    *time.Time
			fixMinor *int64
		}
		var all []raw
		for rows.Next() {
			var x raw
			if err := rows.Scan(&x.l.ID, &x.l.Name, &x.l.Lender, &x.l.Currency, &x.l.PrincipalMinor, &x.bp, &x.l.Months, &x.first,
				&x.l.PaymentMinor, &x.l.DueDay, &x.fixMinor, &x.fixOn); err != nil {
				return err
			}
			all = append(all, x)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		for _, x := range all {
			l := x.l
			l.APR = strconv.FormatFloat(float64(x.bp)/100, 'f', -1, 64)
			l.FirstDue = x.first.Format("2006-01-02")
			var events []LoanEvent
			paid := map[string]bool{}
			prow, err := tx.Query(ctx, `
				select paid_on, paid_minor, false, period from public.bill_payments where bill_id = $1
				union all select paid_on, paid_minor, true, null from public.loan_extra_payments where bill_id = $1`, l.ID)
			if err != nil {
				return err
			}
			for prow.Next() {
				var e LoanEvent
				var period *time.Time
				if err := prow.Scan(&e.On, &e.Minor, &e.Extra, &period); err != nil {
					return err
				}
				if period != nil {
					paid[period.Format("2006-01-02")] = true
				}
				if x.fixOn == nil || e.On.After(*x.fixOn) {
					events = append(events, e)
				}
			}
			if err := prow.Err(); err != nil {
				return err
			}
			start := l.PrincipalMinor
			if x.fixMinor != nil {
				start = *x.fixMinor
				on := x.fixOn.Format("2006-01-02")
				l.CorrectedMinor, l.CorrectedOn = x.fixMinor, &on
			}
			s := RunLoan(start, x.bp, events, today.Year())
			l.BalanceMinor, l.InterestPaidMinor, l.InterestThisYearMinor, l.Last = s.Balance, s.InterestPaid, s.InterestThisYear, s.Last
			l.PaymentsMade = len(paid)
			if l.BalanceMinor > 0 {
				// The first monthly due date not yet paid.
				for m := 0; m < 600; m++ {
					mo := time.Date(x.first.Year(), x.first.Month()+time.Month(m), 1, 0, 0, 0, 0, time.UTC)
					due, _ := DueIn("monthly", l.DueDay, time.Date(x.first.Year(), x.first.Month(), 1, 0, 0, 0, 0, time.UTC), mo.Year(), mo.Month())
					if k := due.Format("2006-01-02"); !paid[k] {
						l.NextDue = &k
						if n := PayoffMonths(l.BalanceMinor, x.bp, l.PaymentMinor); n > 0 {
							last := time.Date(mo.Year(), mo.Month()+time.Month(n-1), 1, 0, 0, 0, 0, time.UTC)
							p, _ := DueIn("monthly", l.DueDay, last, last.Year(), last.Month())
							ps := p.Format("2006-01-02")
							l.PayoffDate = &ps
						}
						break
					}
				}
			}
			list = append(list, l)
		}
		return nil
	})
	return list, mapErr(err)
}

// CreateLoan adds a loan and its monthly payment as a bill; returns the ID.
func (d *DB) CreateLoan(ctx context.Context, userID, householdID string, l NewLoan, today time.Time) (string, error) {
	bp, first, ok := l.clean()
	if !uuidRE.MatchString(householdID) || !ok {
		return "", ErrInvalid
	}
	var id string
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var cur string
		if err := tx.QueryRow(ctx, `select home_currency from public.households where id = $1`, householdID).Scan(&cur); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrForbidden
			}
			return err
		}
		if err := tx.QueryRow(ctx, `
			insert into public.bills (household_id, name, category, amount_minor, currency, frequency, due_day, starts_on)
			values ($1, $2, 'loan', $3, $4, 'monthly', $5, date_trunc('month', $6::date)::date) returning id`,
			householdID, l.Name, LoanPayment(l.PrincipalMinor, bp, l.Months), cur, first.Day(), first).Scan(&id); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			insert into public.loans_manual (bill_id, household_id, lender, principal_minor, apr_bp, months, first_due) values ($1, $2, $3, $4, $5, $6, $7)`,
			id, householdID, nullable(l.Lender), l.PrincipalMinor, bp, l.Months, first)
		if err != nil || l.BalanceMinor == nil {
			return err
		}
		_, err = tx.Exec(ctx, `update public.loans_manual set balance_minor = $2, balance_on = $3 where bill_id = $1`, id, *l.BalanceMinor, today)
		return err
	})
	return id, mapErr(err)
}

// UpdateLoan changes a loan's terms; its monthly payment follows.
func (d *DB) UpdateLoan(ctx context.Context, userID, loanID string, l NewLoan) error {
	bp, first, ok := l.clean()
	if !uuidRE.MatchString(loanID) || !ok {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update public.loans_manual set lender = $2, principal_minor = $3, apr_bp = $4, months = $5, first_due = $6 where bill_id = $1`,
			loanID, nullable(l.Lender), l.PrincipalMinor, bp, l.Months, first)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		_, err = tx.Exec(ctx, `update public.bills set name = $2, amount_minor = $3, due_day = $4, starts_on = date_trunc('month', $5::date)::date where id = $1`,
			loanID, l.Name, LoanPayment(l.PrincipalMinor, bp, l.Months), first.Day(), first)
		return err
	}))
}

// SetLoanBalance records the lender's balance on a day; payments after it start from there.
func (d *DB) SetLoanBalance(ctx context.Context, userID, loanID string, balanceMinor int64, on time.Time) error {
	if !uuidRE.MatchString(loanID) || balanceMinor < 0 || balanceMinor > 100_000_000_000 {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `update public.loans_manual set balance_minor = $2, balance_on = $3 where bill_id = $1`, loanID, balanceMinor, on)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}))
}

// AddLoanExtra records an extra payment that goes straight to the balance.
func (d *DB) AddLoanExtra(ctx context.Context, userID, loanID string, paidMinor int64, on time.Time) error {
	if !uuidRE.MatchString(loanID) || paidMinor <= 0 || paidMinor > 100_000_000_000 {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `select exists (select 1 from public.loans_manual where bill_id = $1)`, loanID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrNotFound
		}
		_, err := tx.Exec(ctx, `insert into public.loan_extra_payments (bill_id, paid_minor, paid_on) values ($1, $2, $3)`, loanID, paidMinor, on)
		return err
	}))
}
