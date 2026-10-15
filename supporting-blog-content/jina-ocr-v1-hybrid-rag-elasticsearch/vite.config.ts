import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api requests to the Express server during development
    // TODO: change the port here if you set a different PORT in .env
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
