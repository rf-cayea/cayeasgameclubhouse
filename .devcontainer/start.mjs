import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const port = Number(process.env.CLUBHOUSE_WEB_PORT ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a valid CLUBHOUSE_WEB_PORT.');
const environment = { ...process.env };
let publicHost;
if (environment.CODESPACES === 'true') {
  const name = environment.CODESPACE_NAME;
  const domain = environment.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!name || !domain || !/^[a-z0-9-]+$/i.test(name) || !/^[a-z0-9.-]+$/i.test(domain)) throw new Error('GitHub Codespaces forwarding settings are unavailable.');
  publicHost = `${name}-${port}.${domain}`;
  environment.RUMMY_ORIGIN = `https://${publicHost}`;
  environment.RUMMY_COOKIE_SECURE = 'true';
  // Allow this Codespace's exact hostname through Vite's host checks.
  environment.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = publicHost;
}
const base = `http://127.0.0.1:${port}`;
async function ready() {
  try {
    const [rummy, spades, page] = await Promise.all([
      fetch(`${base}/api/rummy/health`, { signal: AbortSignal.timeout(1000) }).then(r => r.json()),
      fetch(`${base}/api/spades/health`, { signal: AbortSignal.timeout(1000) }).then(r => r.json()),
      fetch(base, { signal: AbortSignal.timeout(1000) }).then(r => r.text()),
    ]);
    return rummy.app === 'cayea-rummy' && spades.app === 'cayea-spades' && page.includes('/src/main.tsx');
  } catch { return false; }
}
if (!(await ready())) {
  mkdirSync(resolve(root, '.data'), { recursive: true });
  const log = resolve(root, '.data/browser-start.log');
  const fd = openSync(log, 'a');
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
    cwd: root, env: environment, detached: true, stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  await new Promise((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); });
  child.unref();
  let running = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await ready()) { running = true; break; }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  if (!running) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Child may already have exited. */ }
    throw new Error(`The game did not start. See ${log}.`);
  }
  console.log(`Game process: ${child.pid}`);
}
console.log('Verified: hub, Rummy API, and Spades API are ready.');
console.log(publicHost ? `Open https://${publicHost}` : `Open forwarded port ${port} to play.`);
