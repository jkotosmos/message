import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'NeonTalk',
        short_name: 'NeonTalk',
        theme_color: '#0b0f1a',
        background_color: '#0b0f1a',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
    }),
  ],
})
