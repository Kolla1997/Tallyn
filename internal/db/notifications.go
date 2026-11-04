package db

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// In-app notifications (#267, 0020_notifications.sql). Triggers write them;
// each person reads and marks only their own.

// Notification is one alert for the current user. Data holds what the app
// needs to write the sentence (merchant, amount, account or person's name).
type Notification struct {
	ID          string          `json:"id"`
	HouseholdID string          `json:"household_id"`
	Kind        string          `json:"kind"`
	RefID       string          `json:"ref_id"`
	Data        json.RawMessage `json:"data"`
	NeedsAction bool            `json:"needs_action"`
	CreatedAt   time.Time       `json:"created_at"`
	Read        bool            `json:"read"`
	Resolved    bool            `json:"resolved"`
}

// notificationsShown is how many alerts the list keeps: the newest 50.
const notificationsShown = 50

// Notifications lists userID's newest alerts, newest first.
func (d *DB) Notifications(ctx context.Context, userID string) ([]Notification, error) {
	list := []Notification{}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select id, household_id, kind, ref_id, data, needs_action, created_at, read_at is not null, resolved_at is not null
			from public.notifications
			order by created_at desc
			limit $1`, notificationsShown)
		if err != nil {
			return err
		}
		for rows.Next() {
			var n Notification
			if err := rows.Scan(&n.ID, &n.HouseholdID, &n.Kind, &n.RefID, &n.Data, &n.NeedsAction, &n.CreatedAt, &n.Read, &n.Resolved); err != nil {
				return err
			}
			list = append(list, n)
		}
		return rows.Err()
	})
	return list, mapErr(err)
}

// MarkNotificationsRead marks userID's alerts read: the one given, or all
// of them when id is empty.
func (d *DB) MarkNotificationsRead(ctx context.Context, userID, id string) error {
	if id != "" && !uuidRE.MatchString(id) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			update public.notifications set read_at = now()
			where read_at is null and ($1 = '' or id = $1::uuid)`, id)
		return err
	}))
}

// NotificationSettings is what one person hears about in one household
// (#268, 0021_notification_settings.sql). Amounts are in minor units; a nil
// ShareWith means alerts aren't shared with a partner.
type NotificationSettings struct {
	BigPurchase      bool    `json:"big_purchase"`
	BigPurchaseMinor int64   `json:"big_purchase_minor"`
	LowBalance       bool    `json:"low_balance"`
	LowBalanceMinor  int64   `json:"low_balance_minor"`
	Joined           bool    `json:"joined"`
	ShareWith        *string `json:"share_with"`
	EmailReconnect   bool    `json:"email_reconnect"`
	EmailPaymentDue  bool    `json:"email_payment_due"`
}

const maxAlertMinor = 100_000_000_000

// NotificationSettingsFor returns userID's settings in the household, or the
// defaults when they haven't saved any. ErrForbidden if they aren't in it.
func (d *DB) NotificationSettingsFor(ctx context.Context, userID, householdID string) (NotificationSettings, error) {
	s := NotificationSettings{BigPurchase: true, BigPurchaseMinor: 50000, LowBalance: true, LowBalanceMinor: 10000, Joined: true}
	if !uuidRE.MatchString(householdID) {
		return s, ErrInvalid
	}
	err := d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		var member bool
		if err := tx.QueryRow(ctx, `select public.is_household_member($1)`, householdID).Scan(&member); err != nil {
			return err
		}
		if !member {
			return ErrForbidden
		}
		err := tx.QueryRow(ctx, `
			select big_purchase, big_purchase_minor, low_balance, low_balance_minor, joined, share_with, email_reconnect, email_payment_due
			from public.notification_settings where household_id = $1 and user_id = $2`, householdID, userID).
			Scan(&s.BigPurchase, &s.BigPurchaseMinor, &s.LowBalance, &s.LowBalanceMinor, &s.Joined, &s.ShareWith, &s.EmailReconnect, &s.EmailPaymentDue)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	})
	return s, mapErr(err)
}

// SaveNotificationSettings saves userID's settings in the household.
// ErrForbidden if they aren't in it, or the partner isn't an owner or adult.
func (d *DB) SaveNotificationSettings(ctx context.Context, userID, householdID string, s NotificationSettings) error {
	if !uuidRE.MatchString(householdID) ||
		s.BigPurchaseMinor <= 0 || s.BigPurchaseMinor > maxAlertMinor || s.LowBalanceMinor <= 0 || s.LowBalanceMinor > maxAlertMinor ||
		(s.ShareWith != nil && (!uuidRE.MatchString(*s.ShareWith) || *s.ShareWith == userID)) {
		return ErrInvalid
	}
	return mapErr(d.AsUser(ctx, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			insert into public.notification_settings
			  (household_id, user_id, big_purchase, big_purchase_minor, low_balance, low_balance_minor, joined, share_with, email_reconnect, email_payment_due)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			on conflict (household_id, user_id) do update set
			  big_purchase = excluded.big_purchase, big_purchase_minor = excluded.big_purchase_minor,
			  low_balance = excluded.low_balance, low_balance_minor = excluded.low_balance_minor,
			  joined = excluded.joined, share_with = excluded.share_with,
			  email_reconnect = excluded.email_reconnect, email_payment_due = excluded.email_payment_due`,
			householdID, userID, s.BigPurchase, s.BigPurchaseMinor, s.LowBalance, s.LowBalanceMinor, s.Joined, s.ShareWith, s.EmailReconnect, s.EmailPaymentDue)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrForbidden
		}
		return nil
	}))
}
