export const FAITH_SKIN_SLOT = 'faith3_skin';
export const CLASSIC_FAITH_SKIN = 'faith3-classic';
export const FAITH_SKINS = [
  { id: 'faith3-skin-celestial', name: 'Moonlit Celestial', price: 300, frame: 0, description: 'Midnight enamel, silver filigree, and luminous moonstone details.' },
  { id: 'faith3-skin-jade', name: 'Jade Sanctuary', price: 450, frame: 1, description: 'Carved emerald jade, golden lotus details, and a polished stone finish.' },
  { id: 'faith3-skin-rose', name: 'Rose Quartz', price: 600, frame: 2, description: 'Blush quartz, rose-gold vines, and delicate pearl inlays.' },
] as const;
export type FaithSkinId = typeof FAITH_SKINS[number]['id'];
export const faithSkin = (id?: string) => FAITH_SKINS.find(item => item.id === id);
export function equippedFaithSkin(wallet: { owned: string[]; equipped: Record<string, string> } | null | undefined) {
  const id = wallet?.equipped[FAITH_SKIN_SLOT];
  return id && wallet?.owned.includes(id) && faithSkin(id) ? id : CLASSIC_FAITH_SKIN;
}
