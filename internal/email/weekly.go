package email

import (
	"bytes"
	"fmt"
	"html/template"
	"net/url"
	"strings"
)

// The weekly summary (#273, Dinesh picked D in drafts/273-weekly-summary.html),
// in the same frame as the alert emails (D1): the week's spending as one big
// number, a bar per day, tiles for the month so far, against last month and
// cash now, where it went, what's coming up, and (when asked) what's shared.

// emailBills is email_bills' answer (0031, #127): owners only, else nil.
// Paid bills are never in Spent; they get their own line and slip (Dinesh
// picked C of drafts/127-bills-email.html).
type emailBills struct {
	PaidTotal int64 `json:"paid_total"`
	Paid      []struct {
		Name        string
		PaidOn      string `json:"paid_on"`
		AmountMinor int64  `json:"amount_minor"`
	}
	Due []struct {
		Name        string
		DueDate     string `json:"due_date"`
		AmountMinor int64  `json:"amount_minor"`
		Varies      bool
	}
}

// lineAndRows: "Plus $X in bills you marked paid." and a slip row per bill.
func (b *emailBills) lineAndRows(m func(int64) string) (string, []slipRow) {
	if b == nil || len(b.Paid) == 0 {
		return "", nil
	}
	var rows []slipRow
	for _, p := range b.Paid {
		rows = append(rows, slipRow{Label: p.Name, Meta: "Paid " + weekday(p.PaidOn) + ", " + longDate(p.PaidOn), Value: m(p.AmountMinor)})
	}
	return "Plus " + m(b.PaidTotal) + " in bills you marked paid.", rows
}

// Weekly is weekly_summary's answer (0024).
type Weekly struct {
	WeekStart string `json:"week_start"`
	WeekEnd   string `json:"week_end"`
	Currency  string `json:"currency"`
	Spent     int64  `json:"spent"`
	CameIn    int64  `json:"came_in"`
	Days      []int64
	Purchases []struct {
		Name        string
		Date        string
		AmountMinor int64 `json:"amount_minor"`
		Category    *string
	}
	More      int
	Month     weeklyMonth
	CashMinor int64 `json:"cash_minor"`
	Due       []struct {
		Account     string
		DueDate     *string `json:"due_date"`
		AmountMinor *int64  `json:"amount_minor"`
		Overdue     bool
	}
	Bills  *emailBills
	Shared []struct {
		Name    string
		Kid     bool
		Month   weeklyMonth
		Biggest *struct {
			Name        string
			Date        string
			AmountMinor int64 `json:"amount_minor"`
		}
	}
}

type weeklyMonth struct {
	From     string
	To       string
	Spent    int64
	LastFrom string `json:"last_from"`
	LastTo   string `json:"last_to"`
	Last     int64
	Avg3     *int64
}

// Quiet is a week with nothing spent and nothing in: no email.
func (w Weekly) Quiet() bool { return w.Spent == 0 && w.CameIn == 0 }

type weeklyView struct {
	Heading, Big, Under, LogoURL, OpenURL, StopURL, SettingsURL, Household, Why, StopText string
	Bars                                                                                  []bar
	Tiles                                                                                 []tile
	Rows, Due                                                                             []slipRow
	Shared                                                                                []sharedView
	BillsLine                                                                             string
	BillRows                                                                              []slipRow
}

type bar struct {
	Day    string
	Height int // px, 2 for an empty day
	Empty  bool
	Color  string // red for the week's big days, green for small ones (#274)
}

type tile struct{ Label, Value string }

type sharedView struct {
	Name, Now, Then, NowLabel, ThenLabel, Note string
	NowPct, ThenPct                            int
	Biggest                                    *slipRow
}

