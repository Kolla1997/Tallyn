package email

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/Kolla1997/Tallyn/internal/db"
)

// Outbox is the database side of the job: db.System.
type Outbox interface {
	NotifyPaymentsDue(ctx context.Context, today time.Time) (int, error)
	EmailOutbox(ctx context.Context, max int) ([]db.OutboxEmail, error)
	MarkEmailed(ctx context.Context, ids []string) error
	WeeklyDue(ctx context.Context, now time.Time) ([]db.WeeklyDue, error)
	WeeklySummary(ctx context.Context, householdID, userID string, weekStart time.Time) (json.RawMessage, error)
	MarkWeekly(ctx context.Context, householdID, userID string, weekStart time.Time, sent bool) error
}

// Job checks payments due and sends the emails alerts call for, every few
// minutes. Each alert is looked at once: sent, or skipped when the person
// hasn't turned that email on. A failed send is tried again next round.
type Job struct {
	Outbox  Outbox
	Sender  Sender
	LinkKey []byte
	AppURL  string // e.g. https://coinroof.us
	LogoURL string // public PNG of the lockup (EMAIL_LOGO_URL); defaults to AppURL's
	Every   time.Duration
}

const batch = 50

// Run runs the job until ctx ends.
func (j *Job) Run(ctx context.Context) {
	t := time.NewTicker(j.Every)
	defer t.Stop()
	for {
		j.Once(ctx, time.Now().UTC())
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Once runs one round.
func (j *Job) Once(ctx context.Context, now time.Time) {
	if _, err := j.Outbox.NotifyPaymentsDue(ctx, now); err != nil {
		log.Printf("email: payments due: %v", err)
	}
	list, err := j.Outbox.EmailOutbox(ctx, batch)
	if err != nil {
		log.Printf("email: outbox: %v", err)
		return
	}
	var done []string
	sent := 0
	for _, e := range list {
		if !e.Send {
			done = append(done, e.ID)
			continue
		}
		m, err := j.compose(e)
		if err != nil {
			log.Printf("email: alert %s: %v", e.ID, err)
			done = append(done, e.ID) // can't be built: don't retry forever
			continue
		}
		if err := j.Sender.Send(ctx, m); err != nil {
			log.Printf("email: send alert %s: %v", e.ID, err)
			continue
		}
		done = append(done, e.ID)
		sent++
	}
	if err := j.Outbox.MarkEmailed(ctx, done); err != nil {
		log.Printf("email: mark emailed: %v", err)
	}
	if sent > 0 {
		log.Printf("email: sent %d", sent)
	}
	j.weekly(ctx, now)
}

// weekly sends the weekly summaries due now (#273). A quiet week is marked
// and skipped; a failed send is tried again next round.
func (j *Job) weekly(ctx context.Context, now time.Time) {
	due, err := j.Outbox.WeeklyDue(ctx, now)
	if err != nil {
		log.Printf("email: weekly due: %v", err)
		return
	}
	sent := 0
	for _, d := range due {
		raw, err := j.Outbox.WeeklySummary(ctx, d.HouseholdID, d.UserID, d.WeekStart)
		var w Weekly
		if err == nil {
			err = json.Unmarshal(raw, &w)
		}
		if err != nil {
			log.Printf("email: weekly summary: %v", err)
			continue
		}
		if w.Quiet() {
			if err := j.Outbox.MarkWeekly(ctx, d.HouseholdID, d.UserID, d.WeekStart, false); err != nil {
				log.Printf("email: mark weekly: %v", err)
			}
			continue
		}
		token := Sign(j.LinkKey, Link{UserID: d.UserID, HouseholdID: d.HouseholdID, Kind: db.EmailWeekly})
		m, err := ComposeWeekly(w, Links{App: j.AppURL, Logo: j.LogoURL}, token, d.Household)
		if err != nil {
			log.Printf("email: weekly compose: %v", err)
			_ = j.Outbox.MarkWeekly(ctx, d.HouseholdID, d.UserID, d.WeekStart, false) // can't be built: don't retry forever
			continue
		}
		m.To = d.Email
		if err := j.Sender.Send(ctx, m); err != nil {
			log.Printf("email: send weekly: %v", err)
			continue
		}
		if err := j.Outbox.MarkWeekly(ctx, d.HouseholdID, d.UserID, d.WeekStart, true); err != nil {
			log.Printf("email: mark weekly: %v", err)
		}
		sent++
	}
	if sent > 0 {
		log.Printf("email: sent %d weekly summaries", sent)
	}
}

func (j *Job) compose(e db.OutboxEmail) (Message, error) {
	l := Link{UserID: e.UserID, HouseholdID: e.HouseholdID, Kind: e.Kind}
	if e.UserID != e.OwnerID {
		l.Kind, l.Kid = db.EmailKidReconnect, e.OwnerID
	}
	m, err := Compose(Alert{Kind: e.Kind, Data: e.Data}, Links{App: j.AppURL, Logo: j.LogoURL}, Sign(j.LinkKey, l), e.Household)
	if err != nil {
		return Message{}, err
	}
	m.To = e.Email
	return m, nil
}
