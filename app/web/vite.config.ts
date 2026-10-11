import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
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
})
