import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const sourceDirectory = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig( ({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
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
  base: env.VITE_BASE_URL || '/dbdassistant/'
}})
