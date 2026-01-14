import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    format: 'es'
  },
  server: {
    proxy: {
      // Proxy MCP API requests to the Python backend
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
