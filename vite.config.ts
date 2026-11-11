import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'RUMMY_');
  const port = process.env.RUMMY_API_PORT ?? environment.RUMMY_API_PORT ?? '8787';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('RUMMY_API_PORT must be a valid port.');
  return {
  // Use fresh URLs so browsers cannot reuse encoded assets from an older build.
  build: { assetsDir: 'assets/plain' },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api/carrom': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/collectibles': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/crown-court': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/farkle': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/dominoes': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/five-dice': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/economy': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/puzzles': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/social': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/rummy': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/spades': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 } } },
  preview: { proxy: { '/api/carrom': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/collectibles': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/crown-court': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/farkle': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/dominoes': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/five-dice': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/economy': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/puzzles': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/social': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/rummy': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/spades': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 } } },
  };
});
