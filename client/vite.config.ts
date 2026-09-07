import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    proxy: {
      '/api': {
        target: 'http://localhost:5178',
        changeOrigin: true,
        // SSE: never time out the long-lived /api/events response.
        timeout: 0,
        proxyTimeout: 0,
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache'
              proxyRes.headers['x-accel-buffering'] = 'no'
            }
          })
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Needed so `*.css?raw` resolves to the file text instead of an empty module.
    css: true,
  },
})
