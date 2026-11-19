import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'how-to-play-dev-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/how-to-play' || req.url === '/how-to-play/') req.url = '/how-to-play.html';
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@caravan/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        howToPlay: fileURLToPath(new URL('./how-to-play.html', import.meta.url)),
      },
    },
  },
});
