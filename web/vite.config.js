import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, Vite serves the app and forwards /api to the Go server on :8080.
// In production, the Go server serves the built app from web/dist.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
    // The app reads design-tokens.json and brand/ from the repo root.
    fs: {
      allow: ['..'],
    },
  },
})
