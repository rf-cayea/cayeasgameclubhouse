import { CLASSIC_FAITH_SKIN, FAITH_SKINS, FAITH_SKIN_SLOT, faithSkin } from './faith-skins';
import { equipStoreItem, loadEconomyCatalog, purchaseStoreItem } from './store';
export async function loadFaithSkins() {
  const data = await loadEconomyCatalog();
  if (FAITH_SKINS.some(item => !data.some(row => row.id === item.id && row.price === item.price && row.currency === 'points' && row.slot === FAITH_SKIN_SLOT))) throw new Error('These designs are being prepared. Please try checkout again later.');
  return FAITH_SKINS;
}
export async function purchaseFaithSkin(id: string, expectedUserId?: string) {
  if (!faithSkin(id)) throw new Error('Choose a Faith 3 skin.');
  return purchaseStoreItem(id, expectedUserId);
}
export async function equipFaithSkin(id: string, expectedUserId?: string) {
  if (id !== CLASSIC_FAITH_SKIN && !faithSkin(id)) throw new Error('Choose a Faith 3 skin.');
  return equipStoreItem(FAITH_SKIN_SLOT, id, expectedUserId);
}
