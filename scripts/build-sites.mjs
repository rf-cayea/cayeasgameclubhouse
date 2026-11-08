import { build } from 'esbuild';
import { readdir, readFile, mkdir, cp, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

// Keep the local Node/Vite workflow; build an additional standalone Sites Worker.
execFileSync(process.execPath, ['scripts/generate-cloud-stores.mjs', '--check'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/prepare-supabase-setup.mjs', '--check'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist/client'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
const assets = {};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
async function collect(directory, prefix = '') {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${file.name}`, path = join(directory, file.name);
    if (file.isDirectory()) await collect(path, relative);
    else assets[relative] = { type: types[extname(file.name)] || 'application/octet-stream', data: (await readFile(path)).toString('base64') };
  }
}
await collect('dist/client');
await mkdir('dist/server', { recursive: true });
await build({ entryPoints: ['worker/index.ts'], outfile: 'dist/server/index.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, external: ['node:crypto'], plugins: [{ name: 'embedded-assets', setup(builder) {
  builder.onResolve({ filter: /^clubhouse:assets$/ }, () => ({ path: 'assets', namespace: 'clubhouse' }));
  builder.onLoad({ filter: /.*/, namespace: 'clubhouse' }, () => ({ contents: `export default ${JSON.stringify(assets)}`, loader: 'js' }));
} }] });
await mkdir('dist/.openai', { recursive: true });
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await writeFile('dist/server/package.json', '{"type":"module"}\n');
await writeFile('dist/server/wrangler.json', JSON.stringify({ main: 'index.js', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'], d1_databases: [{ binding: 'DB', database_name: 'clubhouse', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: '../../drizzle' }] }, null, 2));
const { default: worker } = await import(new URL('../dist/server/index.js', import.meta.url));
if (typeof worker?.fetch !== 'function') throw new Error('Missing Worker fetch entrypoint.');
for (const path of ['/', '/games/rummy', '/games/spades', '/games/farkle', '/games/five-dice', '/clubhouse-config.js', '/api/rummy/health', '/api/five-dice/health']) {
  const response = await worker.fetch(new Request(`https://clubhouse.test${path}`), {}, { waitUntil() {} });
  if (!response.ok) throw new Error(`Worker route failed: ${path}`);
}
console.log(`Sites Worker ready (${Object.keys(assets).length} embedded assets).`);
