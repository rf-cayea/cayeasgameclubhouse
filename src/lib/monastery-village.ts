/** Legacy village save parsing and merging. No village activities are exposed by the game. */
export const VILLAGE_IDS = ['theravada', 'mahayana', 'vajrayana', 'zen'] as const;
export type VillageId = typeof VILLAGE_IDS[number];
export const VILLAGE_RESOURCES = [
  { id: 'wood', name: 'Wood', icon: '▥' }, { id: 'grain', name: 'Grain', icon: '♧' },
  { id: 'vegetables', name: 'Vegetables', icon: '❧' }, { id: 'fiber', name: 'Plant fiber', icon: '≋' }, { id: 'herbs', name: 'Herbs', icon: '✿' },
] as const;
export type VillageResource = typeof VILLAGE_RESOURCES[number]['id'];
export type ResourceBag = Record<VillageResource, number>;
const STARTER: ResourceBag = { wood: 4, grain: 4, vegetables: 3, fiber: 6, herbs: 2 };
export const VILLAGE_STORAGE = 32;
export const VILLAGE_JOBS = [
  { id: 'woodlot', name: 'Village woodlot', role: 'Woodworker', cooldown: 60, action: 'Gather seasoned wood', output: { wood: 3 }, x: 14, y: 43 },
  { id: 'farm', name: 'Community farm', role: 'Farmer', cooldown: 90, action: 'Harvest grain and vegetables', output: { grain: 3, vegetables: 2 }, x: 81, y: 43 },
  { id: 'fiber', name: 'Weaver’s garden', role: 'Weaver', cooldown: 60, action: 'Gather plant fiber', output: { fiber: 3 }, x: 35, y: 61 },
  { id: 'herbs', name: 'Herb beds', role: 'Herb gardener', cooldown: 75, action: 'Harvest kitchen herbs', output: { herbs: 3 }, x: 81, y: 80 },
] as const;
export const VILLAGE_RECIPES = [
  { id: 'meal', name: 'Vegetable grain meal', description: 'A cooked meal for neighbours or an alms offering.', materials: { grain: 2, vegetables: 1, herbs: 1, wood: 1 }, capacity: 12 },
  { id: 'bowl', name: 'Wooden serving bowl', description: 'A serving bowl for the lay community’s shared kitchen.', materials: { wood: 2 }, capacity: 8 },
  { id: 'bench', name: 'Study bench', description: 'A wooden bench for community lessons and shared study.', materials: { wood: 4, fiber: 1 }, capacity: 4 },
] as const;
export type VillageRecipe = typeof VILLAGE_RECIPES[number]['id'];
export const VILLAGE_SUPPORT = [
  { id: 'families', title: 'Share a meal with a lay family', item: 'meal', reward: 2 },
  { id: 'kitchen', title: 'Equip the village kitchen', item: 'bowl', reward: 3 },
  { id: 'study', title: 'Prepare a seat for community lessons', item: 'bench', reward: 4 },
] as const;
export const VILLAGE_THEMES = [
  { id: 'theravada', name: 'Bodhi Village', start: 0, monastics: 1, grain: 'Rice', row: 0, villagers: ['Arun', 'Leela', 'Nila', 'Ravi'], cook: 'Maya', monk: 'Venerable Sumana', nun: 'Venerable Soma' },
  { id: 'mahayana', name: 'Lotus Bridge Village', start: 10, monastics: 11, grain: 'Rice', row: 1, villagers: ['Bo', 'Mei', 'Lin', 'Yun'], cook: 'Jia', monk: 'Teacher Ming', nun: 'Venerable Jing' },
  { id: 'vajrayana', name: 'Snow Pass Village', start: 30, monastics: 31, grain: 'Barley', row: 2, villagers: ['Tashi', 'Dolma', 'Pema', 'Norbu'], cook: 'Lhamo', monk: 'Venerable Tenzin', nun: 'Venerable Yeshe' },
  { id: 'zen', name: 'Still Water Village', start: 40, monastics: 41, grain: 'Rice', row: 3, villagers: ['Aki', 'Kaede', 'Ren', 'Haru'], cook: 'Yui', monk: 'Teacher Daichi', nun: 'Teacher Sora' },
] as const;
export type ProducerId = typeof VILLAGE_JOBS[number]['id'];
export interface VillageProduction { levels: Record<ProducerId, number>; workers: Record<ProducerId, number>; readyAt: Record<ProducerId, number>; houses: number }
export interface VillageContext { now: number; owned: readonly string[] }
export const producerUnlock = (id: ProducerId) => `gems-worker-${id}`;
export const emptyProduction = (): VillageProduction => ({ levels: {woodlot:1,farm:1,fiber:1,herbs:1}, workers: {woodlot:1,farm:1,fiber:1,herbs:1}, readyAt: {woodlot:0,farm:0,fiber:0,herbs:0}, houses:1 });
export const producerUpgrade = (level: number) => ({ supplies: level * 3, materials: {wood:level * 2,fiber:level} });
export const housingUpgrade = (houses: number) => ({ supplies: houses === 1 ? 12 : 20, materials: {wood:houses === 1 ? 6 : 10,fiber:houses === 1 ? 4 : 6} });
export const housingBeds = (houses: number) => 4 + (houses - 1) * 2;
export const workerCount = (p: VillageProduction) => Object.values(p.workers).reduce((sum,n)=>sum+n,0);
export function producerStatus(record: VillageRecord, id: ProducerId, now: number) {
  const production = record.production ?? emptyProduction(), job = VILLAGE_JOBS.find(item=>item.id===id)!;
  const level = production.levels[id], workers = production.workers[id], readyAt = production.readyAt[id];
  return { level, workers, readyAt, seconds: Math.max(0, Math.ceil((readyAt-now)/1000)), cooldown: Math.round(job.cooldown * (1 - (level-1)*.08)), output: Object.fromEntries(Object.entries(job.output).map(([key,amount])=>[key,(amount+level-1)*workers])) as Partial<ResourceBag> };
}
export function productionSupplies(ledger: VillageLedger) {
  return VILLAGE_IDS.reduce((sum,id)=>{const p=ledger[id].production ?? emptyProduction();return sum + Object.values(p.levels).reduce((n,level)=>n+(level-1)*level/2*3,0) + (p.houses>=2?12:0) + (p.houses>=3?20:0);},0);
}
export interface VillageRecord {
  production?: VillageProduction; produced: ResourceBag; used: ResourceBag;
  prepared: Record<VillageRecipe, number>;
  alms: { monks: number; nuns: number };
  support: Record<'families' | 'kitchen' | 'study', number>;
}
export type VillageLedger = Record<VillageId, VillageRecord>;
export type MonasteryOperation = 'craft' | 'deliver' | 'gather' | 'village_craft' | 'alms' | 'support' | 'producer_upgrade' | 'housing' | 'worker';
const bag = (): ResourceBag => ({ wood: 0, grain: 0, vegetables: 0, fiber: 0, herbs: 0 });
export function emptyVillages(): VillageLedger {
  return Object.fromEntries(VILLAGE_IDS.map(id => [id, { production: emptyProduction(), produced: bag(), used: bag(), prepared: { meal: 0, bowl: 0, bench: 0 }, alms: { monks: 0, nuns: 0 }, support: { families: 0, kitchen: 0, study: 0 } }])) as VillageLedger;
}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
export function readVillages(input: unknown): VillageLedger {
  const result = emptyVillages();
  if (input === undefined) return result;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid village progress.');
  for (const id of VILLAGE_IDS) {
    const source = (input as Record<string, unknown>)[id];
    if (source === undefined) continue;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid village.');
    for (const field of ['produced', 'used', 'prepared', 'alms', 'support'] as const) {
      const values = (source as Record<string, unknown>)[field];
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid village resources.');
      for (const key of Object.keys(result[id][field])) {
        const value = (values as Record<string, unknown>)[key];
        if (!count(value) || field === 'support' && value > 1) throw new Error('Invalid village quantity.');
        (result[id][field] as Record<string, number>)[key] = value;
      }
    }
    const production = (source as VillageRecord).production;
    if (production !== undefined) {
      if (!production || typeof production !== 'object' || !Number.isInteger(production.houses) || production.houses < 1 || production.houses > 3) throw new Error('Invalid village housing.');
      const normalized=emptyProduction();normalized.houses=production.houses;
      for(const job of VILLAGE_JOBS) for(const field of ['levels','workers','readyAt'] as const) {
        const value=production[field]?.[job.id], max=field==='levels'?5:field==='workers'?2:Number.MAX_SAFE_INTEGER;
        if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(field==='readyAt'?0:1)||value>max) throw new Error('Invalid village producer.');
        normalized[field][job.id]=value;
      }
      if(workerCount(normalized)>housingBeds(normalized.houses)) throw new Error('Village workers need housing.');
      result[id].production=normalized;
    }
    villageInventory(result, id);
  }
  return result;
}
export function villageTheme(id: string) { return VILLAGE_THEMES.find(place => place.id === id); }
export function currentVillage(tasks: number): VillageId { return tasks < 10 ? 'theravada' : tasks < 30 ? 'mahayana' : tasks < 40 ? 'vajrayana' : 'zen'; }
export function villageInventory(ledger: VillageLedger, id: VillageId) {
  const record = ledger[id];
  const resources = Object.fromEntries(VILLAGE_RESOURCES.map(resource => [resource.id, STARTER[resource.id] + record.produced[resource.id] - record.used[resource.id]])) as ResourceBag;
  const goods = { meal: record.prepared.meal - record.alms.monks - record.alms.nuns - record.support.families, bowl: record.prepared.bowl - record.support.kitchen, bench: record.prepared.bench - record.support.study };
  if (Object.values(resources).some(value => value < 0 || value > VILLAGE_STORAGE) || VILLAGE_RECIPES.some(recipe => goods[recipe.id] < 0 || goods[recipe.id] > recipe.capacity)) throw new Error('Village inventory cannot be negative or exceed storage.');
  return { resources, goods, record, care: record.alms.monks + record.alms.nuns + Object.values(record.support).reduce((sum, n) => sum + n, 0) };
}
export function villageSupplyBonus(ledger: VillageLedger) {
  return VILLAGE_IDS.reduce((sum, id) => sum + VILLAGE_SUPPORT.reduce((n, task) => n + ledger[id].support[task.id] * task.reward, 0) + (ledger[id].alms.monks > 0 ? 2 : 0) + (ledger[id].alms.nuns > 0 ? 2 : 0), 0);
}
export function canUseMaterials(ledger: VillageLedger, id: VillageId, materials: Partial<ResourceBag>) {
  const stock = villageInventory(ledger, id).resources;
  return Object.entries(materials).every(([key, amount]) => stock[key as VillageResource] >= amount!);
}
export function spendVillageMaterials(ledger: VillageLedger, id: VillageId, materials: Partial<ResourceBag>) {
  if (!canUseMaterials(ledger, id, materials)) return false;
  for (const [key, amount] of Object.entries(materials)) ledger[id].used[key as VillageResource] += amount!;
  return true;
}
export function villageAction(input: VillageLedger, tasks: number, operation: MonasteryOperation, action: string, siteId: string, context: VillageContext = { now: Date.now(), owned: [] }, supplies = 0) {
  const site = villageTheme(siteId);
  if (!site || tasks < site.start) return null;
  const ledger = structuredClone(input), id = site.id, record = ledger[id], stock = villageInventory(ledger, id);
  const production = record.production ??= emptyProduction();
  if (operation === 'producer_upgrade') {
    const job = VILLAGE_JOBS.find(item=>item.id===action);
    if(!job || tasks<4 || production.levels[job.id]>=5) return null;
    const cost=producerUpgrade(production.levels[job.id]);
    if(supplies<cost.supplies || !spendVillageMaterials(ledger,id,cost.materials)) return null;
    production.levels[job.id]++;
  } else if(operation === 'housing') {
    if(action!=='build' || tasks<4 || production.houses>=3) return null;
    const cost=housingUpgrade(production.houses);
    if(supplies<cost.supplies || !spendVillageMaterials(ledger,id,cost.materials)) return null;
    production.houses++;
  } else if(operation === 'worker') {
    const job=VILLAGE_JOBS.find(item=>item.id===action);
    if(!job || !context.owned.includes(producerUnlock(job.id)) || production.workers[job.id]>=2 || workerCount(production)>=housingBeds(production.houses)) return null;
    production.workers[job.id]=2;
  } else if (operation === 'gather') {
    const job = VILLAGE_JOBS.find(item => item.id === action);
    if (!job) return null;
    const status=producerStatus(record,job.id,context.now);
    if(status.seconds>0) return null;
    let added = 0;
    for (const [key, amount] of Object.entries(status.output)) { const resource = key as VillageResource, increment = Math.min(amount!, VILLAGE_STORAGE - stock.resources[resource]); record.produced[resource] += increment; added += increment; }
    if (!added) return null;
    production.readyAt[job.id]=context.now+status.cooldown*1000;
  } else if (operation === 'village_craft') {
    const recipe = VILLAGE_RECIPES.find(item => item.id === action);
    if (!recipe || recipe.id !== 'meal' && tasks < 4 || stock.goods[recipe.id] >= recipe.capacity || !spendVillageMaterials(ledger, id, recipe.materials)) return null;
    record.prepared[recipe.id]++;
  } else if (operation === 'alms') {
    if (!['monks', 'nuns'].includes(action) || tasks <= site.monastics || stock.goods.meal < 1) return null;
    record.alms[action as 'monks' | 'nuns']++;
  } else if (operation === 'support') {
    const mission = VILLAGE_SUPPORT.find(item => item.id === action);
    if (!mission || record.support[mission.id] || stock.goods[mission.item] < 1) return null;
    record.support[mission.id] = 1;
  } else return null;
  villageInventory(ledger, id);
  return ledger;
}
export function mergeVillages(previous: VillageLedger | undefined, next: VillageLedger | undefined) {
  const a = readVillages(previous), b = readVillages(next);
  for (const id of VILLAGE_IDS) for (const field of ['produced', 'used', 'prepared', 'alms', 'support'] as const) for (const key of Object.keys(a[id][field])) (a[id][field] as Record<string, number>)[key] = Math.max((a[id][field] as Record<string, number>)[key]!, (b[id][field] as Record<string, number>)[key]!);
  for(const id of VILLAGE_IDS) {
    const p=a[id].production!,q=b[id].production!;p.houses=Math.max(p.houses,q.houses);
    for(const job of VILLAGE_JOBS) for(const field of ['levels','workers','readyAt'] as const) p[field][job.id]=Math.max(p[field][job.id],q[field][job.id]);
  }
  return a;
}
