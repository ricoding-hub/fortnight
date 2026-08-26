import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' en vez de 'autoUpdate': la recarga silenciosa tiraba lo que
      // el usuario estuviera capturando. Ahora el SW nuevo espera y la app
      // ofrece un aviso para actualizar cuando le convenga.
      registerType: 'prompt',
      // richeto.png se renderiza en todo el layout (PetCompanion); sin esto
      // la mascota aparecía rota sin conexión.
      includeAssets: ['favicon.png', 'icons/*.png', 'richeto.png'],
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Lectura offline: sólo las tablas (rest/v1), nunca auth ni storage.
            // NetworkFirst para que con red siempre gane el dato fresco y la
            // caché sólo entre cuando la petición falla. Ventana corta: son
            // datos financieros, no queremos historial viejo en el disco.
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-data-cache',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'Fortnight — Finanzas personales',
        short_name: 'Fortnight',
        description: 'Controla tus gastos, deudas y préstamos cada catorcena.',
        lang: 'es-MX',
        dir: 'ltr',
        display: 'standalone',
        // El diseño es mobile-first a 380px y no soporta horizontal.
        orientation: 'portrait',
        theme_color: '#F7F4ED',
        background_color: '#F7F4ED',
        start_url: '/',
        scope: '/',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Movimientos', short_name: 'Movimientos', url: '/cuentas/movimientos' },
          { name: 'Préstamos', short_name: 'Préstamos', url: '/cuentas/prestamos' },
          { name: 'Plan', short_name: 'Plan', url: '/plan' },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
