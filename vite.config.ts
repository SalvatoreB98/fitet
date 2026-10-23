import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.warn('[vite-proxy] Backend warning:', err.message);
            if (res && !('headersSent' in res && res.headersSent) && typeof (res as any).writeHead === 'function') {
              (res as any).writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Backend non disponibile temporaneamente', details: err.message }));
            }
          });
        },
      },
    },
  },
});
