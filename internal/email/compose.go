package email

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"net/url"
	"strings"
	"time"

	"github.com/Kolla1997/Tallyn/internal/money"
)

// The emails Dinesh picked (D1 in drafts/269-email-backgrounds.html): a
// white page and a white card with a thin edge; a black band with the
// red-fade logo; for a payment, a calendar leaf with the due date; the
// figures on a slip, the total last and biggest; one button. Solid colours
// only: mail apps don't blur. Red only for the calendar top and what you owe.
// Gmail doesn't load web fonts, so each face falls back to a close one
// already on the device (Avenir Next on Apple, Segoe UI on Windows).

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
	Heading, Body, Note, Button, ButtonURL, Why, StopText, StopURL, SettingsURL, LogoURL string
	Date                                                                                 *leaf // payment due: the calendar leaf
	Rows                                                                                 []slipRow
}

// leaf is the calendar leaf: NOV · 7 · Saturday.
type leaf struct{ Month, Day, Weekday string }

// slipRow is one line on the slip. Total is the last, biggest figure; Chip
// shows the value as a red chip ("Needs sign-in"); Red marks what's overdue.
type slipRow struct {
	Label, Meta, Value string // Meta: a smaller line under the label
	Total, Chip, Red   bool
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
		v.Rows = []slipRow{{Label: bank, Value: "Needs sign-in", Chip: true}}
		v.Button, v.ButtonURL = "Reconnect", appURL+"/accounts"
		if d.Person != "" {
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
		v.Button, v.ButtonURL = "See your card", appURL+"/debts"
		v.Why, v.StopText = "You're getting this because payment-due emails are on for "+household+".", "Stop payment-due emails"
		if t, ok := parse(d.DueDate); ok {
			v.Date = &leaf{Month: strings.ToUpper(t.Format("Jan")), Day: t.Format("2"), Weekday: t.Format("Monday")}
		}
		if d.StatementMinor != nil && *d.StatementMinor > 0 && !d.Overdue {
			v.Rows = append(v.Rows, slipRow{Label: "Statement balance", Value: formatMoney(*d.StatementMinor, d.Currency)})
		}
		if d.AmountMinor != nil {
			label := "Minimum payment"
			if d.Overdue {
				label = "Past due"
			}
			v.Rows = append(v.Rows, slipRow{Label: label, Value: formatMoney(*d.AmountMinor, d.Currency), Total: true, Red: d.Overdue})
		}
		if d.Overdue {
			subject = "Overdue: " + account
			v.Heading = "Your " + account + " payment is overdue"
			v.Body = "It was due " + longDate(d.DueDate) + ". Paying soon can limit late fees. If you've already paid, this clears on the next update."
		} else {
			day := weekday(d.DueDate)
			subject = "Payment due " + day + ": " + account
			v.Heading = "Your " + account + " payment is due " + day
			if len(v.Rows) > 1 {
				v.Body = "Paying the full statement balance avoids interest."
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
	for _, r := range v.Rows {
		b.WriteString(r.Label + ": " + r.Value + "\n")
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

// page is the email, with inline styles: many mail apps drop <style>. The
// inline styles are the phone layout (the card, D1); frameCSS turns it edge
// to edge on a computer (Dinesh picked D in drafts/273-email-edge-to-edge.html):
// a full-width black band and footer, the words in a centred column. Mail apps
// that ignore <style> show the phone card.
const (
	head = "font-family:'Space Grotesk','Avenir Next',Avenir,'Segoe UI',Helvetica,Arial,sans-serif"
	body = "font-family:Montserrat,'Avenir Next',Avenir,'Segoe UI',Helvetica,Arial,sans-serif"
)

const frameHead = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
<style>
@media only screen and (min-width:600px) {
  .pg { padding:0 !important }
  .card { max-width:none !important; border:0 !important; border-radius:0 !important; box-shadow:none !important }
  .band { border-radius:0 !important }
  .foot { max-width:none !important; margin:0 !important; background:#18181b !important; color:#d4d4d8 !important; padding:20px !important }
  .foot a { color:#ffffff !important }
  .cols { max-width:960px !important; padding:0 24px !important }
  .col { display:inline-block !important; width:47% !important; margin:0 1.5% !important; vertical-align:top !important }
  .col .slipo { background:transparent !important; border:0 !important; padding:10px 0 0 !important }
  .col .slipi { max-width:none !important; background:#fafafa !important; border:1px solid #e4e4e7 !important; border-radius:14px !important }
  .col .sh { padding-left:0 !important }
  .col .shw { padding:20px 0 0 !important }
}
</style>`

// The parts both emails share: the start of the card with the band, the
// slip, and the end with the footer.
const (
	frameTop = `<body style="margin:0;padding:0;background:#ffffff;{{body}};color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td class="pg" style="padding:24px 12px">
<table class="card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:22px;border-collapse:separate;overflow:hidden;box-shadow:0 6px 20px rgba(24,24,27,.08),0 1px 3px rgba(24,24,27,.06)">
<tr><td class="band" align="center" style="background:#18181b;padding:18px 24px;border-radius:21px 21px 0 0"><img src="{{.LogoURL}}" alt="Coinroof" width="138" height="28" style="display:block;height:28px;width:138px;border:0;margin:0 auto;{{head}};font-weight:700;font-size:18px;color:#ffffff"></td></tr>`
	frameSlip = `{{define "slip"}}<table class="slipo" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-top:2px dashed #e4e4e7;border-bottom:2px dashed #e4e4e7;margin-top:10px"><tr><td align="center">
<table class="slipi" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
{{range $i, $r := .}}<tr><td style="padding:10px 0 10px 24px;font-size:15px;color:#3f3f46;text-align:left{{if $i}};border-top:1px dotted #e4e4e7{{end}}">{{uniq}}{{$r.Label}}{{if $r.Meta}}<div style="font-size:12px;color:#52525b">{{$r.Meta}}</div>{{end}}</td>
<td align="right" style="padding:10px 24px 10px 8px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums{{if $i}};border-top:1px dotted #e4e4e7{{end}}">{{if $r.Chip}}<span style="display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;background:#fde8e7;color:#a30700">{{$r.Value}}</span>{{else if $r.Total}}<span style="{{head}};font-weight:700;font-size:22px;color:{{if $r.Red}}#cb0900{{else}}#18181b{{end}}">{{$r.Value}}</span>{{else}}<b style="font-weight:700;color:{{if $r.Red}}#cb0900{{else}}#18181b{{end}}">{{$r.Value}}</b>{{end}}</td></tr>
{{end}}</table></td></tr></table>{{end}}`
	frameEnd = `</table>
<p class="foot" style="max-width:480px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#52525b;text-align:center">{{if .Why}}{{.Why}}<br>{{end}}<a href="{{.StopURL}}" style="color:#3f3f46">{{.StopText}}</a> · <a href="{{.SettingsURL}}" style="color:#3f3f46">Email settings</a></p>
</td></tr></table></body></html>`
)

var funcs = template.FuncMap{"head": func() template.CSS { return head }, "body": func() template.CSS { return body }, "uniq": uniq}

// uniq is a hidden, different marker for each block: Gmail hides ("•••")
// blocks that match ones in earlier emails from us, and a summary repeats
// last week's purchases or bills (#274).
func uniq() template.HTML {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return template.HTML(`<span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">` + hex.EncodeToString(b) + `</span>`)
}

var page = template.Must(template.New("email").Funcs(funcs).Parse(frameHead + `<title>{{.Heading}}</title></head>
` + frameTop + `
<tr><td align="center" style="padding:24px 24px 0;text-align:center"><div style="max-width:560px;margin:0 auto">
{{with .Date}}<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="width:92px;margin:0 auto 16px;border:1px solid #e4e4e7;border-radius:16px;border-collapse:separate;overflow:hidden;background:#ffffff">
<tr><td align="center" style="background:#cb0900;color:#ffffff;font-size:12px;font-weight:700;padding:4px 0;border-radius:15px 15px 0 0">{{.Month}}</td></tr>
<tr><td align="center" style="{{head}};font-weight:700;font-size:34px;line-height:1.2;padding-top:6px;color:#18181b">{{.Day}}</td></tr>
<tr><td align="center" style="font-size:12px;color:#52525b;padding-bottom:8px">{{.Weekday}}</td></tr></table>{{end}}
<h1 style="margin:0;{{head}};font-weight:700;font-size:22px;line-height:1.25;color:#18181b">{{.Heading}}</h1>
</div></td></tr>
{{if .Rows}}<tr><td style="padding:10px 0 0">{{template "slip" .Rows}}</td></tr>{{end}}
<tr><td align="center" style="padding:0 24px 24px;text-align:center"><div style="max-width:560px;margin:0 auto">
{{if .Body}}<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#3f3f46">{{.Body}}</p>{{end}}
<a href="{{.ButtonURL}}" style="display:inline-block;margin-top:20px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:999px;padding:12px 24px">{{.Button}}</a>
</div></td></tr>` + frameEnd + frameSlip))
