import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())

  // Fail fast: without the API URL the bundle silently talks to the page
  // origin instead (socket.io falls back to window.location, REST goes to
  // relative garbage). Set it in app/web/.env (local dev) or pass it as
  // a docker build arg (see docker-compose.yml).
  if (!env.VITE_API_URL) {
    throw new Error(
      'VITE_API_URL is not set. The frontend cannot reach the API without it.',
    )
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(sourceDirectory),
      },
    },
    server: {
      host: true,
    },
    // Relative asset URLs — the app is servable under any path or domain.
    // The reverse proxy owns path mapping (it must strip its prefix).
    // API/cover URLs stay absolute via VITE_API_URL and are unaffected.
    base: './',
  }
})
