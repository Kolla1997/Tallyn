package db

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Invites (0008_invites.sql, ADR 0008). The token is 32 random bytes, sent to
// the owner once as part of a link. The database only ever stores its SHA-256
// hash, so a database leak reveals no usable invites.

// InviteLifetime is how long an invite works (decided 2026-10-09).
const InviteLifetime = 7 * 24 * time.Hour

// InviteRoles are the roles an invite can give. No children: no logins under
// 13 until a legal check on parental consent (decided 2026-10-09).
var InviteRoles = map[string]bool{"adult": true, "teen": true, "viewer": true}

// Invite is a pending or past invite, as owners see it. Never includes the token.
type Invite struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  time.Time  `json:"expires_at"`
	AcceptedAt *time.Time `json:"accepted_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
}

// ErrAlreadyMember means the invited email already belongs to a member.
var ErrAlreadyMember = errors.New("db: already a member")

// ErrInviteInvalid is the one answer for any invite that can't be used:
// unknown, used, cancelled, expired, or for another email.
var ErrInviteInvalid = errors.New("db: invite not valid for this account")

func hashToken(token string) ([]byte, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != 32 {
		return nil, false
	}
	h := sha256.Sum256(raw)
	return h[:], true
}

// CreateInvite invites email to householdID with role, as userID (must be an
// owner). It returns the invite and the token for the link. The token can't
// be retrieved again.
func (d *DB) CreateInvite(ctx context.Context, userID, householdID, email, role string) (Invite, string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email || len(email) > 254 {
		return Invite{}, "", ErrInvalid
	}
	if !InviteRoles[role] || !uuidRE.MatchString(householdID) {
		return Invite{}, "", ErrInvalid
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return Invite{}, "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256(raw)
	expires := time.Now().Add(InviteLifetime)

	var inv Invite
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var id string
		if err := tx.QueryRow(ctx, `select public.create_household_invite($1, $2, $3, $4, $5)`,
			householdID, email, role, hash[:], expires).Scan(&id); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `select id, email, role, created_at, expires_at, accepted_at, revoked_at
			from public.household_invites where id = $1`, id).
			Scan(&inv.ID, &inv.Email, &inv.Role, &inv.CreatedAt, &inv.ExpiresAt, &inv.AcceptedAt, &inv.RevokedAt)
	})
	if err != nil {
		if errors.Is(mapErr(err), ErrAlreadyLinked) { // unique_violation raised for "already a member"
			return Invite{}, "", ErrAlreadyMember
		}
		return Invite{}, "", mapErr(err)
	}
	return inv, token, nil
}

// Invites lists the household's open invites (not used, cancelled or
// expired), newest first. Only owners see any.
func (d *DB) Invites(ctx context.Context, userID, householdID string) ([]Invite, error) {
	list := []Invite{}
	if !uuidRE.MatchString(householdID) {
		return list, ErrInvalid
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select id, email, role, created_at, expires_at, accepted_at, revoked_at
			from public.household_invites
			where household_id = $1 and accepted_at is null and revoked_at is null and expires_at > now()
			order by created_at desc`, householdID)
		if err != nil {
			return err
		}
		list, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Invite])
		return err
	})
	return list, err
}

// RevokeInvite cancels an open invite. ErrNotFound if it doesn't exist, is
// already used or cancelled, or userID isn't an owner of its household.
func (d *DB) RevokeInvite(ctx context.Context, userID, inviteID string) error {
	if !uuidRE.MatchString(inviteID) {
		return ErrNotFound
	}
	var ok bool
	if err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.revoke_household_invite($1)`, inviteID).Scan(&ok)
	}); err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

// AcceptInvite joins userID to the invite's household, if the token is valid
// and userID's confirmed email is the invited one. Returns the household ID.
func (d *DB) AcceptInvite(ctx context.Context, userID, token string) (string, error) {
	hash, ok := hashToken(token)
	if !ok {
		return "", ErrInviteInvalid
	}
	var household string
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select public.accept_household_invite($1)`, hash).Scan(&household)
	})
	if errors.Is(mapErr(err), ErrForbidden) {
		return "", ErrInviteInvalid
	}
	return household, err
}

// SetMemberRole changes a member's role. Only owners can (RLS), and a
// household always keeps at least one owner (trigger). Children can't be set
// (no child logins yet).
func (d *DB) SetMemberRole(ctx context.Context, userID, householdID, memberID, role string) error {
	if !uuidRE.MatchString(householdID) || !uuidRE.MatchString(memberID) {
		return ErrNotFound
	}
	if role != "owner" && !InviteRoles[role] {
		return ErrInvalid
	}
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `update public.household_members set role = $3
			where household_id = $1 and user_id = $2`, householdID, memberID, role)
		if err != nil {
			return memberErr(err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// RemoveMember removes memberID from the household. Owners can remove anyone;
// anyone can remove themselves (leave). The last owner can't leave.
func (d *DB) RemoveMember(ctx context.Context, userID, householdID, memberID string) error {
	if !uuidRE.MatchString(householdID) || !uuidRE.MatchString(memberID) {
		return ErrNotFound
	}
	return d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `delete from public.household_members
			where household_id = $1 and user_id = $2`, householdID, memberID)
		if err != nil {
			return memberErr(err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// ErrLastOwner means the change would leave a household without an owner.
var ErrLastOwner = errors.New("db: a household needs at least one owner")

func memberErr(err error) error {
	if err != nil && strings.Contains(err.Error(), "at least one owner") {
		return ErrLastOwner
	}
	return mapErr(err)
}

// Members lists the household's members, the caller first.
func (d *DB) Members(ctx context.Context, userID, householdID string) ([]Member, error) {
	s, err := d.Sharing(ctx, userID, householdID)
	return s.Members, err
}
