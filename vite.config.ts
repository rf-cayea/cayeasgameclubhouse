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
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy: { '/api/rummy': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/spades': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 } } },
  preview: { proxy: { '/api/rummy': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 }, '/api/spades': { target: `http://127.0.0.1:${port}`, timeout: 0, proxyTimeout: 0 } } },
  };
});
