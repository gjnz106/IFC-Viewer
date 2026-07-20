import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import topLevelAwait from 'vite-plugin-top-level-await';
import { viteSingleFile } from 'vite-plugin-singlefile';

// ── Standalone review build ────────────────────────────────────────────────
// Produces ONE self-contained dist-standalone/index.html for the reviewer to
// open directly (file://), before a change goes into a PR. Differences vs the
// production build:
//   • vite-plugin-singlefile inlines all JS + CSS into the HTML (no assets/).
//   • web-ifc WASM is fetched from the jsdelivr CDN (version-matched to the
//     bundled web-ifc@0.0.57) via window.__WASM_BASE__, because a single file
//     opened from file:// has no same-origin /vendor path to serve the wasm.
// Production (vite.config.ts) is unchanged and still self-hosts the wasm.
const WEB_IFC_CDN = 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.57/';

export default defineConfig({
  base: './',
  plugins: [
    topLevelAwait(),
    viteSingleFile(),
    {
      name: 'inject-standalone-wasm-base',
      transformIndexHtml(html) {
        // Point web-ifc at the CDN + a small "review build" banner note.
        return html.replace(
          '</head>',
          `<script>window.__WASM_BASE__=${JSON.stringify(WEB_IFC_CDN)};` +
          `window.__STANDALONE_REVIEW__=true;</script></head>`
        );
      },
    },
    {
      // public/css/styles.css is a static passthrough (not part of Vite's
      // module graph), so vite-plugin-singlefile — which only inlines
      // Vite-bundled JS/CSS — leaves it as an external <link>. That link
      // resolves fine against the full dist-standalone/ folder, but the whole
      // point of this build is a review file the user can open on its own
      // (e.g. sent as a standalone attachment, no sibling css/ folder next to
      // it) — so read the real file and inline it as a <style> tag instead.
      name: 'inline-standalone-css',
      transformIndexHtml(html) {
        const cssPath = fileURLToPath(new URL('./public/css/styles.css', import.meta.url));
        const css = readFileSync(cssPath, 'utf-8');
        return html.replace(
          /<link[^>]*href=["']\.?\/?css\/styles\.css["'][^>]*>/,
          `<style>${css}</style>`
        );
      },
    },
  ],
  resolve: {
    dedupe: ['web-ifc', 'web-ifc-three', 'three', 'three-mesh-bvh'],
  },
  optimizeDeps: {
    exclude: ['web-ifc', 'web-ifc-three'],
  },
  worker: { format: 'es' },
  build: {
    target: 'es2020',
    outDir: 'dist-standalone',
    emptyOutDir: true,
    // singlefile needs everything in one chunk — no manual splitting.
    rollupOptions: { output: { inlineDynamicImports: true } },
    chunkSizeWarningLimit: 100000,
  },
});
