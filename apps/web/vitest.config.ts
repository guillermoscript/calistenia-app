import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Igual que en vite.config.js: el especificador "pocketbase" que usa
// packages/core debe resolver a la copia de este workspace.
const pbPath = path.resolve(__dirname, 'node_modules/pocketbase/dist/pocketbase.es.mjs')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      pocketbase: pbPath,
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Solo tests unitarios/componente colocados en src/. Los .spec.js de
    // tests/ son E2E de Playwright y NO deben correr bajo vitest.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
