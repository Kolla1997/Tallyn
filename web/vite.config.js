import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// In dev, Vite serves the app and forwards /api to the Go server on :8080.
// In production, the Go server serves the built app from web/dist.
//
// Content-Security-Policy in dev (#24, ADR 0011): the same policy the Go
// server sends (internal/api/security.go), so anything it would block shows
// up while developing. Dev only adds what Vite needs: its inline React
// refresh script and the live-reload socket. Keep the two in step.
function devPolicy(supabaseURL, mapURLs) {
  let supabase = ''
  try {
    const u = new URL(supabaseURL)
    if (u.protocol === 'https:') supabase = ` ${u.origin}`
  } catch {
    // not set: leave it out, like the server
  }
  // The map host (#60). In production the map file and its fonts share one R2 host; in dev
  // they may be a local tile server and Protomaps' fonts.
  const maps = mapURLs
    .map((m) => {
      try {
        return ` ${new URL(m.replace(/\{[xyz]\}/g, '0')).origin}`
      } catch {
        return ''
      }
    })
    .join('')
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.plaid.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://plaid-merchant-logos.plaid.com https://plaid-counterparty-logos.plaid.com",
    "font-src 'self'",
    `connect-src 'self' ws://localhost:* https://*.plaid.com${supabase}${maps}`,
    "worker-src 'self' blob:",
    'frame-src https://cdn.plaid.com',
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    // Tailwind (#183) only reaches files that import it: the draft lab
    // (lab.html, src/lab/lab.css). The app keeps its own stylesheet, and the
    // build only includes index.html, so the lab never ships.
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: {
        '/api': 'http://localhost:8080',
      },
      headers: {
        'Content-Security-Policy': devPolicy(env.VITE_SUPABASE_URL, [env.VITE_MAP_URL, env.VITE_MAP_ASSETS].filter(Boolean)),
      },
      // The app reads design-tokens.json and brand/ from the repo root.
      fs: {
        allow: ['..'],
      },
    },
    // Faster loading (#99): React and Supabase in their own files. They change
    // rarely, so browsers keep them cached when the app is updated.
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            ],
          },
        },
      },
    },
    // Web tests (#100): npm test.
    test: {
      environment: 'jsdom',
      // Playwright's layout checks (#117) and end-to-end tests (#113) run in a real browser, not here.
      exclude: ['**/node_modules/**', 'e2e/**', 'e2e-full/**'],
      setupFiles: ['./src/test-setup.js'],
    },
  }
})
