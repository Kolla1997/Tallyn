package email

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"
)

// The welcome emails (#280, Dinesh picked F in drafts/280-welcome-emails.html):
// a short letter in the same frame as the other emails. One to the person who
// signs up, sent once after they agree to the terms; one to someone invited to
// a household, sent when the invite is made. Both are account emails, so they
// go through Brevo and have no stop link.

// Welcome is who the welcome email is for.
type Welcome struct {
	Name string // display name; may be empty
}

// Invited is an invite to email: Link is the one-time join link.
type Invited struct {
	From      string // the inviter's display name; may be empty
	Household string
	Role      string // adult, teen or viewer
	Link      string
	Days      int // how long the link works
}

type welcomeView struct {
	Title, Hello, Green, After, LogoURL, Button, ButtonURL, SettingsURL, Why, Note string
	Paras                                                                          []template.HTML
}

// ComposeWelcome builds the email to someone who just made an account.
func ComposeWelcome(w Welcome, links Links) (Message, error) {
	hello := "Hi."
	if n := firstName(w.Name); n != "" {
		hello = "Hi " + n + "."
	}
	v := welcomeView{
		Title: "Welcome to Coinroof", Hello: hello + " It all", Green: "adds up", After: "from here.",
		Paras: []template.HTML{
			"Coinroof puts every account you have, from checking to credit cards, into <b style=\"color:#18181b\">one total</b> you can trust.",
			"Start with one bank. It takes about two minutes, it's read-only, and we never move your money.",
			"When you're ready, invite the people you share money with. You decide what each one sees.",
		},
		Button: "Connect your first bank", ButtonURL: links.App + "/", LogoURL: logoURL(links),
		SettingsURL: links.App + "/settings", Why: "You get this because you made a Coinroof account.",
	}
	return renderWelcome(v, "Welcome to Coinroof")
}

// roleWords says what joining as each invite role means.
var roleWords = map[string]string{"adult": "an adult", "teen": "a teen", "viewer": "a viewer"}

// ComposeInvite builds the email to someone invited to a household.
func ComposeInvite(in Invited, links Links) (Message, error) {
	role, ok := roleWords[in.Role]
	if !ok || in.Link == "" {
		return Message{}, fmt.Errorf("email: invite without a role or link")
	}
	from := strings.TrimSpace(in.From)
	if from == "" {
		from = "Someone"
	}
	household := template.HTMLEscapeString(in.Household)
	v := welcomeView{
		Title: from + " invited you to Coinroof", Hello: "Hi. " + from + " wants to", Green: "add things up", After: "with you.",
		Paras: []template.HTML{
			template.HTML("You've been invited to <b style=\"color:#18181b\">" + household + "</b> on Coinroof, as <b style=\"color:#18181b\">" + role + "</b>."),
			template.HTML(template.HTMLEscapeString(from) + " decides what you see. Anything you add stays private until you share it."),
		},
		Button: "Accept the invite", ButtonURL: in.Link, LogoURL: logoURL(links),
		Why: "You get this because " + from + " invited this address. If you weren't expecting it, you can ignore it.",
	}
	if in.Days > 0 {
		v.Note = fmt.Sprintf("The invite works for %d days.", in.Days)
	}
	return renderWelcome(v, from+" invited you to Coinroof")
}

func logoURL(links Links) string {
	if links.Logo != "" {
		return links.Logo
	}
	return links.App + "/email/coinroof-logo.png"
}

func firstName(s string) string {
	f := strings.Fields(s)
	if len(f) == 0 {
		return ""
	}
	return f[0]
}

func renderWelcome(v welcomeView, subject string) (Message, error) {
	var html bytes.Buffer
	if err := welcomePage.Execute(&html, v); err != nil {
		return Message{}, err
	}
	var t strings.Builder
	t.WriteString(v.Hello + " " + v.Green + " " + v.After + "\n\n")
	for _, p := range v.Paras {
		t.WriteString(stripTags(string(p)) + "\n\n")
	}
	if v.SettingsURL != "" {
		t.WriteString("The Coinroof team\n\n")
	}
	t.WriteString(v.Button + ": " + v.ButtonURL + "\n")
	if v.Note != "" {
		t.WriteString(v.Note + "\n")
	}
	t.WriteString("\n" + v.Why + "\n")
	return Message{Subject: subject, HTML: html.String(), Text: t.String()}, nil
}

func stripTags(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		switch {
		case r == '<':
			in = true
		case r == '>':
			in = false
		case !in:
			b.WriteRune(r)
		}
	}
	return strings.NewReplacer("&amp;", "&", "&lt;", "<", "&gt;", ">", "&#34;", `"`, "&#39;", "'").Replace(b.String())
}

// The red and green stripe under the band, from the logo's lines: table
// cells, since mail apps drop CSS gradients.
const welcomeStripe = `<tr><td style="padding:0;line-height:0;font-size:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>` +
	`{{range stripe}}<td height="8" style="height:8px;line-height:8px;font-size:0;background:{{.}}">&nbsp;</td>{{end}}</tr></table></td></tr>`

var welcomePage = template.Must(template.New("welcome").Funcs(funcs).Funcs(template.FuncMap{"stripe": stripe}).Parse(frameHead + `<title>{{.Title}}</title></head>
` + frameTop + welcomeStripe + `
<tr><td style="padding:28px 24px 0"><div style="max-width:560px;margin:0 auto;text-align:left">
<h1 style="margin:0;{{head}};font-weight:700;font-size:32px;line-height:1.15;color:#18181b">{{.Hello}} <span style="color:#067b00">{{.Green}}</span> {{.After}}</h1>
{{range .Paras}}<p style="margin:16px 0 0;font-size:16px;line-height:1.65;color:#3f3f46">{{uniq}}{{.}}</p>{{end}}
{{if .SettingsURL}}<p style="margin:16px 0 0;{{head}};font-weight:700;font-size:16px;color:#18181b">The Coinroof team</p>{{end}}
</div></td></tr>
<tr><td align="center" style="padding:8px 24px 28px;text-align:center"><div style="max-width:560px;margin:0 auto">
<a href="{{.ButtonURL}}" style="display:inline-block;margin-top:20px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:999px;padding:12px 24px">{{.Button}}</a>
{{if .Note}}<p style="margin:12px 0 0;font-size:14px;color:#52525b">{{.Note}}</p>{{end}}
</div></td></tr>
</table>
<p class="foot" style="max-width:480px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#52525b;text-align:center">{{.Why}}{{if .SettingsURL}}<br><a href="{{.SettingsURL}}" style="color:#3f3f46">Email settings</a>{{end}}</p>
</td></tr></table></body></html>`))

// stripe is 20 alternating logo red and green cells.
func stripe() []string {
	out := make([]string, 20)
	for i := range out {
		out[i] = "#cb0900"
		if i%2 == 1 {
			out[i] = "#067b00"
		}
	}
	return out
}
