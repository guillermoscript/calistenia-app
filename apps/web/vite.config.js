import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { mdxOptions } from './mdx.options.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
const pbPath = path.resolve(__dirname, 'node_modules/pocketbase/dist/pocketbase.es.mjs')

// Plugin to intercept pocketbase bare specifier and redirect to npm package
function pocketbaseAliasPlugin() {
  return {
    name: 'pocketbase-alias',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'pocketbase') {
        return pbPath
      }
    }
  }
}

export default defineConfig({
  // .env files keep living at the repo root (shared with docker-compose / scripts)
  envDir: path.resolve(__dirname, '../..'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [pocketbaseAliasPlugin(), tailwindcss(),
    // `enforce: 'pre'` → los .mdx se compilan a JSX ANTES de que los procese
    // el plugin de React; `include` en react() les da Fast Refresh.
    { enforce: 'pre', ...mdx(mdxOptions) },
    react({ include: /\.(jsx|js|mdx|md|tsx|ts)$/ }), VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'sw.ts',
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      name: 'Calistenia App',
      short_name: 'Calistenia',
      description: 'Tu programa de calistenia personalizado',
      theme_color: '#0a0a0a',
      background_color: '#0a0a0a',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      // exercise-catalog chunk (~3MB) exceeds the 2MB workbox default
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
    },
  }), sentryVitePlugin({
    org: "guillermoscript",
    project: "gym-guille"
  })],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api/analyze-meal': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/jobs': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/weekly-plan': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/score-meal-quality': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/generate-weekly-insight': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api/generate-free-session': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/mcp': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
      '/_': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Rolldown extrae el singleton de PocketBase a un chunk compartido y
        // puede ejecutarlo antes que init-core; esto fuerza orden de declaración.
        strictExecutionOrder: true,
        manualChunks(id) {
          if (id.includes('data/exercise-catalog.json')) return 'exercise-catalog'
          if (id.includes('node_modules/recharts')) return 'recharts'
          if (id.includes('node_modules/react-router-dom') || id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react'
          if (id.includes('node_modules/leaflet')) return 'leaflet'
        },
      },
    },

    sourcemap: "hidden"
  },
  resolve: {
    /**
     * Una sola copia de i18next en el bundle.
     *
     * pnpm resuelve `i18next` y `react-i18next` por su peer de TypeScript, y
     * `packages/core` (TS 6.0.3) y `apps/web` (TS 5.9.3) enlazan copias
     * DISTINTAS: `node_modules/.pnpm/i18next@26.3.6_typescript@6.0.3` frente a
     * `…_typescript@5.9.3`. `apps/web/src/lib/i18n.ts` inicializa la suya; la de
     * core no la inicializa nadie, y `t()` sobre una instancia sin `init()`
     * devuelve **`undefined`**.
     *
     * Efectos comprobados en el muro antes de esto:
     *   - el título de toda sesión libre salía VACÍO (`sessionKeyLabel` →
     *     `i18n.t('progress.freeSession')` → undefined);
     *   - `timeAgoShort()` (widget de actividad reciente) devolvía undefined, así
     *     que la hora de cada fila no se pintaba;
     *   - `dayjs.locale(i18n.language)` recibía undefined, dayjs se quedaba en
     *     inglés y "hace 2 horas" salía como "2 hours ago" con la app en español.
     *
     * La app nativa no lo sufría: `apps/mobile` enlaza la MISMA copia que core.
     * Mismo problema —y misma solución— que el alias de `pocketbase` de abajo.
     */
    dedupe: ['i18next', 'react-i18next'],
    alias: {
      'pocketbase': pbPath,
      '@': path.resolve(__dirname, 'src'),
    }
  },
  optimizeDeps: {
    exclude: ['pocketbase'],
  }
})
