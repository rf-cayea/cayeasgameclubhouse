import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/economy-api', () => ({ economyRequest: mocks.request }));
import { JOKER_MODE, loadEconomyCatalog, loadJokerMode, purchaseJokerMode, purchaseSpadesPartnerships, purchaseStoreItem, equipStoreItem } from '../src/lib/store';
import { ECONOMY_CATALOG } from '../src/lib/economy-protocol';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); });
const catalog = (items: unknown[]) => mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ items }) });
describe('shared earned-points storefront', () => {
  it('browses public prices without authentication and rejects duplicate or invalid catalog records', async () => {
    catalog(ECONOMY_CATALOG); expect(await loadJokerMode()).toMatchObject(JOKER_MODE);
    expect(mocks.request).not.toHaveBeenCalled();
    for (const items of [[ECONOMY_CATALOG[0], ECONOMY_CATALOG[0]], [{ ...ECONOMY_CATALOG[0], currency: 'real_money' }], [{ ...ECONOMY_CATALOG[0], price: -1 }]]) {
      catalog(items); await expect(loadEconomyCatalog()).rejects.toThrow('could not be verified');
    }
  });
  it('shows catalog transport and JSON errors instead of pretending checkout is ready', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'offline' }) });
    await expect(loadJokerMode()).rejects.toThrow('unavailable');
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => { throw new Error('not JSON'); } });
    await expect(loadJokerMode()).rejects.toThrow('unavailable');
  });
  it('uses canonical item prices and the initiating actor, and rejects a different currency or item', async () => {
    const itemId = JOKER_MODE.id;
    const data = { ok: true, receipt: { type: 'purchase', itemId, currency: 'rummy_points', amount: 500, alreadyApplied: false }, wallet: { rummy_points: 30, owned: [itemId] } };
    mocks.request.mockResolvedValue(data);
    expect(await purchaseJokerMode('original-member')).toEqual({ item_id: itemId, owned: true, already_owned: false, balance: 30, currency: 'rummy_points', price: 500 });
    expect(mocks.request).toHaveBeenCalledWith({ operation: 'purchase', itemId, payment: 'game' }, 'original-member');
    mocks.request.mockResolvedValue({ ...data, receipt: { ...data.receipt, currency: 'points' } });
    await expect(purchaseJokerMode('original-member')).rejects.toThrow('could not be confirmed');
    await expect(purchaseSpadesPartnerships('original-member')).rejects.toThrow('could not be confirmed');
  });
  it('returns the complete confirmed wallet and requires the exact equipped item and slot', async () => {
    const wallet = { points: 500, f3_points: 100, gems_points: 100, rummy_points: 100, spades_points: 100,dice_points:0,domino_points:0, lifetime_points: 1000, owned: [], equipped: { spades_deck: 'spades-deck-classic' }, pending_perks: {} };
    mocks.request.mockResolvedValue({ ok: true, receipt: { type: 'equip', itemId: 'spades-deck-classic' }, wallet });
    await expect(equipStoreItem('spades_deck', 'spades-deck-classic', 'member-a')).resolves.toEqual({ item_id: 'spades-deck-classic', slot: 'spades_deck', wallet });
    await expect(equipStoreItem('spades_table', 'spades-deck-classic', 'member-a')).rejects.toThrow('could not be confirmed');
    mocks.request.mockResolvedValue({ ok: true, receipt: { type: 'equip', itemId: 'spades-deck-classic' }, wallet: { equipped: wallet.equipped } });
    await expect(equipStoreItem('spades_deck', 'spades-deck-classic', 'member-a')).rejects.toThrow('could not be confirmed');
    mocks.request.mockResolvedValue({ ok: true, receipt: { type: 'equip', itemId: 'faith3-skin-jade' }, wallet: { ...wallet, equipped: { faith3_skin: 'faith3-skin-jade' } } });
    await expect(equipStoreItem('faith3_skin', 'faith3-skin-jade', 'member-a')).rejects.toThrow('could not be confirmed');
  });
  it('verifies shared-deck checkout against the chosen points source and the new price', async () => {
    const itemId = 'card-deck-four-color';
    const data = { ok: true, receipt: { type: 'purchase', itemId, currency: 'spades_points', amount: 563, alreadyApplied: false }, wallet: { spades_points: 437, owned: [itemId] } };
    mocks.request.mockResolvedValue(data);
    expect(await purchaseStoreItem(itemId, 'member-a', 'game', 'spades')).toMatchObject({ price: 563, currency: 'spades_points' });
    expect(mocks.request).toHaveBeenCalledWith({ operation: 'purchase', itemId, payment: 'game', game: 'spades' }, 'member-a');
    mocks.request.mockResolvedValue({ ...data, receipt: { ...data.receipt, amount: 300 } });
    await expect(purchaseStoreItem(itemId, 'member-a', 'game', 'spades')).rejects.toThrow('could not be confirmed');
    await expect(purchaseStoreItem(itemId, 'member-a', 'game', 'faith-3')).rejects.toThrow('Rummy+ or Spades');
  });

});
