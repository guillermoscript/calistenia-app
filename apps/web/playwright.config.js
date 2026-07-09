import { defineConfig } from '@playwright/test'

// PW_BASE_URL permite apuntar la suite a otro stack (p.ej. un Vite/PB efímeros
// en otros puertos). Por defecto: el dev server estándar en 5173; en CI, el
// preview del bundle de producción en 4173.
const isCI = !!process.env.CI
const baseURL = process.env.PW_BASE_URL || (isCI ? 'http://localhost:4173' : 'http://localhost:5173')

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  reporter: [['list']],
  // En local reutiliza tu dev server de siempre (o arranca `vite dev` si no hay
  // nada en baseURL). En CI sirve dist/ con `vite preview`: se testea el bundle
  // real de producción (el job e2e-smoke lo compila antes con
  // VITE_POCKETBASE_URL=http://127.0.0.1:8090 apuntando al PB efímero).
  webServer: {
    command: isCI ? 'pnpm exec vite preview --port 4173 --strictPort' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 90_000,
  },
})
