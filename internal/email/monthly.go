package email

import (
	"bytes"
	"fmt"
	"html/template"
	"net/url"
	"sort"
	"strings"
)

// The monthly highlights (#274, Dinesh picked D in drafts/274-monthly-highlights.html
// with "Where it went" as option 3 in drafts/274-where-it-went.html): the
// month's spending, how it compares, four highlights, a calendar of the
// month, and a split bar by category. Spending is coloured red for high and
// green for low (Dinesh, 2026-11-05), in the calendar, the split bar and the
// weekly email's day bars.

// Spending colours, highest first: spend-3, spend-2, spend-1, spend-low and
// money-in green from design-tokens.json.
var heat = []string{"#cb0900", "#e06b66", "#f7c6c2", "#8cc785", "#067b00"}

// heatText is readable text on each heat colour.
var heatText = map[string]string{"#cb0900": "#ffffff", "#e06b66": "#ffffff", "#f7c6c2": "#3f1a17", "#8cc785": "#14361a", "#067b00": "#ffffff"}

// heatFor colours v against the biggest value: red near the top, green for small.
func heatFor(v, top int64) string {
	if v <= 0 || top <= 0 {
		return "#e4e4e7"
	}
	r := float64(v) / float64(top)
	switch {
	case r >= 0.75:
		return heat[0]
	case r >= 0.4:
		return heat[1]
	case r >= 0.15:
		return heat[3]
	default:
		return heat[4]
	}
}

// Monthly is monthly_summary's answer (0025).
type Monthly struct {
	MonthStart string `json:"month_start"`
	MonthEnd   string `json:"month_end"`
	Currency   string
	Spent      int64
	CameIn     int64 `json:"came_in"`
	Compare    monthCompare
	Days       []int64
	Busiest    *struct {
		Date        string
		AmountMinor int64 `json:"amount_minor"`
	}
	Biggest    *namedAmount
	BiggestIn  *namedAmount `json:"biggest_in"`
	Categories []struct {
		Category    string
		AmountMinor int64 `json:"amount_minor"`
	}
	Shared []struct {
		Name    string
		Kid     bool
		Compare monthCompare
		Biggest *namedAmount
	}
}

type monthCompare struct {
	Spent, Last int64
	Avg3        *int64
}

type namedAmount struct {
	Name        string
	Date        string
	AmountMinor int64 `json:"amount_minor"`
}

// Quiet is a month with nothing spent and nothing in: no email.
func (m Monthly) Quiet() bool { return m.Spent == 0 && m.CameIn == 0 }

type monthlyView struct {
	Heading, Big, Under, Month, LastMonth, LogoURL, OpenURL, StopURL, SettingsURL, Why, StopText string
	Tiles, Highlights                                                                            []tile3
	Weeks                                                                                        [][]dayCell
	CalNote, CatNote                                                                             string
	Split                                                                                        []catView
	Shared                                                                                       []sharedView
}

type tile3 struct{ Label, Value, Meta string }

type dayCell struct {
	Day        string
	Bg, Fg     string
	Empty, Pad bool
}

type catView struct {
	Name, Value, Pct, Color, Text string
	Width                         float64
	Label                         bool // write the share on the bar (15% and up)
}

