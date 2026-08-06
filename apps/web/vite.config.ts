import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), DevCspOnly()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
    // ponytail: CSP header lives here in dev because the react-refresh
    // preamble is an INLINE module script — 'unsafe-inline' is required.
    // Production keeps the strict policy from index.html's <meta> (the API
    // serves the static build with no CSP header). Dev drops that meta so
    // both sources don't AND into the stricter one and brick the page.
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http://localhost:8080 ws: wss:; frame-ancestors 'none';",
    },
  },
})

function DevCspOnly() {
  return {
    name: 'dev-csp-only',
    apply: 'serve',
    transformIndexHtml(html: string) {
      return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, '')
    },
  }
}
