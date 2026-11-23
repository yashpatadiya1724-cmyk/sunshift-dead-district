import { defineConfig } from 'vite';

export default defineConfig({
  // Default base for GitHub Pages hosting: https://<username>.github.io/sunshift-dead-district/
  // Note: For itch.io HTML5 ZIP builds, use "npm run build:itch" which builds with base: './'
  base: '/sunshift-dead-district/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
    minify: 'esbuild'
  },
  server: {
    port: 5173,
    open: true
  }
});
