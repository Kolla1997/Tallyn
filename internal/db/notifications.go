package db

import (
	"context"
	"encoding/json"
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