// ComposeMonthly builds the monthly highlights email.
func ComposeMonthly(mo Monthly, links Links, token, household string) (Message, error) {
	cur := mo.Currency
	m := func(v int64) string { return formatMoney(v, cur) }
	start, ok1 := parse(mo.MonthStart)
	_, ok2 := parse(mo.MonthEnd)
	if !ok1 || !ok2 || len(mo.Days) < 28 {
		return Message{}, fmt.Errorf("email: monthly highlights without its month")
	}
	month := start.Format("January")
	last := start.AddDate(0, -1, 0).Format("January")
	logo := links.Logo
	if logo == "" {
		logo = links.App + "/email/coinroof-logo.png"
	}
	v := monthlyView{
		Heading: "Your " + month, Big: m(mo.Spent), Month: month, LastMonth: last, LogoURL: logo,
		OpenURL: links.App + "/", SettingsURL: links.App + "/settings", StopURL: links.App + "/unsubscribe?t=" + url.QueryEscape(token),
		Why: "You're getting this because the monthly highlights are on for " + household + ".", StopText: "Stop monthly highlights",
	}
	v.Under = "spent, and nothing came in"
	if mo.CameIn > 0 {
		v.Under = "spent, and " + m(mo.CameIn) + " came in"
	}
	avg := "None yet"
	if mo.Compare.Avg3 != nil && *mo.Compare.Avg3 > 0 {
		avg = compare(mo.Spent, *mo.Compare.Avg3, m)
	}
	v.Tiles = []tile3{{"Spent", m(mo.Spent), ""}, {"vs " + last, compare(mo.Spent, mo.Compare.Last, m), ""}, {"vs 3-month average", avg, ""}}

	if b := mo.Busiest; b != nil {
		v.Highlights = append(v.Highlights, tile3{"Busiest day", m(b.AmountMinor), weekdayShort(b.Date)})
	}
	if b := mo.Biggest; b != nil {
		v.Highlights = append(v.Highlights, tile3{"Biggest purchase", m(b.AmountMinor), b.Name + ", " + shortDay(b.Date)})
	}
	if len(mo.Categories) > 0 {
		c := mo.Categories[0]
		v.Highlights = append(v.Highlights, tile3{"Most spent on", m(c.AmountMinor), categoryName(c.Category)})
	}
	if b := mo.BiggestIn; b != nil {
		v.Highlights = append(v.Highlights, tile3{"Came in", m(mo.CameIn), b.Name + ", " + shortDay(b.Date)})
	}

	// The calendar, Monday first; each day coloured by what was spent.
	var top int64
	for _, d := range mo.Days {
		top = max(top, d)
	}
	var week []dayCell
	for i := 0; i < (int(start.Weekday())+6)%7; i++ {
		week = append(week, dayCell{Pad: true})
	}
	for i, d := range mo.Days {
		c := dayCell{Day: fmt.Sprint(i + 1), Bg: "#fafafa", Fg: "#a1a1aa", Empty: true}
		if d > 0 {
			c.Bg = heatFor(d, top)
			c.Fg, c.Empty = heatText[c.Bg], false
		}
		week = append(week, c)
		if len(week) == 7 {
			v.Weeks = append(v.Weeks, week)
			week = nil
		}
	}
	if len(week) > 0 {
		for len(week) < 7 {
			week = append(week, dayCell{Pad: true})
		}
		v.Weeks = append(v.Weeks, week)
	}
	if b := mo.Busiest; b != nil {
		v.CalNote = "Green days, little spent; red days, the most. Busiest: " + weekdayShort(b.Date) + " (" + m(b.AmountMinor) + ")."
	}

	// The split bar: categories by amount, the biggest red, the smallest green;
	// equal amounts share a colour.
	var amounts []int64
	for _, c := range mo.Categories {
		if len(amounts) == 0 || amounts[len(amounts)-1] != c.AmountMinor {
			amounts = append(amounts, c.AmountMinor)
		}
	}
	sort.Slice(amounts, func(i, j int) bool { return amounts[i] > amounts[j] })
	rank := map[int64]int{}
	for i, a := range amounts {
		rank[a] = i
	}
	for _, c := range mo.Categories {
		if mo.Spent <= 0 {
			break
		}
		step := 0
		if len(amounts) > 1 {
			step = rank[c.AmountMinor] * (len(heat) - 1) / (len(amounts) - 1)
		}
		pct := float64(c.AmountMinor) * 100 / float64(mo.Spent)
		col := heat[step]
		v.Split = append(v.Split, catView{
			Name: categoryName(c.Category), Value: m(c.AmountMinor), Pct: fmt.Sprintf("%.0f%%", pct),
			Color: col, Text: heatText[col], Width: pct, Label: pct >= 15,
		})
	}
	if len(mo.Categories) > 0 {
		v.CatNote = categoryName(mo.Categories[0].Category) + " was the biggest share."
		if mo.Compare.Last > 0 {
			v.CatNote = compareSentence(mo.Spent, mo.Compare.Last, last, m) + " " + v.CatNote
		}
	}

	for _, s := range mo.Shared {
		sv := sharedView{
			Name: s.Name, Now: m(s.Compare.Spent), Then: m(s.Compare.Last),
			NowLabel: s.Name + ", " + month, ThenLabel: last,
		}
		big := max(s.Compare.Spent, s.Compare.Last)
		if big > 0 {
			sv.NowPct, sv.ThenPct = int(s.Compare.Spent*100/big), int(s.Compare.Last*100/big)
		}
		sv.Note = strings.Replace(sentenceCompare(s.Compare.Spent, s.Compare.Last, s.Compare.Avg3, m), "last month so far", "in "+last, 1)
		if s.Biggest != nil {
			sv.Biggest = &slipRow{Label: "Biggest this month", Meta: s.Biggest.Name + ", " + shortDay(s.Biggest.Date), Value: m(s.Biggest.AmountMinor)}
		}
		v.Shared = append(v.Shared, sv)
	}

	var html bytes.Buffer
	if err := monthlyPage.Execute(&html, v); err != nil {
		return Message{}, err
	}
	return Message{
		Subject:     "Your " + month + ": " + m(mo.Spent) + " spent",
		HTML:        html.String(),
		Text:        monthlyText(v),
		Unsubscribe: links.App + "/api/email/unsubscribe?t=" + url.QueryEscape(token),
	}, nil
}

