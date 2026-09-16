// vitest 2.x bundles its own copy of vite 5 for typing, while the project builds with vite 6,
// so a single `defineConfig` call cannot type both the plugins (root vite) and the `test`
// block (vitest's vite). The two halves are typed by their own package and merged at runtime.
import { defineConfig, mergeConfig } from 'vite';
import { defineConfig as defineTestConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from GitHub Pages at https://<owner>.github.io/NestWell/ — base must match the repo name.
const appConfig = defineConfig({
  base: '/NestWell/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'NestWell (demo)',
        short_name: 'NestWell',
        description: 'Postpartum follow-through prototype. Synthetic data only. Not for real patients.',
        start_url: '/NestWell/',
        scope: '/NestWell/',
        display: 'standalone',
        background_color: '#f7f6f2',
        theme_color: '#1f5f5b',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app is static; cache everything so the help path (FR-21, NFR-13) works offline.
        globPatterns: ['**/*.{js,css,html,png,svg,json,webmanifest}'],
        navigateFallback: '/NestWell/index.html',
      },
    }),
  ],
});

const testConfig = defineTestConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});

export default mergeConfig(appConfig, testConfig as Record<string, unknown>);
