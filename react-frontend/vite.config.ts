import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    },
    port: 8001,
    cors: true,
    hmr: {
      overlay: true,
      port: 8001,
    },
    host: 'localhost',
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
})
