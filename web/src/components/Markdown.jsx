import { Fragment } from 'react'
import { Link } from '../lib/router.jsx'

// A small Markdown renderer for our own legal documents (#36): headings,
// paragraphs, lists, blockquotes, tables, **bold** and [links](url). It
// builds React elements, never raw HTML, so nothing in the text can run.

function inline(text, key = 'i') {
  const out = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let m
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      out.push(<strong key={`${key}-${n++}`}>{inline(m[1], `${key}-${n}`)}</strong>)
    } else {
      const href = m[3]
      const label = inline(m[2], `${key}-${n}`)
      out.push(
        href.startsWith('/') ? (
          <Link key={`${key}-${n++}`} to={href}>
            {label}
          </Link>
        ) : /^https:\/\//.test(href) ? (
          <a key={`${key}-${n++}`} href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        ) : (
          <Fragment key={`${key}-${n++}`}>{label}</Fragment>
        ),
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// A heading's id, so a contents list can link to it (#1): "2. Who can use Tallyn" → "who-can-use-tallyn".
export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export default function Markdown({ text }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const Tag = `h${Math.max(2, h[1].length)}` // the page has its own h1, so ## is h2
      blocks.push(
        <Tag key={i} id={Tag === 'h2' ? slug(h[2]) : undefined}>
          {inline(h[2], `h${i}`)}
        </Tag>,
      )
      i++
      continue
    }
    if (line.startsWith('>')) {
      const quote = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(
        <blockquote key={i} className="legal-note">
          {inline(quote.join(' '), `q${i}`)}
        </blockquote>,
      )
      continue
    }
    if (/^\s*-\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ''))
      blocks.push(
        <ul key={i}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `l${i}-${j}`)}</li>
          ))}
        </ul>,
      )
      continue
    }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      const cells = (r) =>
        r
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      const [head, , ...body] = rows
      blocks.push(
        <div key={i} className="legal-table">
          <table>
            <thead>
              <tr>
                {cells(head).map((c, j) => (
                  <th key={j}>{inline(c, `th${i}-${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>
                  {cells(r).map((c, j) => (
                    <td key={j}>{inline(c, `td${i}-${k}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    // The first line always joins, so a stray "#12" or "####" line can't stall the loop (#154).
    const para = [lines[i++]]
    while (i < lines.length && lines[i].trim() && !/^(#|>|\||\s*-\s)/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={i}>{inline(para.join(' '), `p${i}`)}</p>)
  }
  return <>{blocks}</>
}
