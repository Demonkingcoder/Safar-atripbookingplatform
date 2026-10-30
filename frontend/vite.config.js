import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isLocalHost = (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode !== 'development') {
    const value = env.VITE_API_BASE_URL?.trim()
    let apiUrl
    try { apiUrl = new URL(value) } catch {
      throw new Error('VITE_API_BASE_URL must be set to the public HTTPS API base URL for non-development builds')
    }
    if (apiUrl.protocol !== 'https:' || isLocalHost(apiUrl.hostname)
      || apiUrl.pathname !== '/api/v1' || apiUrl.search || apiUrl.hash
      || apiUrl.username || apiUrl.password) {
      throw new Error('VITE_API_BASE_URL must be a public HTTPS origin ending exactly in /api/v1')
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
