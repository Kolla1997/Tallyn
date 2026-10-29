import Markdown from '../components/Markdown.jsx'
import { LEGAL } from '../lib/legal.js'
import { Link } from '../lib/router.jsx'
import Heading from '../components/Heading.jsx'

// /terms and /privacy (#36, layout A): one readable column, open to everyone,
// signed in or not. The text comes from legal/*.md.
export default function LegalPage({ doc }) {
  const d = LEGAL[doc]
  const other = LEGAL[doc === 'terms' ? 'privacy' : 'terms']
  const body = d.body.replace(/^\s*#\s+.*\n/, '') // the title is shown above
  return (
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
      <Markdown text={body} />
    </article>
  )
}
