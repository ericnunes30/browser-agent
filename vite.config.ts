import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import manifest from './extension/manifest.json';
import { resolve } from 'path';
import fs from 'fs';

export default defineConfig({
  root: 'extension',
  plugins: [
    tailwindcss(),
    react(),
    crx({ manifest }),
    // Copy models.custom.json to dist/config/ if it exists (for runtime fetch)
    {
      name: 'copy-custom-config',
      closeBundle() {
        const src = resolve(__dirname, 'extension/config/models.custom.json');
        const destDir = resolve(__dirname, 'dist/config');
        if (fs.existsSync(src)) {
          fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(src, resolve(destDir, 'models.custom.json'));
          console.log('[vite] Copied models.custom.json to dist/config/');
        } else {
          console.log('[vite] No models.custom.json found — using bundled defaults only');
        }
      }
    }
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        offscreen: resolve(__dirname, 'extension/offscreen.html'),
      },
    },
  },
});
