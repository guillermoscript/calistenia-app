import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // El catálogo de ejercicios se indexa aquí, de forma síncrona (#486).
    setupFiles: ['./vitest.setup.ts'],
  },
})
