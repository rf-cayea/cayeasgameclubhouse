import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
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
const optimizedSourceHashes = JSON.parse(await readFile('art/optimized-assets/manifest.json', 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
async function collect(directory, prefix = '') {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${file.name}`, path = join(directory, file.name);
    if (file.isDirectory()) await collect(path, relative);
    else {
      // Embed original bytes. Sites forwards response bodies through its own
      // gateway, so application-level Content-Encoding must not be required.
      let bytes = await readFile(path), type = types[extname(file.name)] || 'application/octet-stream';
      // Serve pre-encoded AVIF at existing image URLs, preserving source artwork.
      // No Content-Encoding: bytes decode directly through the Sites gateway.
      if (extname(file.name) === '.webp' && optimizedSourceHashes[relative.slice(1)] === createHash('sha256').update(bytes).digest('hex')) {
        try { bytes = await readFile(join('art/optimized-assets', relative.slice(1).replace(/\.webp$/, '.avif'))); type = 'image/avif'; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      assets[relative] = { type, data: bytes.toString('base64') };
    }
  }
}
await collect('dist/client');
await mkdir('dist/server', { recursive: true });
await build({ entryPoints: ['worker/index.ts'], outfile: 'dist/server/index.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, external: ['node:crypto'], plugins: [{ name: 'embedded-assets', setup(builder) {
  builder.onResolve({ filter: /^clubhouse:assets$/ }, () => ({ path: 'assets', namespace: 'clubhouse' }));
  builder.onLoad({ filter: /.*/, namespace: 'clubhouse' }, () => ({ contents: `export default ${JSON.stringify(assets)}`, loader: 'js' }));
} }] });
const workerBytes = gzipSync(await readFile('dist/server/index.js'), { level: 9 }).byteLength;
if (workerBytes > 10 * 1024 * 1024) throw new Error(`Sites Worker exceeds its compressed size limit (${workerBytes} bytes).`);
await mkdir('dist/.openai', { recursive: true });
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await writeFile('dist/server/package.json', '{"type":"module"}\n');
await writeFile('dist/server/wrangler.json', JSON.stringify({ main: 'index.js', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'], d1_databases: [{ binding: 'DB', database_name: 'clubhouse', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: '../../drizzle' }] }, null, 2));
const { default: worker } = await import(new URL('../dist/server/index.js', import.meta.url));
if (typeof worker?.fetch !== 'function') throw new Error('Missing Worker fetch entrypoint.');
for (const path of ['/', '/collectibles', '/store', '/about', '/matchmaking', '/games/faith-3', '/games/3-gems', '/games/rummy', '/games/spades', '/games/quintsee', '/games/backgammon','/games/carrom','/games/farkle', '/games/crown-court', '/games/five-dice', '/games/dominoes', '/clubhouse-config.js', '/api/rummy/health', '/api/five-dice/health', '/api/farkle/health', '/api/crown-court/health', '/api/carrom/health', '/api/dominoes/health']) {
  const response = await worker.fetch(new Request(`https://clubhouse.test${path}`), {}, { waitUntil() {} });
  if (!response.ok) throw new Error(`Worker route failed: ${path}`);
  if (response.headers.get('content-encoding')) throw new Error(`Worker asset requires a Content-Encoding header: ${path}`);
  if (response.headers.get('content-type')?.startsWith('text/html') && !(await response.text()).toLowerCase().startsWith('<!doctype html>')) throw new Error(`Worker route did not return readable HTML: ${path}`);
}
for (const track of ['windowlight', 'quiet-current', 'soft-landing', 'last-lantern']) {
  const response = await worker.fetch(new Request(`https://clubhouse.test/game-music/${track}.mp3`), {}, { waitUntil() {} });
  if (!response.ok || response.headers.get('content-type') !== 'audio/mpeg' || (await response.arrayBuffer()).byteLength < 1000) {
    throw new Error(`Worker music asset failed: ${track}`);
  }
}
console.log(`Sites Worker ready (${Object.keys(assets).length} embedded assets, ${workerBytes} compressed Worker bytes).`);
