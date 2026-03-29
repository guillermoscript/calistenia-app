import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    pocketbaseAliasPlugin(),
    tailwindcss(),
    react(),
    VitePWA({
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
      },
    }),
  ],
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
        manualChunks: {
          recharts: ['recharts'],
          react: ['react', 'react-dom', 'react-router-dom'],
          leaflet: ['leaflet'],
        },
      },
    },
  },
  resolve: {
    alias: {
      'pocketbase': pbPath,
      '@': path.resolve(__dirname, 'src'),
    }
  },
  optimizeDeps: {
    exclude: ['pocketbase'],
  }
})
