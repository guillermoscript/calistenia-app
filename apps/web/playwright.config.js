import { defineConfig } from '@playwright/test'

// PW_BASE_URL permite apuntar la suite a otro stack (p.ej. un Vite/PB efímeros
// en otros puertos). Por defecto: el dev server estándar en 5173.
const baseURL = process.env.PW_BASE_URL || 'http://localhost:5173'

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
  // Arranca `vite dev` si no hay nada escuchando en baseURL. En local reutiliza
  // tu dev server de siempre; en CI lo levanta desde cero (PB debe estar ya en
  // marcha: el SDK de PocketBase habla directo con VITE_POCKETBASE_URL, que en
  // dev cae por defecto en http://127.0.0.1:8090).
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
})
