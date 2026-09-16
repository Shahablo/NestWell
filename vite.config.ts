// vitest 2.x bundles its own copy of vite 5 for typing, while the project builds with vite 6,
// so a single `defineConfig` call cannot type both the plugins (root vite) and the `test`
// block (vitest's vite). The two halves are typed by their own package and merged at runtime.
import { defineConfig, mergeConfig } from 'vite';
import { defineConfig as defineTestConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * SR-04: the built app may talk only to its own origin. Injected at build time only, because the dev
 * server needs its HMR websocket. Asserted by src/domain/network.test.ts.
 */
const CSP = "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
const cspPlugin = {
  name: 'nestwell-csp',
  apply: 'build' as const,
  transformIndexHtml(html: string): string {
    return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  },
};

// Served from GitHub Pages at https://<owner>.github.io/NestWell/ — base must match the repo name.
const appConfig = defineConfig({
  base: '/NestWell/',
  plugins: [
    react(),
    cspPlugin,
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
