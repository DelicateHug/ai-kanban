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
    },
    watch: {
      usePolling: false,
      // Ignore everything except src folder to prevent hot-reload from data file writes
      ignored: (filePath) => {
        // Always watch index.html and vite.config.ts
        if (filePath.endsWith('index.html') || filePath.endsWith('vite.config.ts')) {
          return false;
        }
        // Watch src folder
        if (filePath.includes('\\src\\') || filePath.includes('/src/')) {
          return false;
        }
        // Watch mcp folder (needed for the app)
        if (filePath.includes('\\mcp\\') || filePath.includes('/mcp/')) {
          return false;
        }
        // Ignore everything else (data, backend, config, logs, etc.)
        return true;
      }
    }
  }
})
