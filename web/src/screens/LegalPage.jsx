import Markdown, { slug } from '../components/Markdown.jsx'
import { LEGAL } from '../lib/legal.js'
import { Link } from '../lib/router.jsx'
import Heading from '../components/Heading.jsx'

// /terms and /privacy (#36; #1, Dinesh picked B): on wide screens a contents list of the sections
// stays beside the text as you scroll, and the text keeps a comfortable line length; on a phone the
// contents fold into "Contents" above the text. Open to everyone, signed in or not. The text comes
// from legal/*.md.
function toSection(e) {
  const id = e.currentTarget.hash.slice(1)
  const el = document.getElementById(id)
  if (!el) return
  e.preventDefault()
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(null, '', `#${id}`)
}

export default function LegalPage({ doc }) {
  const d = LEGAL[doc]
  const other = LEGAL[doc === 'terms' ? 'privacy' : 'terms']
  const body = d.body.replace(/^\s*#\s+.*\n/, '') // the title is shown above
  const sections = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim())
  const contents = (
    <ol className="legal-contents-list">
      {sections.map((s) => (
        <li key={s}>
          <a href={`#${slug(s)}`} onClick={toSection}>
            {s.replace(/^\d+\.\s*/, '')}
          </a>
        </li>
      ))}
    </ol>
  )
  return (
    <div className="legal-layout">
      <nav className="legal-contents panel" aria-label="Contents">
        <p className="legal-contents-title">Contents</p>
        {contents}
      </nav>
      <article className="panel legal" aria-labelledby="legal-h">
        <nav className="small legal-nav" aria-label="Legal">
          <Link to="/">← Coinroof</Link>
          <span aria-hidden="true"> · </span>
          <Link to={other.path}>{other.title}</Link>
        </nav>
        <Heading id="legal-h">{d.title}</Heading>
        <p className="small muted">
          Version {d.version} · Effective {d.effective}
        </p>
        <details className="legal-contents-fold">
          <summary>Contents</summary>
          {contents}
        </details>
        <Markdown text={body} />
      </article>
    </div>
  )
}
