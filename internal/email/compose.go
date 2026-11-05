package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"net/url"
	"strings"
	"time"

	"github.com/Kolla1997/Tallyn/internal/money"
)

// The emails Dinesh picked (option C in drafts/269-notification-emails.html):
// a plain heading that says what to do, the amount in a tile, one button.
// Solid colours only: mail apps don't blur. Red only for overdue. Gmail
// doesn't load web fonts, so each face falls back to a close one already on
// the device (Avenir Next on Apple, Segoe UI on Windows).

// Alert is what an email is about, from the alert's data (0023).
type Alert struct {
	Kind string // "reconnect" or "payment_due"
	Data json.RawMessage
}

type alertData struct {
	Bank           string `json:"bank"`
	Account        string `json:"account"`
	DueDate        string `json:"due_date"`
	AmountMinor    *int64 `json:"amount_minor"`
	StatementMinor *int64 `json:"statement_minor"`
	Currency       string `json:"currency"`
	Overdue        bool   `json:"overdue"`
	Person         string `json:"person"` // set when it's someone else's (a child's)
}

// view is what the template shows.
type view struct {
	Heading, Label, Figure, Chip, Body, Statement, Note, Button, ButtonURL, Why, StopText, StopURL, SettingsURL, LogoURL string
	Red, Kid                                                                                                             bool
	Tile                                                                                                                 string // bank name, for reconnect
}

// Links are where an email's links and logo point.
type Links struct {
	App  string // the app's address, e.g. https://coinroof.us
	Logo string // a public PNG of the Coinroof lockup; mail apps can't load localhost
}

// Compose builds the email for an alert. links.App is the app's address, token
// the signed unsubscribe link (Sign): the footer opens the page that asks
// first (mail scanners open links), mail apps' own button posts to the API.
func Compose(a Alert, links Links, token, household string) (Message, error) {
	appURL := links.App
	unsubscribe := appURL + "/api/email/unsubscribe?t=" + url.QueryEscape(token)
	var d alertData
	if err := json.Unmarshal(a.Data, &d); err != nil {
		return Message{}, fmt.Errorf("email: alert data: %w", err)
	}
	logo := links.Logo
	if logo == "" {
		logo = appURL + "/email/coinroof-logo.png"
	}
	v := view{LogoURL: logo, SettingsURL: appURL + "/settings", StopURL: appURL + "/unsubscribe?t=" + url.QueryEscape(token)}
	var subject string
	switch a.Kind {
	case "reconnect":
		bank := orDefault(d.Bank, "Your bank")
		v.Tile, v.Chip, v.Button, v.ButtonURL = bank, "Needs sign-in", "Reconnect", appURL+"/accounts"
		if d.Person != "" {
			v.Kid = true
			subject = d.Person + "'s bank needs reconnecting"
			v.Heading = d.Person + "'s bank needs signing in again"
			v.Body = "Only " + d.Person + " can reconnect it. You're getting this because you asked for " + d.Person + "'s reconnect emails."
			v.Button, v.StopText = "Open Coinroof", "Stop "+d.Person+"'s emails"
		} else {
			subject = "Reconnect " + bank
			v.Heading = bank + " needs you to sign in again"
			v.Body = "We can't update your balances or purchases from " + bank + " until you reconnect. It takes about a minute."
			v.Why, v.StopText = "You're getting this because reconnect emails are on for "+household+".", "Stop reconnect emails"
		}
	case "payment_due":
		account := orDefault(d.Account, "card")
		due := longDate(d.DueDate)
		v.Button, v.ButtonURL = "See your card", appURL+"/debts"
		v.Why, v.StopText = "You're getting this because payment-due emails are on for "+household+".", "Stop payment-due emails"
		if d.AmountMinor != nil {
			v.Figure = formatMoney(*d.AmountMinor, d.Currency)
		}
		if d.Overdue {
			subject = "Overdue: " + account
			v.Heading = "Your " + account + " payment is overdue"
			v.Label, v.Chip, v.Red = "Past due", "Overdue", true
			v.Body = "It was due " + due + ". Paying soon can limit late fees. If you've already paid, this clears on the next update."
		} else {
			day := weekday(d.DueDate)
			subject = "Payment due " + day + ": " + account
			v.Heading = "Your " + account + " payment is due " + day
			v.Label, v.Chip = "Minimum payment", "Due "+shortDate(d.DueDate)
			if d.StatementMinor != nil && *d.StatementMinor > 0 {
				v.Statement = formatMoney(*d.StatementMinor, d.Currency) // bold in the HTML
			}
		}
	default:
		return Message{}, fmt.Errorf("email: no email for %q alerts", a.Kind)
	}
	var html bytes.Buffer
	if err := page.Execute(&html, v); err != nil {
		return Message{}, err
	}
	return Message{Subject: subject, HTML: html.String(), Text: text(v), Unsubscribe: unsubscribe}, nil
}

