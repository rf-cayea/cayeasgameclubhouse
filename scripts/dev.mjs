import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const port = Number(process.env.RUMMY_API_PORT ?? 8787);
let ownedServer;
let vite;
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  vite?.kill('SIGTERM');
  ownedServer?.kill('SIGTERM');
  process.exitCode = code;
};
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/rummy/health`, { signal: AbortSignal.timeout(700) });
  if ((await response.json()).app !== 'cayea-rummy') throw new Error('Another service occupies the game port.');
  const spades = await fetch(`http://127.0.0.1:${port}/api/spades/health`, { signal: AbortSignal.timeout(700) });
  if (!spades.ok || (await spades.json()).app !== 'cayea-spades') throw new Error('The existing card-game API needs restarting with Spades support.');
  const farkle = await fetch(`http://127.0.0.1:${port}/api/five-dice/health`, { signal: AbortSignal.timeout(700) });
  if (!farkle.ok || (await farkle.json()).app !== 'clubhouse-five-dice') throw new Error('The existing game API needs restarting with Farkle support.');
} catch (error) {
  if (error.message === 'Another service occupies the game port.' || error.message === 'The existing card-game API needs restarting with Spades support.' || error.message === 'The existing game API needs restarting with Farkle support.') throw error;
  ownedServer = spawn(process.execPath, ['--watch', '--use-env-proxy', '--import', 'tsx', 'server/index.ts'], { stdio: 'inherit', env: process.env });
  ownedServer.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
let ready = false;
for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
  try { const response = await fetch(`http://127.0.0.1:${port}/api/rummy/health`, { signal: AbortSignal.timeout(500) }); if ((await response.json()).app === 'cayea-rummy') { ready = true; break; } }
  catch { /* Wait for the owned service's first startup. */ }
  await new Promise(resolve => setTimeout(resolve, 150));
}
if (!ready) { stop(1); throw new Error('The Rummy API did not become ready. Inspect its startup output.'); }
vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
vite.on('exit', code => stop(code ?? 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
