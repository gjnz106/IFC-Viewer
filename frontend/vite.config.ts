import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // (vite-plugin-top-level-await was removed with the Vite 8 upgrade: the app
  // has no top-level await — web-ifc's WASM is instantiated at runtime via
  // IfcAPI.Init() — and the plugin depends on esbuild, which rolldown-vite no
  // longer ships. Verified by grepping dist output for TLA after removal.)
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
    // is excluded from optimizeDeps + deduped above; letting the bundler emit
    // it as its own chunk keeps the WASM glue isolated from app code.)
    // Function form (not object) — required by Vite 8's rolldown bundler.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three') || id.includes('node_modules/three-mesh-bvh')) return 'three';
          if (id.includes('node_modules/web-ifc')) return 'web-ifc'; // covers web-ifc + web-ifc-three
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          return undefined;
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
