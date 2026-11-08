import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = new URL('../supabase/migrations/', import.meta.url);
const names = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
const sections = [];
for (const name of names) {
  const original = await readFile(new URL(name, directory), 'utf8');
  if ((original.match(/^begin;\s*$/gmi) || []).length !== 1 || (original.match(/^commit;\s*$/gmi) || []).length !== 1) throw new Error(`Review transaction boundaries in ${name}.`);
  const sql = original.replace(/^begin;\s*$/gmi, '').replace(/^commit;\s*$/gmi, '').trim();
  sections.push(`-- Source: ${name}\n-- SHA-256: ${createHash('sha256').update(original).digest('hex')}\n${sql}`);
}
const content = `-- Cayea's Game Clubhouse: initial Supabase database setup\n-- Run ONCE in a NEW, empty Supabase project's SQL Editor.\n-- All source migrations are combined into one transaction.\n-- Existing projects require a schema review before using this script.\n\nbegin;\n\n${sections.join('\n\n')}\n\ncommit;\n`;
const output = new URL('../public/clubhouse-supabase-setup.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(output, 'utf8') !== content) throw new Error('Run node scripts/prepare-supabase-setup.mjs to refresh the setup download.');
} else await writeFile(output, content);
const upgrade = await readFile(new URL('20261102010000_faith3_skins.sql', directory), 'utf8');
const upgradeOutput = new URL('../public/clubhouse-faith3-skins-upgrade.sql', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(upgradeOutput, 'utf8') !== upgrade) throw new Error('Refresh the Faith 3 skins upgrade download.');
} else await writeFile(upgradeOutput, upgrade);
console.log(`Supabase setup download contains ${names.length} migrations.`);
