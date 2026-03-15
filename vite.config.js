import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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
  plugins: [
    pocketbaseAliasPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
          { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/icons/icon-512-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
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