// ComposeWeekly builds the weekly summary email.
func ComposeWeekly(w Weekly, links Links, token, household string) (Message, error) {
	cur := w.Currency
	m := func(v int64) string { return formatMoney(v, cur) }
	start, ok1 := parse(w.WeekStart)
	end, ok2 := parse(w.WeekEnd)
	if !ok1 || !ok2 || len(w.Days) != 7 {
		return Message{}, fmt.Errorf("email: weekly summary without its week")
	}
	span := start.Format("Jan 2") + " – " + end.Format("Jan 2")
	if start.Month() == end.Month() {
		span = start.Format("Jan 2") + " – " + end.Format("2")
	}
	logo := links.Logo
	if logo == "" {
		logo = links.App + "/email/coinroof-logo.png"
	}
	v := weeklyView{
		Heading: "Your week, " + span, Big: m(w.Spent), LogoURL: logo, Household: household,
		Why: "You're getting this because the weekly summary is on for " + household + ".", StopText: "Stop weekly summaries",
		OpenURL: links.App + "/", SettingsURL: links.App + "/settings", StopURL: links.App + "/unsubscribe?t=" + url.QueryEscape(token),
	}
	v.Under = "spent, and nothing came in"
	if w.CameIn > 0 {
		v.Under = "spent, and " + m(w.CameIn) + " came in"
	}
	var top int64
	for _, d := range w.Days {
		top = max(top, d)
	}
	for i, d := range w.Days {
		h := 2
		if top > 0 && d > 0 {
			h = max(4, int(d*64/top))
		}
		v.Bars = append(v.Bars, bar{Day: start.AddDate(0, 0, i).Format("Mon"), Height: h, Empty: d == 0, Color: heatFor(d, top)})
	}
	v.Tiles = []tile{
		{"Month so far", m(w.Month.Spent)},
		{"vs " + monthSpan(w.Month.LastFrom, w.Month.LastTo), compare(w.Month.Spent, w.Month.Last, m)},
		{"Cash now", m(w.CashMinor)},
	}
	for _, p := range w.Purchases {
		meta := weekday(p.Date)
		if p.Category != nil {
			meta += ", " + strings.ToLower(strings.ReplaceAll(*p.Category, "_", " "))
		}
		v.Rows = append(v.Rows, slipRow{Label: p.Name, Meta: meta, Value: m(p.AmountMinor)})
	}
	if w.More > 0 {
		v.Rows = append(v.Rows, slipRow{Label: fmt.Sprintf("And %d more", w.More), Meta: "In Transactions"})
	}
	for _, d := range w.Due {
		r := slipRow{Label: d.Account}
		if d.AmountMinor != nil {
			r.Value = m(*d.AmountMinor)
		}
		switch {
		case d.Overdue:
			r.Red, r.Value = true, strings.TrimSpace(r.Value+" overdue")
			if d.DueDate != nil {
				r.Meta = "Was due " + longDate(*d.DueDate)
			}
		case d.DueDate != nil:
			r.Meta = "Due " + weekday(*d.DueDate) + ", " + longDate(*d.DueDate)
		}
		v.Due = append(v.Due, r)
	}
	v.BillsLine, v.BillRows = w.Bills.lineAndRows(m)
	if w.Bills != nil {
		for _, d := range w.Bills.Due {
			r := slipRow{Label: d.Name, Meta: "Bill · Due " + weekday(d.DueDate) + ", " + longDate(d.DueDate), Value: m(d.AmountMinor)}
			if d.Varies {
				r.Value = "about " + r.Value
			}
			v.Due = append(v.Due, r)
		}
	}
	for _, s := range w.Shared {
		sv := sharedView{
			Name: s.Name, Now: m(s.Month.Spent), Then: m(s.Month.Last),
			NowLabel:  s.Name + ", " + monthSpan(s.Month.From, s.Month.To),
			ThenLabel: monthSpan(s.Month.LastFrom, s.Month.LastTo),
		}
		big := max(s.Month.Spent, s.Month.Last)
		if big > 0 {
			sv.NowPct, sv.ThenPct = int(s.Month.Spent*100/big), int(s.Month.Last*100/big)
		}
		sv.Note = sentenceCompare(s.Month.Spent, s.Month.Last, s.Month.Avg3, m)
		if s.Biggest != nil {
			sv.Biggest = &slipRow{Label: "Biggest this month", Meta: s.Biggest.Name + ", " + shortDay(s.Biggest.Date), Value: m(s.Biggest.AmountMinor)}
		}
		v.Shared = append(v.Shared, sv)
	}
	var html bytes.Buffer
	if err := weeklyPage.Execute(&html, v); err != nil {
		return Message{}, err
	}
	return Message{
		Subject:     "Your week: " + m(w.Spent) + " spent (" + span + ")",
		HTML:        html.String(),
		Text:        weeklyText(v),
		Unsubscribe: links.App + "/api/email/unsubscribe?t=" + url.QueryEscape(token),
	}, nil
}

