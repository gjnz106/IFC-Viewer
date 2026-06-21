import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  base: './',
  plugins: [
    topLevelAwait(),
  ],
  optimizeDeps: {
    exclude: ['web-ifc', 'web-ifc-three'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
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
});
