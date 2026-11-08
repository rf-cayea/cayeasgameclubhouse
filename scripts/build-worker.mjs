// Bundles the Worker entrypoint into one ES module for Cloudflare hosting.
// Cloudflare does not build source, so this runs before every deploy. Output
// stays in plain (non-hidden) paths because hosting rejects hidden files.
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outdir = 'worker-build';
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: ['server/worker.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  conditions: ['worker', 'browser'],
  mainFields: ['module', 'main'],
  outfile: `${outdir}/index.js`,
  legalComments: 'none',
  logLevel: 'info',
});
await writeFile('worker.manifest.json', JSON.stringify({
  entrypoint: 'index.js',
  compatibilityDate: new Date().toISOString().slice(0, 10),
  modules: [{ name: 'index.js', type: 'esm', path: `./${outdir}/index.js` }],
  assetsDirectory: './dist',
  spa: true,
}, null, 2));
console.log('Worker bundle written to worker-build/index.js with worker.manifest.json.');
