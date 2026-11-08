import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The production security headers live in vercel.json. `vite preview` applies the SAME
// headers, so the Content-Security-Policy can be tested locally before deploying.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const productionHeaders = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The backend's CORS allows exactly http://localhost:5173.
    // Fail loudly instead of silently moving to 5174, which CORS would block.
    strictPort: true,
  },
  // Production rehearsal: build with VITE_API_BASE_URL=/api, then `npm run preview`.
  // Like the Vercel rewrite, /api is forwarded to the backend on the same origin.
  preview: {
    port: 4173,
    strictPort: true,
    headers: productionHeaders,
    proxy: { '/api': process.env.PREVIEW_API_TARGET ?? 'http://localhost:4000' },
  },
})
