import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The backend's CORS allows exactly http://localhost:5173.
    // Fail loudly instead of silently moving to 5174, which CORS would block.
    strictPort: true,
  },
})