// compare says how this month so far compares with the same days before.
func compare(now, then int64, m func(int64) string) string {
	switch {
	case now == then:
		return "Same"
	case now > then:
		return m(now-then) + " more"
	default:
		return m(then-now) + " less"
	}
}

func sentenceCompare(now, then int64, avg *int64, m func(int64) string) string {
	s := "Same as last month so far"
	if now != then {
		s = compare(now, then, m) + " than last month so far"
	}
	if avg != nil && *avg > 0 && now != *avg {
		s += ", and " + compare(now, *avg, m) + " than the 3-month average (" + m(*avg) + ")"
	}
	return s + "."
}

// monthSpan writes "Sep 1–25".
func monthSpan(from, to string) string {
	f, ok1 := parse(from)
	t, ok2 := parse(to)
	if !ok1 || !ok2 {
		return "last month"
	}
	return f.Format("Jan 2") + "–" + t.Format("2")
}

func shortDay(d string) string {
	if t, ok := parse(d); ok {
		return t.Format("Jan 2")
	}
	return ""
}

func weeklyText(v weeklyView) string {
	var b strings.Builder
	b.WriteString(v.Heading + "\n\n" + v.Big + " " + v.Under + "\n")
	if v.BillsLine != "" {
		b.WriteString(v.BillsLine + "\n")
	}
	b.WriteString("\n")
	for _, t := range v.Tiles {
		b.WriteString(t.Label + ": " + t.Value + "\n")
	}
	if len(v.BillRows) > 0 {
		b.WriteString("\nBills paid\n")
		for _, r := range v.BillRows {
			b.WriteString(r.Label + " (" + r.Meta + ") " + r.Value + "\n")
		}
	}
	if len(v.Rows) > 0 {
		b.WriteString("\nWhere it went\n")
		for _, r := range v.Rows {
			b.WriteString(r.Label + " (" + r.Meta + ") " + r.Value + "\n")
		}
	}
	if len(v.Due) > 0 {
		b.WriteString("\nComing up\n")
		for _, r := range v.Due {
			b.WriteString(r.Label + " " + r.Value + " " + r.Meta + "\n")
		}
	}
	for _, s := range v.Shared {
		b.WriteString("\n" + s.NowLabel + ": " + s.Now + ". " + s.Note + "\n")
	}
	b.WriteString("\nOpen Coinroof: " + v.OpenURL + "\n\nYou're getting this because the weekly summary is on for " + v.Household +
		".\nStop weekly summaries: " + v.StopURL + "\nEmail settings: " + v.SettingsURL + "\n")
	return b.String()
}

