import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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
    tailwindcss(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
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