func compareSentence(now, then int64, last string, m func(int64) string) string {
	if now == then {
		return "Same as " + last + "."
	}
	return compare(now, then, m) + " than " + last + "."
}

// categoryName writes Plaid's code as the app does: FOOD_AND_DRINK → "Food and drink".
func categoryName(c string) string {
	s := strings.ToLower(strings.ReplaceAll(c, "_", " "))
	if s == "" {
		return "Other"
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func weekdayShort(d string) string {
	if t, ok := parse(d); ok {
		return t.Format("Mon, Jan 2")
	}
	return ""
}

func monthlyText(v monthlyView) string {
	var b strings.Builder
	b.WriteString(v.Heading + "\n\n" + v.Big + " " + v.Under + "\n\n")
	for _, t := range v.Tiles {
		b.WriteString(t.Label + ": " + t.Value + "\n")
	}
	b.WriteString("\nHighlights\n")
	for _, h := range v.Highlights {
		b.WriteString(h.Label + ": " + h.Value + " (" + h.Meta + ")\n")
	}
	b.WriteString("\nWhere it went\n")
	for _, c := range v.Split {
		b.WriteString(c.Name + ": " + c.Value + " (" + c.Pct + ")\n")
	}
	for _, s := range v.Shared {
		b.WriteString("\n" + s.NowLabel + ": " + s.Now + ". " + s.Note + "\n")
	}
	b.WriteString("\nOpen Coinroof: " + v.OpenURL + "\n\n" + v.Why + "\n" + v.StopText + ": " + v.StopURL + "\nEmail settings: " + v.SettingsURL + "\n")
	return b.String()
}

var monthlyPage = template.Must(template.New("monthly").Funcs(funcs).Parse(frameHead + `<title>{{.Heading}}</title></head>
` + frameTop + `
<tr><td align="center" style="padding:24px 24px 0;text-align:center"><div style="max-width:760px;margin:0 auto">
<h1 style="margin:0;{{head}};font-weight:700;font-size:22px;line-height:1.25;color:#18181b">{{.Heading}}</h1>
<div style="margin-top:12px;{{head}};font-weight:700;font-size:40px;line-height:1.1;color:#18181b;font-variant-numeric:tabular-nums">{{.Big}}</div>
<p style="margin:6px 0 0;font-size:14px;color:#3f3f46">{{.Under}}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin-top:12px;border-collapse:separate;max-width:560px;margin-left:auto;margin-right:auto"><tr>
{{range .Tiles}}<td align="center" width="33%" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:14px;padding:10px 4px;text-align:center"><div style="font-size:12px;color:#52525b">{{.Label}}</div><div style="{{head}};font-weight:700;font-size:15px;color:#18181b;font-variant-numeric:tabular-nums">{{.Value}}</div></td>{{end}}
</tr></table></div></td></tr>
<tr><td style="padding:0"><div class="cols" style="margin:0 auto;font-size:0">
<div class="col" style="font-size:16px">
{{if .Highlights}}<div class="sh" style="padding:20px 24px 0;{{head}};font-weight:700;font-size:16px;text-align:left">{{uniq}}Highlights</div>
<div class="shw" style="padding:10px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;margin:0 -6px"><tr>
{{range $i, $h := .Highlights}}{{if and $i (eq $i 2)}}</tr><tr>{{end}}<td width="50%" valign="top" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:14px;padding:12px;text-align:left"><div style="font-size:12px;color:#52525b">{{$h.Label}}</div>{{uniq}}<div style="{{head}};font-weight:700;font-size:18px;color:#18181b;font-variant-numeric:tabular-nums">{{$h.Value}}</div><div style="font-size:12px;color:#3f3f46">{{$h.Meta}}</div></td>{{end}}
</tr></table></div>{{end}}
<div class="sh" style="padding:20px 24px 0;{{head}};font-weight:700;font-size:16px;text-align:left">{{uniq}}Day by day</div>
<div class="shw" style="padding:10px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="4" style="border-collapse:separate">
<tr><td align="center" style="font-size:11px;font-weight:600;color:#52525b">M</td><td align="center" style="font-size:11px;font-weight:600;color:#52525b">T</td><td align="center" style="font-size:11px;font-weight:600;color:#52525b">W</td><td align="center" style="font-size:11px;font-weight:600;color:#52525b">T</td><td align="center" style="font-size:11px;font-weight:600;color:#52525b">F</td><td align="center" style="font-size:11px;font-weight:600;color:#52525b">S</td><td align="center" style="font-size:11px;font-weight:600;color:#52525b">S</td></tr>
{{range .Weeks}}<tr>{{range .}}{{if .Pad}}<td></td>{{else}}<td align="center" style="height:32px;border-radius:8px;font-size:12px;font-variant-numeric:tabular-nums;background:{{.Bg}};color:{{.Fg}}{{if .Empty}};border:1px solid #f4f4f5{{end}}">{{.Day}}</td>{{end}}{{end}}</tr>{{end}}
</table>{{if .CalNote}}<p style="margin:8px 0 0;font-size:13px;color:#3f3f46;text-align:center">{{.CalNote}}</p>{{end}}</div>
</div><div class="col" style="font-size:16px">
{{if .Split}}<div class="sh" style="padding:20px 24px 0;{{head}};font-weight:700;font-size:16px;text-align:left">{{uniq}}Where it went</div>
<div class="shw" style="padding:12px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border-collapse:separate"><tr>
{{range .Split}}<td width="{{printf "%.2f" .Width}}%" align="center" style="height:22px;background:{{.Color}};color:{{.Text}};font-size:11px;font-weight:700">{{if .Label}}{{.Pct}}{{end}}</td>{{end}}
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
{{range $i, $c := .Split}}<tr><td style="padding:7px 0;font-size:14px;color:#18181b;text-align:left{{if $i}};border-top:1px dotted #e4e4e7{{end}}"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:{{$c.Color}};border:1px solid #d4d4d8;vertical-align:middle"></span>{{uniq}}{{$c.Name}}</td>
<td align="right" style="padding:7px 0;font-size:14px;font-weight:700;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums{{if $i}};border-top:1px dotted #e4e4e7{{end}}">{{$c.Value}}</td>
<td align="right" style="padding:7px 0 7px 8px;width:40px;font-size:14px;color:#52525b;text-align:right;font-variant-numeric:tabular-nums{{if $i}};border-top:1px dotted #e4e4e7{{end}}">{{$c.Pct}}</td></tr>{{end}}
</table>{{if .CatNote}}<p style="margin:8px 0 0;font-size:13px;color:#3f3f46;text-align:left">{{.CatNote}}</p>{{end}}</div>{{end}}
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