// weeklyPage: on a computer "Where it went" and "Coming up" sit side by side
// (.cols, .col in frameCSS); on a phone they stack, as in the card.
var weeklyPage = template.Must(template.New("weekly").Funcs(funcs).Parse(frameHead + `<title>{{.Heading}}</title></head>
` + frameTop + `
<tr><td align="center" style="padding:24px 24px 0;text-align:center"><div style="max-width:760px;margin:0 auto">
<h1 style="margin:0;{{head}};font-weight:700;font-size:22px;line-height:1.25;color:#18181b">{{.Heading}}</h1>
<div style="margin-top:12px;{{head}};font-weight:700;font-size:40px;line-height:1.1;color:#18181b;font-variant-numeric:tabular-nums">{{.Big}}</div>
<p style="margin:6px 0 0;font-size:14px;color:#3f3f46">{{.Under}}</p>
{{if .BillsLine}}<p style="margin:2px 0 0;font-size:14px;color:#52525b">{{.BillsLine}}</p>{{end}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;max-width:480px;margin-left:auto;margin-right:auto"><tr>
{{range .Bars}}<td align="center" valign="bottom" style="padding:0 3px;height:66px;vertical-align:bottom"><div style="height:{{.Height}}px;line-height:{{.Height}}px;font-size:0;max-width:34px;margin:0 auto;border-radius:6px 6px 2px 2px;background:{{.Color}}">&nbsp;</div></td>{{end}}
</tr><tr>{{range .Bars}}<td align="center" style="padding-top:4px;font-size:12px;color:#52525b">{{.Day}}</td>{{end}}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-top:8px;border-collapse:separate;max-width:560px;margin-left:auto;margin-right:auto"><tr>
{{range .Tiles}}<td align="center" width="33%" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:14px;padding:10px 4px;text-align:center"><div style="font-size:12px;color:#52525b">{{.Label}}</div><div style="{{head}};font-weight:700;font-size:16px;color:#18181b;font-variant-numeric:tabular-nums">{{.Value}}</div></td>{{end}}
</tr></table></div></td></tr>
<tr><td style="padding:0"><div class="cols" style="margin:0 auto;font-size:0">
<div class="col" style="font-size:16px">{{if .Rows}}<div class="sh" style="padding:20px 24px 0;{{head}};font-weight:700;font-size:16px;text-align:left">{{uniq}}Where it went</div>{{template "slip" .Rows}}{{end}}</div><div class="col" style="font-size:16px">
{{if .BillRows}}<div class="sh" style="padding:20px 24px 0;{{head}};font-weight:700;font-size:16px;text-align:left">{{uniq}}Bills paid</div>{{template "slip" .BillRows}}{{end}}
{{if .Due}}<div class="sh" style="padding:20px 24px 0;{{head}};font-weight:700;font-size:16px;text-align:left">{{uniq}}Coming up</div>{{template "slip" .Due}}{{end}}
{{if .Shared}}<div class="shw" style="padding:20px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #a1a1aa;border-radius:16px;border-collapse:separate">
<tr><td style="padding:14px 16px 0;{{head}};font-weight:700;font-size:16px;text-align:center">{{uniq}}Shared with you</td></tr>
<tr><td style="padding:4px 16px 0;font-size:13px;color:#3f3f46;text-align:center">Only what's shared with you in Family, and your children's totals.</td></tr>
{{range .Shared}}<tr><td style="padding:12px 16px 0;font-size:14px">{{uniq}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:left">{{.NowLabel}}</td><td align="right" style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">{{.Now}}</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;background:#f4f4f5;border-radius:999px"><tr><td width="{{.NowPct}}%" style="height:8px;font-size:0;line-height:0;background:#18181b;border-radius:999px">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;color:#52525b"><tr><td style="text-align:left">{{.ThenLabel}}</td><td align="right" style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums">{{.Then}}</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;background:#f4f4f5;border-radius:999px"><tr><td width="{{.ThenPct}}%" style="height:8px;font-size:0;line-height:0;background:#a1a1aa;border-radius:999px">&nbsp;</td><td style="font-size:0;line-height:0">&nbsp;</td></tr></table>
<p style="margin:8px 0 0;font-size:13px;color:#3f3f46;text-align:left">{{.Note}}</p>
{{with .Biggest}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-top:1px dotted #e4e4e7"><tr><td style="padding-top:8px;text-align:left">{{.Label}}<div style="font-size:12px;color:#52525b">{{.Meta}}</div></td><td align="right" style="padding-top:8px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">{{.Value}}</td></tr></table>{{end}}
</td></tr>{{end}}
<tr><td style="padding:0 0 14px"></td></tr></table></div>{{end}}
</div></div></td></tr>
<tr><td align="center" style="padding:20px 24px 24px;text-align:center"><a href="{{.OpenURL}}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:999px;padding:12px 24px">Open Coinroof</a></td></tr>
` + frameEnd + frameSlip))
