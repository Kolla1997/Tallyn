import { defineConfig } from '@playwright/test'

// Layout checks (#117): every page at phone, small-laptop and desktop width,
// against the production build with fake data (e2e/fixtures.js). No real
// Supabase project or bank: the build gets a fake Supabase address, and
// every request is answered by the test. Run: npm run test:layout.
const FAKE_SUPABASE = { VITE_SUPABASE_URL: 'https://fakeproject.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'fake-publishable-key' }

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    reducedMotion: 'reduce', // no fades or count-ups mid-way while measuring
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 375, height: 812 } } },
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 } } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite build --outDir e2e-dist --emptyOutDir && npx vite preview --outDir e2e-dist --port 4173 --strictPort',
    url: 'http://localhost:4173',
    env: FAKE_SUPABASE, // wins over web/.env.local, so nothing real is used
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
