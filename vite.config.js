
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5500
  },

  build: {
    rollupOptions: {
      input: {
        index: resolve(rootDirectory, 'index.html'),
        auction: resolve(rootDirectory, 'auction.html'),
        auctioneerJoin: resolve(rootDirectory, 'auctioneer-join.html'),
        hostSetup: resolve(rootDirectory, 'host-setup.html'),
        legacyIndex: resolve(rootDirectory, 'legacy-index.html')
      }
    }
  }
});
