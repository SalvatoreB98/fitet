import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import purgecss from '@fullhuman/postcss-purgecss';

const BACKEND_TARGET = 'http://127.0.0.1:3001';

const isConnRefused = (err: any): boolean => {
  if (!err) return false;
  if (err.code === 'ECONNREFUSED') return true;
  if (Array.isArray(err.errors)) {
    return err.errors.some((e: any) => e?.code === 'ECONNREFUSED');
  }
  return String(err.message || '').includes('ECONNREFUSED');
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  css: mode === 'production' ? {
    postcss: {
      plugins: [
        purgecss({
          content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
          defaultExtractor: (content) => content.match(/[\w-/:]+(?<!:)/g) || [],
          safelist: {
            standard: [
              'html',
              'body',
              'show',
              'active',
              'fade',
              'modal-open',
              'spin-icon',
            ],
            deep: [
              /^bi-/,
              /^is-/,
              /^data-theme/,
              /^data-bs-theme/,
            ],
            greedy: [
              /\[data-theme/,
              /\[data-bs-theme/,
            ],
          },
        }),
      ],
    },
  } : undefined,
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
        configure: (proxy) => {
          proxy.on('error', (err: any, req: any, res: any) => {
            const retries = Number(req.__proxyRetries || 0);
            if (isConnRefused(err) && retries < 6 && res && !res.headersSent) {
              req.__proxyRetries = retries + 1;
              setTimeout(() => {
                proxy.web(req, res, { target: BACKEND_TARGET });
              }, 500);
              return;
            }
            console.warn('[vite-proxy] Backend warning:', err.message);
            if (res && !('headersSent' in res && res.headersSent) && typeof res.writeHead === 'function') {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Backend non disponibile temporaneamente', details: err.message }));
            }
          });
        },
      },
      '/admin': {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
    },
  },
}));
