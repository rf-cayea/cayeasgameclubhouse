import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The D1 test harness applies exactly the files the journal lists, so a stale
// tag (or a migration missing from the journal) silently changes what every D1
// suite runs against instead of failing. These checks make that loud.
const directory = new URL('../drizzle/', import.meta.url);
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', directory), 'utf8')) as { entries: { idx: number; tag: string }[] };
const migrations = readdirSync(directory).filter(name => name.endsWith('.sql'));

describe('drizzle migration journal', () => {
  it('resolves every journal entry to a committed migration file', () => {
    const missing = journal.entries.filter(({ tag }) => !migrations.includes(`${tag}.sql`)).map(({ idx, tag }) => `idx ${idx} -> drizzle/${tag}.sql`);
    expect(missing, `Journal entries with no migration file, so D1 tests silently skip them: ${missing.join(', ')}`).toEqual([]);
  });

  it('leaves no migration file orphaned from the journal', () => {
    const tags = new Set(journal.entries.map(({ tag }) => tag));
    const orphaned = migrations.filter(name => !tags.has(name.replace(/\.sql$/, '')));
    expect(orphaned, `Migration files the journal never applies: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('numbers entries contiguously and keeps each tag prefix in step with idx', () => {
    const indexes = journal.entries.map(({ idx }) => idx);
    expect(indexes).toEqual(indexes.map((_, position) => position));
    const mismatched = journal.entries
      .filter(({ idx, tag }) => !tag.startsWith(`${String(idx).padStart(4, '0')}_`))
      .map(({ idx, tag }) => `idx ${idx} -> ${tag}`);
    expect(mismatched, `Journal tags whose numeric prefix disagrees with their idx: ${mismatched.join(', ')}`).toEqual([]);
  });
});
