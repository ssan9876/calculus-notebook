import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, '.', '').VITE_BASE_PATH || '/'

  return {
    base,
    plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg'],
    manifest: {
      name: 'Calculus Computational Notebook', short_name: 'Calculus',
      description: 'A local-first computational notebook for mathematics and Python.',
      theme_color: '#fbfaf7', background_color: '#fbfaf7', display: 'standalone',
      icons: [{ src: `${base}icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    },
    workbox: {
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
      navigateFallback: `${base}index.html`,
      runtimeCaching: [{
        urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/pyodide\//,
        handler: 'CacheFirst',
        options: { cacheName: 'pyodide-runtime', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 } },
      }],
    },
    })],
    server: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
    preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } },
  }
})
