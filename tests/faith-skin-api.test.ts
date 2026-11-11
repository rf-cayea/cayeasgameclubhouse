import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/economy-api', () => ({ economyRequest: mocks.request }));
import { equipFaithSkin, loadFaithSkins, purchaseFaithSkin } from '../src/lib/faith-skin-api';
import { CLASSIC_FAITH_SKIN, FAITH_SKINS, equippedFaithSkin } from '../src/lib/faith-skins';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); });
const catalog = (items: unknown[]) => mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ items }) });
const purchase = (itemId: string, alreadyApplied = false) => ({ ok: true, receipt: { type: 'purchase', itemId, alreadyApplied, currency: 'points', amount: Math.ceil(FAITH_SKINS.find(item => item.id === itemId)!.price * 1.25) }, wallet: { points: 0, owned: [itemId], equipped: {} } });
describe('Faith 3 skin commerce through the member economy', () => {
  it('uses the free original when signed out, unowned, or given an unknown equipped item', () => {
    expect(equippedFaithSkin(null)).toBe(CLASSIC_FAITH_SKIN);
    expect(equippedFaithSkin({ owned: [], equipped: { faith3_skin: FAITH_SKINS[0].id } })).toBe(CLASSIC_FAITH_SKIN);
    expect(equippedFaithSkin({ owned: ['forged'], equipped: { faith3_skin: 'forged' } })).toBe(CLASSIC_FAITH_SKIN);
    expect(equippedFaithSkin({ owned: [FAITH_SKINS[1].id], equipped: { faith3_skin: FAITH_SKINS[1].id } })).toBe(FAITH_SKINS[1].id);
  });
  it('requires all public catalog entries with the expected Cash currency, price and skin slot', async () => {
    const items = FAITH_SKINS.map(item => ({ ...item, price: Math.ceil(item.price * 1.25), cashPrice: Math.ceil(item.price * 1.25), currency: 'points', slot: 'faith3_skin' }));
    catalog(items); expect(await loadFaithSkins()).toEqual(FAITH_SKINS);
    expect(mocks.fetch).toHaveBeenLastCalledWith('/api/economy/catalog', expect.objectContaining({ credentials: 'same-origin' }));
    for (const wrong of [items.slice(1), items.map(item => ({ ...item, currency: 'rummy_points' })), items.map(item => ({ ...item, price: 1 })), items.map(item => ({ ...item, slot: 'spades_deck' }))]) {
      catalog(wrong); await expect(loadFaithSkins()).rejects.toThrow();
    }
  });
  it('sends only the item ID and expected actor and accepts idempotent owned receipts', async () => {
    const item = FAITH_SKINS[0];
    for (const alreadyApplied of [false, true]) {
      mocks.request.mockResolvedValue(purchase(item.id, alreadyApplied));
      expect((await purchaseFaithSkin(item.id, 'member-a')).already_owned).toBe(alreadyApplied);
      expect(mocks.request).toHaveBeenLastCalledWith({ operation: 'purchase', itemId: item.id, payment: 'game' }, 'member-a');
    }
  });
  it('rejects malformed, unowned or cross-item purchase confirmations', async () => {
    for (const extra of [{ receipt: { type: 'purchase', itemId: 'wrong', alreadyApplied: false, currency: 'points' } }, { wallet: { points: 0, owned: [] } }, { receipt: { type: 'conversion', itemId: FAITH_SKINS[0].id, alreadyApplied: false, currency: 'points' } }, { receipt: { type: 'purchase', itemId: FAITH_SKINS[0].id, alreadyApplied: false, currency: 'rummy_points' } }, { wallet: { points: -1, owned: [FAITH_SKINS[0].id] } }]) {
      mocks.request.mockResolvedValue({ ...purchase(FAITH_SKINS[0].id), ...extra });
      await expect(purchaseFaithSkin(FAITH_SKINS[0].id)).rejects.toThrow('could not be confirmed');
    }
    await expect(purchaseFaithSkin('not-a-skin')).rejects.toThrow();
  });
  it('checks the server equipment slot and wallet, including restoring the free default', async () => {
    for (const id of [CLASSIC_FAITH_SKIN, FAITH_SKINS[2].id]) {
      const wallet = { points: 500, f3_points: 10, gems_points: 10, rummy_points: 10, spades_points: 10,dice_points:0,domino_points:0, lifetime_points: 1000, owned: id === CLASSIC_FAITH_SKIN ? [] : [id], equipped: { faith3_skin: id }, pending_perks: {} };
      mocks.request.mockResolvedValue({ ok: true, receipt: { type: 'equip', itemId: id }, wallet });
      expect((await equipFaithSkin(id, 'member-a')).wallet).toEqual(wallet);
      expect(mocks.request).toHaveBeenLastCalledWith({ operation: 'equip', slot: 'faith3_skin', itemId: id }, 'member-a');
    }
    mocks.request.mockResolvedValue({ ok: true, receipt: { type: 'equip', itemId: FAITH_SKINS[0].id }, wallet: { equipped: { spades_deck: FAITH_SKINS[0].id } } });
    await expect(equipFaithSkin(FAITH_SKINS[0].id)).rejects.toThrow('could not be confirmed');
  });
  it('propagates member authorization and ownership denials', async () => {
    const error = new Error('Not enough Clubhouse Cash.'); mocks.request.mockRejectedValue(error);
    await expect(purchaseFaithSkin(FAITH_SKINS[0].id)).rejects.toBe(error);
    await expect(equipFaithSkin(FAITH_SKINS[0].id)).rejects.toBe(error);
  });
});
