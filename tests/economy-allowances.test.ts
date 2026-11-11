import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestD1 } from './helpers/d1';
import { EconomyStore } from '../server/economy';
import { settleCashAllowances } from '../server/economy-allowances';

const id = '11111111-1111-4111-8111-111111111111';
const databases: TestD1[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.sqlite.close(); vi.unstubAllGlobals(); });
function setup() {
  const DB = new TestD1(); databases.push(DB);
  DB.sqlite.exec('DELETE FROM economy_allowances');
  DB.sqlite.prepare('INSERT INTO economy_allowances(id,user_id,target_cash,reason,created_at) VALUES(?,?,?,?,?)').run('fictional-tester', id, 3000, 'Tester allowance', Date.now());
  return DB;
}
describe('authorized allowance settlement', () => {
  it('imports the real legacy wallet through a server-only identity before setting the requested total once', async () => {
    const DB = setup(), calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string | Request | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      expect(url.origin).toBe('https://allowance.test.invalid');calls.push(url.pathname);
      if (url.pathname === `/auth/v1/admin/users/${id}`) return Response.json({ id, created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} });
      if (url.pathname === '/rest/v1/wallets') return Response.json([{ points: 125, f3_points: 40, rummy_points: 70, spades_points: 0, lifetime_points: 110, owned: ['rummy-jokers'], equipped: {}, pending_perks: {} }]);
      if (url.pathname === '/rest/v1/point_awards') return Response.json([]);
      throw new Error('Unexpected fixture request');
    });
    await settleCashAllowances({ DB, SUPABASE_URL: 'https://allowance.test.invalid', SUPABASE_SECRET_KEY: 'fictional-server-key' });
    const store = new EconomyStore(DB), actor = { principal: `member:${id}` };
    expect(await store.wallet(actor)).toMatchObject({ points: 3000, f3_points: 40, rummy_points: 70, lifetime_points: 110, owned: ['rummy-jokers'] });
    const before = calls.length;
    await settleCashAllowances({ DB, SUPABASE_URL: 'https://allowance.test.invalid', SUPABASE_SECRET_KEY: 'fictional-server-key' });
    expect(calls).toHaveLength(before);
    expect(DB.sqlite.prepare('SELECT amount FROM economy_ledger WHERE source=?').get('allowance:fictional-tester')?.amount).toBe(2875);
  });
  it('keeps the allowance queued when legacy account verification is unavailable without creating a zero wallet', async () => {
    const DB = setup();
    vi.stubGlobal('fetch', async () => Response.json({ message: 'Fixture account verification unavailable' }, { status: 403 }));
    await settleCashAllowances({ DB, SUPABASE_URL: 'https://allowance.test.invalid', SUPABASE_SECRET_KEY: 'fictional-server-key' });
    const store = new EconomyStore(DB);
    expect(await store.hasMember({ principal: `member:${id}` })).toBe(false);
    expect(await store.pendingAllowances()).toMatchObject([{ userId: id, targetCash: 3000 }]);
  });
});
