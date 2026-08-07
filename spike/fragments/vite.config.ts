import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5180 },
  // web-ifc ships a large wasm + glue; excluding it from pre-bundling keeps the
  // dev server from choking on it, same as the main app's setup.
  optimizeDeps: { exclude: ['web-ifc'] },
  worker: { format: 'es' },
});
