import { defineConfig } from 'vite';

export default defineConfig({
  // Default base for GitHub Pages hosting: https://<username>.github.io/sunshift-dead-district/
  // Note: For itch.io HTML5 ZIP builds, use "npm run build:itch" which builds with base: './'
  base: '/sunshift-dead-district/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/examples/jsm/postprocessing') ||
              id.includes('node_modules/three/examples/jsm/shaders')) {
            return 'three-postprocessing';
          }
          if (id.includes('node_modules/three/examples/jsm/loaders') ||
              id.includes('node_modules/three/examples/jsm/utils')) {
            return 'three-loaders';
          }
          if (id.includes('node_modules/three')) {
            return 'three-core';
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    open: true
  }
});
