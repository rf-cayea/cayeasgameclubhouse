import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { readdir, readFile, mkdir, cp, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

// Sites accepts at most 10 MiB of uploaded files per deployment, counted across
// the Worker modules and the static asset directory together.
const UPLOAD_LIMIT = 10 * 1024 * 1024;

// Keep the local Node/Vite workflow; build an additional standalone Sites Worker.
execFileSync(process.execPath, ['scripts/generate-cloud-stores.mjs', '--check'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/prepare-supabase-setup.mjs', '--check'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist/client'], { stdio: 'inherit' });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { stdio: 'inherit' });
const assets = {}, siteAssets = {}, staticTypes = {};
const optimizedSourceHashes = JSON.parse(await readFile('art/optimized-assets/manifest.json', 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
// Embedded responses are gzipped and inflated by the Worker, so the text and
// audio the app needs on first paint never cost a static asset round trip.
const embeddedTypes = new Set(['text/html; charset=utf-8', 'application/javascript; charset=utf-8', 'text/css; charset=utf-8', 'image/svg+xml', 'application/json', 'application/manifest+json', 'image/x-icon', 'audio/mpeg']);
async function collect(directory, prefix = '') {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${file.name}`, path = join(directory, file.name);
    if (file.isDirectory()) await collect(path, relative);
    else {
      let bytes = await readFile(path), type = types[extname(file.name)] || 'application/octet-stream';
      // Serve pre-encoded AVIF at existing WebP URLs; the Worker supplies the
      // matching content type because the file name still ends in .webp.
      if (extname(file.name) === '.webp' && optimizedSourceHashes[relative.slice(1)] === createHash('sha256').update(bytes).digest('hex')) {
        try { bytes = await readFile(join('art/optimized-assets', relative.slice(1).replace(/\.webp$/, '.avif'))); type = 'image/avif'; staticTypes[relative] = 'image/avif'; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (embeddedTypes.has(type)) assets[relative] = { type, data: gzipSync(bytes, { level: 9 }).toString('base64'), gzip: true };
      else siteAssets[relative] = bytes;
    }
  }
}
await collect('dist/client');
assets.__static_types__ = { type: 'application/json', data: Buffer.from(JSON.stringify(staticTypes)).toString('base64') };
await mkdir('dist/server', { recursive: true });
let staticBytes = 0;
for (const [name, bytes] of Object.entries(siteAssets)) {
  const target = join('dist/server/site-assets', name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  staticBytes += bytes.length;
}
// The upload cap applies per deployment, so embedded data is split across small
// sibling modules instead of one multi-megabyte Worker bundle.
const chunks = [];
let chunk = {}, chunkBytes = 0;
for (const [name, asset] of Object.entries(assets)) {
  const size = name.length + asset.data.length + 64;
  if (chunkBytes + size > 3_000_000 && chunkBytes) { chunks.push(chunk); chunk = {}; chunkBytes = 0; }
  chunk[name] = asset; chunkBytes += size;
}
if (chunkBytes) chunks.push(chunk);
const chunkNames = [];
for (const [index, value] of chunks.entries()) {
  chunkNames.push(`assets-${index}.js`);
  await writeFile(`dist/server/assets-${index}.js`, `export default ${JSON.stringify(value)};\n`);
}
await writeFile('dist/server/assets.js', `${chunkNames.map((name, index) => `import chunk${index} from './${name}';`).join('\n')}\nexport default Object.assign({}, ${chunkNames.map((_, index) => `chunk${index}`).join(', ')});\n`);
await build({ entryPoints: ['worker/index.ts'], outfile: 'dist/server/index.js', bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true, external: ['node:crypto'], plugins: [{ name: 'embedded-assets', setup(builder) {
  builder.onResolve({ filter: /^clubhouse:assets$/ }, () => ({ path: './assets.js', external: true }));
} }] });
const workerBytes = gzipSync(await readFile('dist/server/index.js'), { level: 9 }).byteLength;
if (workerBytes > 10 * 1024 * 1024) throw new Error(`Sites Worker exceeds its compressed size limit (${workerBytes} bytes).`);
const moduleBytes = (await Promise.all(['index.js', 'assets.js', ...chunkNames].map(name => readFile(`dist/server/${name}`))))
  .reduce((total, file) => total + file.length, 0);
if (moduleBytes + staticBytes > UPLOAD_LIMIT) {
  throw new Error(`Sites deployment is too large: ${moduleBytes} Worker bytes plus ${staticBytes} asset bytes exceeds ${UPLOAD_LIMIT}.`);
}
await writeFile('dist/server/manifest.json', JSON.stringify({
  entrypoint: 'index.js', compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'], assetsDirectory: 'site-assets',
  modules: ['index.js', 'assets.js', ...chunkNames].map(name => ({ name, type: 'esm', path: name })),
}, null, 2));
await mkdir('dist/.openai', { recursive: true });
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await writeFile('dist/server/package.json', '{"type":"module"}\n');
await writeFile('dist/server/wrangler.json', JSON.stringify({ main: 'index.js', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'], d1_databases: [{ binding: 'DB', database_name: 'clubhouse', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: '../../drizzle' }] }, null, 2));
const { default: worker } = await import(new URL('../dist/server/index.js', import.meta.url));
if (typeof worker?.fetch !== 'function') throw new Error('Missing Worker fetch entrypoint.');
for (const path of ['/', '/collectibles', '/store', '/about', '/matchmaking', '/games/faith-3', '/games/3-gems', '/games/rummy', '/games/spades', '/games/quintsee', '/games/backgammon','/games/carrom','/games/farkle', '/games/crown-court', '/games/crown-chance', '/games/five-dice', '/games/dominoes', '/clubhouse-config.js', '/api/rummy/health', '/api/five-dice/health', '/api/farkle/health', '/api/crown-court/health', '/api/carrom/health', '/api/crown-chance/health', '/api/dominoes/health']) {
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
// Artwork now lives in the static asset directory; serve one through the same
// fallback the Worker uses in production.
const image = await worker.fetch(new Request('https://clubhouse.test/faith-art/christianity-islam.webp'), { ASSETS: { fetch: async () => new Response(siteAssets['/faith-art/christianity-islam.webp']) } }, { waitUntil() {} });
if (!image.ok || image.headers.get('content-type') !== 'image/avif' || (await image.arrayBuffer()).byteLength < 1000) throw new Error('Static artwork fallback failed.');
console.log(`Sites Worker ready (${Object.keys(assets).length} embedded entries, ${moduleBytes} Worker bytes, ${staticBytes} static asset bytes).`);
