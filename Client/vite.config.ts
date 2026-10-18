import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = process.env.PORT ?? '8080';
const backend = `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Keep every asset as a file so the strict CSP never has to allow data: URIs.
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': backend,
      '/icons': backend,
      '/wallpapers': backend,
      '/healthz': backend,
      '/ws': { target: backend.replace('http', 'ws'), ws: true },
    },
  },
});
