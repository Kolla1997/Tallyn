package db

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Errors for household and bank operations. Handlers map them to HTTP codes.
var (
	ErrForbidden     = errors.New("db: not allowed")
	ErrInvalid       = errors.New("db: invalid input")
	ErrNotFound      = errors.New("db: not found")
	ErrAlreadyLinked = errors.New("db: bank already linked")
)

// mapErr turns Postgres errors from our functions and constraints into the
// errors above, so handlers never pass raw database errors to the browser.
func mapErr(err error) error {
	var pe *pgconn.PgError
	if !errors.As(err, &pe) {
		return err
	}
	switch pe.Code {
	case "42501": // insufficient_privilege: raised by our functions, or RLS
		return ErrForbidden
	case "22023", "23514", "23502", "22001", "22P02": // bad value, check, not null, too long, bad text
		return ErrInvalid
	case "23505": // unique_violation
		return ErrAlreadyLinked
	}
	return err
}

// CreateHousehold creates a household with userID as its owner.
func (d *DB) CreateHousehold(ctx context.Context, userID, name, homeCurrency string) (MyHousehold, error) {
	h := MyHousehold{Role: "owner"}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select id, name, home_currency from public.create_household($1, $2)`, name, homeCurrency).
			Scan(&h.ID, &h.Name, &h.HomeCurrency)
	})
	return h, mapErr(err)
}

// CanLink reports whether userID may link a bank in householdID: owners and
// adults only (link_plaid_item checks the same rule again in the database).
func (d *DB) CanLink(ctx context.Context, userID, householdID string) (bool, error) {
	if !uuidRE.MatchString(householdID) {
		return false, nil
	}
	var ok bool
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.has_household_role($1, array['owner', 'adult'])`, householdID).Scan(&ok)
	})
	return ok, err
}

// NewBank is a freshly linked Plaid item. AccessTokenSealed must already be
// encrypted (internal/tokencrypt). Accounts is marshalled to the JSON that
// link_plaid_item expects (see plaid.Account).
type NewBank struct {
	PlaidItemID       string
	AccessTokenSealed []byte
	InstitutionID     string
	InstitutionName   string
	Accounts          any
}

// LinkBank saves a linked bank and its accounts through link_plaid_item,
// which checks inside the database that userID may link in householdID and
// makes userID the owner. Returns the new plaid_items.id.
func (d *DB) LinkBank(ctx context.Context, userID, householdID string, b NewBank) (string, error) {
	if !uuidRE.MatchString(householdID) {
		return "", ErrForbidden
	}
	accounts, err := json.Marshal(b.Accounts)
	if err != nil {
		return "", err
	}
	var id string
	err = d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.link_plaid_item($1, $2, $3, nullif($4, ''), nullif($5, ''), $6::jsonb)`,
			householdID, b.PlaidItemID, b.AccessTokenSealed, b.InstitutionID, b.InstitutionName, string(accounts)).Scan(&id)
	})
	return id, mapErr(err)
}

// Bank is a linked bank as the user sees it. Never includes the token.
type Bank struct {
	ID              string        `json:"id"`
	InstitutionName *string       `json:"institution_name"`
	OwnerUserID     string        `json:"owner_user_id"`
	Status          string        `json:"status"`
	CanUnlink       bool          `json:"can_unlink"`
	Accounts        []BankAccount `json:"accounts"`
}

// BankAccount is one account under a Bank. Balances are minor units.
type BankAccount struct {
	ID             string  `json:"id"`
	BankID         string  `json:"-"`
	Name           string  `json:"name"`
	Mask           *string `json:"mask"`
	Type           string  `json:"type"`
	Subtype        *string `json:"subtype"`
	Currency       string  `json:"currency"`
	CurrentMinor   *int64  `json:"current_balance_minor"`
	AvailableMinor *int64  `json:"available_balance_minor"`
}

// Banks lists the banks and accounts in householdID that userID may see.
// RLS decides: owners, adults and viewers see all; teens and children only theirs.
func (d *DB) Banks(ctx context.Context, userID, householdID string) ([]Bank, error) {
	banks := []Bank{}
	if !uuidRE.MatchString(householdID) {
		return banks, nil
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		byID := map[string]int{}
		rows, err := tx.Query(ctx, `
			select i.id, i.institution_name, i.owner_user_id, i.status,
			       i.owner_user_id = auth.uid() or public.has_household_role(i.household_id, array['owner'])
			from public.plaid_items i
			where i.household_id = $1
			order by i.created_at, i.id`, householdID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var b Bank
			if err := rows.Scan(&b.ID, &b.InstitutionName, &b.OwnerUserID, &b.Status, &b.CanUnlink); err != nil {
				return err
			}
			b.Accounts = []BankAccount{}
			byID[b.ID] = len(banks)
			banks = append(banks, b)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		rows, err = tx.Query(ctx, `
			select a.id, a.plaid_item_id, a.name, a.mask, a.type, a.subtype, a.currency,
			       a.current_balance_minor, a.available_balance_minor
			from public.accounts a
			where a.household_id = $1
			order by a.name, a.id`, householdID)
		if err != nil {
			return err
		}
		accts, err := pgx.CollectRows(rows, pgx.RowToStructByPos[BankAccount])
		if err != nil {
			return err
		}
		for _, a := range accts {
			if i, ok := byID[a.BankID]; ok {
				banks[i].Accounts = append(banks[i].Accounts, a)
			}
		}
		return nil
	})
	return banks, err
}

// UnlinkTarget returns what's needed to revoke a bank at Plaid: its Plaid
// item ID and encrypted token. ErrNotFound if it doesn't exist or userID may
// not unlink it (the linker, or a household owner).
func (d *DB) UnlinkTarget(ctx context.Context, userID, bankID string) (plaidItemID string, sealed []byte, err error) {
	if !uuidRE.MatchString(bankID) {
		return "", nil, ErrNotFound
	}
	err = d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select plaid_item_id, access_token_encrypted from public.plaid_item_for_unlink($1)`, bankID).
			Scan(&plaidItemID, &sealed)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrNotFound
	}
	return plaidItemID, sealed, err
}

// DeleteBank deletes a bank and, by cascade, its accounts and transactions.
// RLS allows it for the linker or a household owner. Call it only after the
// item was removed at Plaid.
func (d *DB) DeleteBank(ctx context.Context, userID, bankID string) error {
	if !uuidRE.MatchString(bankID) {
		return ErrNotFound
	}
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from public.plaid_items where id = $1`, bankID)
		if err != nil {
			return mapErr(err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}