func text(v view) string {
	var b strings.Builder
	b.WriteString(v.Heading + "\n\n")
	if v.Figure != "" {
		b.WriteString(v.Label + ": " + v.Figure + " (" + v.Chip + ")\n")
	}
	if v.Tile != "" {
		b.WriteString(v.Tile + ": " + v.Chip + "\n")
	}
	if v.Statement != "" {
		b.WriteString("\nYour statement balance is " + v.Statement + ". Paying it in full avoids interest.\n")
	}
	if v.Body != "" {
		b.WriteString("\n" + v.Body + "\n")
	}
	b.WriteString("\n" + v.Button + ": " + v.ButtonURL + "\n\n")
	if v.Why != "" {
		b.WriteString(v.Why + "\n")
	}
	b.WriteString(v.StopText + ": " + v.StopURL + "\nEmail settings: " + v.SettingsURL + "\n")
	return b.String()
}

func orDefault(s, d string) string {
	if strings.TrimSpace(s) == "" {
		return d
	}
	return s
}

func parse(d string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", d)
	return t, err == nil
}

func weekday(d string) string {
	if t, ok := parse(d); ok {
		return t.Format("Monday")
	}
	return "soon"
}

func shortDate(d string) string {
	if t, ok := parse(d); ok {
		return t.Format("Jan 2")
	}
	return "soon"
}

func longDate(d string) string {
	if t, ok := parse(d); ok {
		return t.Format("January 2")
	}
	return "recently"
}

// formatMoney writes minor units as "$1,234.56" (or "EUR 1,234.56").
func formatMoney(minor int64, currency string) string {
	exp, ok := money.Exponent(currency)
	if !ok {
		exp = 2
	}
	sign := ""
	if minor < 0 {
		sign, minor = "-", -minor
	}
	div := int64(1)
	for i := 0; i < exp; i++ {
		div *= 10
	}
	whole := fmt.Sprintf("%d", minor/div)
	for i := len(whole) - 3; i > 0; i -= 3 {
		whole = whole[:i] + "," + whole[i:]
	}
	s := whole
	if exp > 0 {
		s += fmt.Sprintf(".%0*d", exp, minor%div)
	}
	if currency == "" || currency == "USD" {
		return sign + "$" + s
	}
	return sign + currency + " " + s
}

// page is the email, with inline styles: many mail apps drop <style>.
var page = template.Must(template.New("email").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet"><title>{{.Heading}}</title></head>
<body style="margin:0;padding:0;background:#f6f1ea;font-family:Montserrat,'Avenir Next',Avenir,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea"><tr><td style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #ece6dd;border-radius:22px"><tr><td align="center" style="padding:28px 24px;text-align:center">
<img src="{{.LogoURL}}" alt="Coinroof" width="138" height="28" style="display:block;height:28px;width:138px;border:0;margin:0 auto 20px;font-family:'Space Grotesk','Avenir Next',Avenir,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700;font-size:18px;color:#18181b">
<h1 style="margin:0 0 8px;font-family:'Space Grotesk','Avenir Next',Avenir,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;line-height:1.25;color:#18181b">{{.Heading}}</h1>
{{if .Figure}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;border-radius:16px;margin-top:16px"><tr>
<td align="center" style="padding:16px;text-align:center"><div style="font-size:13px;color:#52525b">{{.Label}}</div><div style="font-family:'Space Grotesk','Avenir Next',Avenir,'Segoe UI',Helvetica,Arial,sans-serif;font-weight:700;font-size:30px;line-height:1.2;font-variant-numeric:tabular-nums;color:{{if .Red}}#cb0900{{else}}#18181b{{end}}">{{.Figure}}</div>
<span style="display:inline-block;margin-top:6px;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;{{if .Red}}background:#fde8e7;color:#a30700{{else}}background:#e4e4e7;color:#3f3f46{{end}}">{{.Chip}}</span></td></tr></table>{{end}}
{{if .Tile}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ea;border-radius:16px;margin-top:16px"><tr>
<td align="center" style="padding:16px;text-align:center"><div style="font-weight:700;font-size:16px;color:#18181b">{{.Tile}}</div>
<span style="display:inline-block;margin-top:6px;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;background:#fde8e7;color:#a30700">{{.Chip}}</span></td></tr></table>{{end}}
{{if .Statement}}<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#3f3f46">Your statement balance is <b style="font-weight:700;color:#18181b">{{.Statement}}</b>. Paying it in full avoids interest.</p>{{end}}
{{if .Body}}<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#3f3f46">{{.Body}}</p>{{end}}
<a href="{{.ButtonURL}}" style="display:inline-block;margin-top:20px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:999px;padding:12px 22px">{{.Button}}</a>
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#52525b;text-align:center">{{if .Why}}{{.Why}}<br>{{end}}<a href="{{.StopURL}}" style="color:#3f3f46">{{.StopText}}</a> · <a href="{{.SettingsURL}}" style="color:#3f3f46">Email settings</a></p>
</td></tr></table></body></html>`))
