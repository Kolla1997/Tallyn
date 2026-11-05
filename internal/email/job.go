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
	NotifyBudgets(ctx context.Context, today time.Time) (int, error)
	EmailOutbox(ctx context.Context, max int) ([]db.OutboxEmail, error)
	MarkEmailed(ctx context.Context, ids []string) error
	WeeklyDue(ctx context.Context, now time.Time) ([]db.WeeklyDue, error)
	WeeklySummary(ctx context.Context, householdID, userID string, weekStart time.Time) (json.RawMessage, error)
	MarkWeekly(ctx context.Context, householdID, userID string, weekStart time.Time, sent bool) error
	MonthlyDue(ctx context.Context, now time.Time) ([]db.WeeklyDue, error)
	MonthlySummary(ctx context.Context, householdID, userID string, monthStart time.Time) (json.RawMessage, error)
	MarkMonthly(ctx context.Context, householdID, userID string, monthStart time.Time, sent bool) error
	WelcomeDue(ctx context.Context, now time.Time) ([]db.WelcomeDue, error)
	MarkWelcome(ctx context.Context, userID string, sent bool) error
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
	if _, err := j.Outbox.NotifyBudgets(ctx, now); err != nil {
		log.Printf("email: spending limits: %v", err)
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
	j.welcome(ctx, now)
	j.weekly(ctx, now)
	j.monthly(ctx, now)
}

// welcome sends the welcome email (#280) once to each new account; a failed
// send is tried again next round.
func (j *Job) welcome(ctx context.Context, now time.Time) {
	due, err := j.Outbox.WelcomeDue(ctx, now)
	if err != nil {
		log.Printf("email: welcome due: %v", err)
		return
	}
	sent := 0
	for _, d := range due {
		m, err := ComposeWelcome(Welcome{Name: d.Name}, Links{App: j.AppURL, Logo: j.LogoURL})
		if err != nil {
			log.Printf("email: welcome compose: %v", err)
			_ = j.Outbox.MarkWelcome(ctx, d.UserID, false) // can't be built: don't retry forever
			continue
		}
		m.To = d.Email
		if err := j.Sender.Send(ctx, m); err != nil {
			log.Printf("email: send welcome: %v", err)
			continue
		}
		if err := j.Outbox.MarkWelcome(ctx, d.UserID, true); err != nil {
			log.Printf("email: mark welcome: %v", err)
		}
		sent++
	}
	if sent > 0 {
		log.Printf("email: sent %d welcome emails", sent)
	}
}

// monthly sends the monthly highlights due now (#274), as weekly does.
func (j *Job) monthly(ctx context.Context, now time.Time) {
	due, err := j.Outbox.MonthlyDue(ctx, now)
	if err != nil {
		log.Printf("email: monthly due: %v", err)
		return
	}
	sent := 0
	for _, d := range due {
		raw, err := j.Outbox.MonthlySummary(ctx, d.HouseholdID, d.UserID, d.WeekStart)
		var mo Monthly
		if err == nil {
			err = json.Unmarshal(raw, &mo)
		}
		if err != nil {
			log.Printf("email: monthly summary: %v", err)
			continue
		}
		if mo.Quiet() {
			if err := j.Outbox.MarkMonthly(ctx, d.HouseholdID, d.UserID, d.WeekStart, false); err != nil {
				log.Printf("email: mark monthly: %v", err)
			}
			continue
		}
		token := Sign(j.LinkKey, Link{UserID: d.UserID, HouseholdID: d.HouseholdID, Kind: db.EmailMonthly})
		m, err := ComposeMonthly(mo, Links{App: j.AppURL, Logo: j.LogoURL}, token, d.Household)
		if err != nil {
			log.Printf("email: monthly compose: %v", err)
			_ = j.Outbox.MarkMonthly(ctx, d.HouseholdID, d.UserID, d.WeekStart, false) // can't be built: don't retry forever
			continue
		}
		m.To = d.Email
		if err := j.Sender.Send(ctx, m); err != nil {
			log.Printf("email: send monthly: %v", err)
			continue
		}
		if err := j.Outbox.MarkMonthly(ctx, d.HouseholdID, d.UserID, d.WeekStart, true); err != nil {
			log.Printf("email: mark monthly: %v", err)
		}
		sent++
	}
	if sent > 0 {
		log.Printf("email: sent %d monthly highlights", sent)
	}
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
	if e.Kind == "budget_near" || e.Kind == "budget_over" {
		l.Kind = db.EmailBudget // one stop link for both
	}
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
