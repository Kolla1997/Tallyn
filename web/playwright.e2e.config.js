import { defineConfig } from '@playwright/test'

// Browser end-to-end tests (#113): the real app, Go API, a separate Supabase
// project just for tests and the Plaid sandbox. Nightly and before a release,
// not on every PR. Run: npm run test:e2e (needs the E2E_* values, see
// docs/04 Tech/Dev Setup.md). The layout checks (#117) stay in e2e/ with fake
// data; this suite lives in e2e-full/ so neither picks up the other's tests.
const need = [
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_PUBLISHABLE_KEY',
  'E2E_SUPABASE_SECRET_KEY',
  'E2E_DATABASE_URL',
  'E2E_DATABASE_URL_SYNC',
  'E2E_PLAID_CLIENT_ID',
  'E2E_PLAID_SECRET',
  'E2E_TOKEN_ENCRYPTION_KEY',
]
const missing = need.filter((k) => !process.env[k])
if (missing.length) throw new Error(`Browser end-to-end tests need: ${missing.join(', ')} (see docs/04 Tech/Dev Setup.md)`)

const PORT = 8090
const env = process.env

export default defineConfig({
  testDir: 'e2e-full',
  outputDir: 'test-results-e2e',
  workers: 1, // one Supabase project and 2FA codes in 30-second steps: one test at a time
  forbidOnly: Boolean(env.CI),
  retries: env.CI ? 1 : 0, // Plaid's sandbox screen can be slow now and then
  timeout: 4 * 60_000, // a new sandbox bank can take a minute or two to sync
  expect: { timeout: 15_000 },
  reporter: env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-e2e' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 20_000, // a click that can't happen fails in seconds, not at the 4-minute test limit
    reducedMotion: 'reduce', // totals show their final value, no count-up
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // The Go server serves the built app and the API from one address, as in production.
    command: `npx vite build --outDir e2e-full-dist --emptyOutDir && cd .. && go run ./cmd/server`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    env: {
      VITE_SUPABASE_URL: env.E2E_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: env.E2E_SUPABASE_PUBLISHABLE_KEY,
      PORT: String(PORT),
      WEB_DIR: 'web/e2e-full-dist',
      SUPABASE_URL: env.E2E_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.E2E_SUPABASE_SECRET_KEY,
      DATABASE_URL: env.E2E_DATABASE_URL,
      DATABASE_URL_SYNC: env.E2E_DATABASE_URL_SYNC,
      PLAID_CLIENT_ID: env.E2E_PLAID_CLIENT_ID,
      PLAID_SECRET: env.E2E_PLAID_SECRET,
      PLAID_ENV: 'sandbox', // never anything else
      TOKEN_ENCRYPTION_KEY: env.E2E_TOKEN_ENCRYPTION_KEY,
      SYNC_EVERY: '6h', // new links sync straight away; no need for more
    },
  },
})
