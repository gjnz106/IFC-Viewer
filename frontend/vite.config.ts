import { defineConfig } from 'vitest/config';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  base: './',
  plugins: [
    topLevelAwait(),
  ],
  // Force a single web-ifc instance. web-ifc-three@0.0.126 declares web-ifc@^0.0.39
  // (installed nested) while the app uses web-ifc@0.0.57 (hoisted). Without dedupe the
  // loader glue and the IFC constants can come from different web-ifc copies, so the
  // served wasm never matches the glue → runtime LinkError ("function import requires
  // a callable"). Dedupe pins everything to the root 0.0.57 — the version the
  // production standalone runs — and copy-wasm.mjs ships the matching wasm.
  resolve: {
    dedupe: ['web-ifc', 'web-ifc-three', 'three', 'three-mesh-bvh'],
  },
  optimizeDeps: {
    exclude: ['web-ifc', 'web-ifc-three'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    // Split large, rarely-changing vendors into their own chunks so the main
    // app bundle shrinks and vendors stay cached across app deploys. (web-ifc
    // is excluded from optimizeDeps + deduped above; letting Rollup emit it as
    // its own chunk keeps the WASM glue isolated from app code.)
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three-mesh-bvh'],
          'web-ifc': ['web-ifc', 'web-ifc-three'],
          firebase: ['firebase/app', 'firebase/auth'],
        },
      },
    },
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Feature modules attach helpers to `window` at import time; the setup file
    // stubs a global `window` so pure-logic unit tests can import them in Node.
    setupFiles: ['./vitest.setup.ts'],
  },
});
