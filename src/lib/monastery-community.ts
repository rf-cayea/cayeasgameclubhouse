import { emptyVillages, readVillages, villageSupplyBonus, productionSupplies, type VillageLedger } from './monastery-village';

export const MONASTERY_CRAFTS = [
  { id: 'beads', name: 'Wooden mala beads', cost: 2, icon: '◌', materials: { wood: 2, fiber: 1 }, description: 'String wooden beads with plant-fiber cord.' },
  { id: 'cover', name: 'Dharma-study book cover', cost: 3, icon: '▤', materials: { wood: 1, fiber: 2 }, description: 'Sew a protective cloth cover for a study book.' },
  { id: 'cushion', name: 'Meditation cushion', cost: 4, icon: '▰', materials: { fiber: 3 }, description: 'Make a comfortable cloth cushion for a shared practice space.' },
] as const;
export type MonasteryCraft = typeof MONASTERY_CRAFTS[number]['id'];
export interface MonasteryWorkshop { made: Record<MonasteryCraft, number>; orders: string[]; village?: VillageLedger; campaign?: { version: 2; credit: number } }
export const emptyWorkshop = (): MonasteryWorkshop => ({ made: { beads: 0, cover: 0, cushion: 0 }, orders: [], village: emptyVillages(), campaign: { version: 2, credit: 0 } });
const BUYERS = [['Nila', 'Arun', 'Leela'], ['Bo', 'Mei', 'Lin'], ['Pema', 'Tashi', 'Dolma'], ['Aki', 'Ren', 'Kaede']];
const SITES = ['theravada', 'mahayana', 'vajrayana', 'zen'];
export const MONASTERY_ORDERS = SITES.flatMap((site, chapter) => MONASTERY_CRAFTS.map((item, n) => ({
  id: `${site}-${item.id}`, site, itemId: item.id, buyer: BUYERS[chapter]![n]!, reward: item.cost - 1, unlock: [4, 10, 30, 40][chapter]!,
  purpose: n === 0 ? 'A handmade set for a visiting practitioner.' : n === 1 ? 'A cloth cover for the community’s study books.' : 'A seat for a neighbour joining a practice gathering.',
})));
const GARDENS = [0, 4, 5, 6, 7, 10, 15, 16, 17, 19, 23, 37, 43];
const MONKS = [1, 11, 31, 41], LESSONS = [2, 14, 34, 44];
const DELIVERIES: Record<number, string> = { 8: 'theravada-beads', 29: 'mahayana-cover', 38: 'vajrayana-beads', 48: 'zen-cushion' };
export function monasteryMission(index: number) {
  return { kind: GARDENS.includes(index) ? 'garden' : MONKS.includes(index) ? 'monks' : LESSONS.includes(index) ? 'lesson' : index === 3 ? 'workshop' : DELIVERIES[index] ? 'community' : 'repair', requiresOrder: DELIVERIES[index] };
}
export function readWorkshop(input: unknown): MonasteryWorkshop {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid monastery workshop.');
  const value = input as Partial<MonasteryWorkshop>, made = value.made ?? emptyWorkshop().made, orders = value.orders ?? [];
  if (value.campaign !== undefined && (value.campaign?.version !== 2 || !Number.isSafeInteger(value.campaign.credit) || value.campaign.credit < 0 || value.campaign.credit > 50)) throw new Error('Invalid restoration credit.');
  if (MONASTERY_CRAFTS.some(item => !Number.isSafeInteger(made[item.id]) || made[item.id] < 0 || made[item.id] > 1000) || !Array.isArray(orders) || new Set(orders).size !== orders.length || orders.some(id => !MONASTERY_ORDERS.some(order => order.id === id))) throw new Error('Invalid monastery stock or orders.');
  for (const item of MONASTERY_CRAFTS) if (orders.filter(id => MONASTERY_ORDERS.find(order => order.id === id)?.itemId === item.id).length > made[item.id]) throw new Error('An order cannot be delivered without a crafted item.');
  return { made: { ...made }, orders: [...orders], village: readVillages(value.village), ...(value.campaign ? { campaign: { ...value.campaign } } : {}) };
}
export function monasteryCommunity(earned: number, tasks: number, workshop: MonasteryWorkshop) {
  const spent = MONASTERY_CRAFTS.reduce((sum, item) => sum + workshop.made[item.id] * item.cost, 0), returned = workshop.orders.reduce((sum, id) => sum + MONASTERY_ORDERS.find(order => order.id === id)!.reward, 0);
  const supplies = earned * 3 + GARDENS.filter(index => index < tasks).length * 2 - spent + returned + villageSupplyBonus(readVillages(workshop.village)) - productionSupplies(readVillages(workshop.village));
  if (supplies < 0) throw new Error('Crafting supplies cannot be negative.');
  return { supplies, monks: MONKS.filter(index => index < tasks).length, nuns: MONKS.filter(index => index < tasks).length, lessons: LESSONS.filter(index => index < tasks).length,
    stock: Object.fromEntries(MONASTERY_CRAFTS.map(item => [item.id, workshop.made[item.id] - workshop.orders.filter(id => MONASTERY_ORDERS.find(order => order.id === id)?.itemId === item.id).length])) as Record<MonasteryCraft, number> };
}
