import { useEffect, useState } from 'react'

// Placeholder screen. Styling waits for design-tokens.json (#10).
export default function App() {
  const [api, setApi] = useState('checking…')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body) => setApi(body.status))
      .catch(() => setApi('not reachable'))
  }, [])

  return (
    <main>
      <h1>Tallyn</h1>
      <p>It all adds up.</p>
      <p>API: {api}</p>
    </main>
  )
}
