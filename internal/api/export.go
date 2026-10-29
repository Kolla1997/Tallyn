package api

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Kolla1997/Tallyn/internal/auth"
	"github.com/Kolla1997/Tallyn/internal/db"
	"github.com/Kolla1997/Tallyn/internal/money"
)

// exportData answers GET /api/me/export (#54): a ZIP of everything Tallyn
// holds about the signed-in person. It needs a 2FA code from the last few
// minutes, then counts against a limit of 3 an hour (a refused code doesn't
// use one up). The log gets counts only, never the contents.
func exportData(store Store, lim *limiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uid, ok := userID(w, r)
		if !ok || !recentCode(w, r) {
			return
		}
		if ok, wait := lim.allow(uid); !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			writeError(w, http.StatusTooManyRequests, "too_many_requests")
			return
		}
		e, err := store.Export(r.Context(), uid)
		if err != nil {
			log.Printf("api: export: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		s, _ := auth.FromContext(r.Context())
		e.Profile.Email = s.Email
		zipped, err := exportZip(e)
		if err != nil {
			log.Printf("api: export zip: %v", err)
			writeError(w, http.StatusInternalServerError, "internal")
			return
		}
		log.Printf("api: export: %d accounts, %d transactions", len(e.Accounts), len(e.Transactions))
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="coinroof-data-`+e.ExportedAt.Format("2006-01-02")+`.zip"`)
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(zipped)
	}
}

// exportZip packs the export as coinroof-data.json, transactions.csv and a
// README that says what each part means.
func exportZip(e db.Export) ([]byte, error) {
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	add := func(name string, body []byte) error {
		f, err := z.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: e.ExportedAt})
		if err != nil {
			return err
		}
		_, err = f.Write(body)
		return err
	}
	data, err := json.MarshalIndent(e, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := add("coinroof-data.json", data); err != nil {
		return nil, err
	}
	if err := add("transactions.csv", transactionsCSV(e.Transactions)); err != nil {
		return nil, err
	}
	if err := add("README.txt", []byte(exportReadme)); err != nil {
		return nil, err
	}
	if err := z.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// transactionsCSV is one row per transaction, for spreadsheets. Unlike the
// JSON (which keeps the bank's sign), money out is negative here, as people
// expect in a spreadsheet.
func transactionsCSV(list []db.ExportTransaction) []byte {
	var buf bytes.Buffer
	c := csv.NewWriter(&buf)
	_ = c.Write([]string{"date", "authorized_date", "description", "merchant", "amount", "currency", "category", "category_detailed",
		"account", "account_last_digits", "pending", "paid_at", "city", "region", "country"})
	for _, t := range list {
		_ = c.Write([]string{
			day(&t.Date), day(t.AuthorizedDate), cell(t.Name), cell(str(t.Merchant)),
			decimal(-t.AmountMinor, t.Currency), t.Currency, cell(str(t.Category)), cell(str(t.CategoryDetailed)),
			cell(t.Account), cell(str(t.AccountDigits)), strconv.FormatBool(t.Pending), stamp(t.PaidAt),
			cell(str(t.City)), cell(str(t.Region)), cell(str(t.Country)),
		})
	}
	c.Flush()
	return buf.Bytes()
}

// cell stops a spreadsheet from running text as a formula: names come from
// banks and merchants, so one starting with = + - @ gets a leading quote.
func cell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

// decimal writes minor units as a plain decimal in the currency's own
// decimals, the same ones used when it was stored (money.Exponent): 123456
// USD is 1234.56, 1200 JPY is 1200. A code that isn't three letters is
// written as it's stored.
func decimal(minor int64, currency string) string {
	exp, ok := money.Exponent(currency)
	if !ok || exp == 0 {
		return strconv.FormatInt(minor, 10)
	}
	sign := ""
	if minor < 0 {
		sign, minor = "-", -minor
	}
	s := strconv.FormatInt(minor, 10)
	if len(s) <= exp {
		s = strings.Repeat("0", exp-len(s)+1) + s
	}
	return sign + s[:len(s)-exp] + "." + s[len(s)-exp:]
}

func str(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func day(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

func stamp(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

const exportReadme = `Your Coinroof data
==================

This is everything Coinroof holds about you: your own profile, banks, accounts,
transactions, card and loan details, budgets you made, your savings goals,
what you share and with whom, and the Terms and Privacy versions you agreed to.

It never includes other people's money, even if they share it with you, the
invites you sent (they hold other people's email addresses), or anything
secret: no bank passwords or access tokens, and no backup codes (only how many
are left).

coinroof-data.json
  Everything, as JSON. Amounts are in minor units (cents for USD) in fields
  ending in _minor, with their currency. For transactions, a positive
  amount_minor is money out and a negative one is money in, as your bank
  reports it. Dates are YYYY-MM-DD; times are UTC.

transactions.csv
  Your transactions, one per row, for a spreadsheet. Here the amount is a
  normal decimal (12.34), and money out is negative.

Keep this file safe: it holds your financial history.
`
