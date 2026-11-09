import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the FastAPI backend during development.
    // 127.0.0.1 (not "localhost") so an unrelated IPv6 server on :8000 can't intercept it.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
