import {afterEach,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {EconomyStore} from '../server/economy';
import {verifiedCrateWin} from './helpers/reward-crate-fixture';
const id='11111111-1111-4111-8111-111111111111',actor={principal:`member:${id}`};let db:TestD1;afterEach(()=>db.sqlite.close());
async function setup(){db=new TestD1();const store=new EconomyStore(db,Date.now,()=>0);await store.ensureMember(actor,{wallet:{points:1000,dice_points:1000,domino_points:1000,rummy_points:1000,owned:[],equipped:{}},awards:[]});return store;}
it('combines an earned Dominoes fragment with two individual purchases and charges once per receipt', async () => {
  const store = await setup();
  let crateId = '';
  for (let n = 0; n < 9; n++) crateId = await verifiedCrateWin(store, db.sqlite, 'dominoes', id);
  const opened = await store.command(actor, { operation: 'open_reward_crate', collection: 'dominoes', crateId });
  expect(opened.receipt.crate).toMatchObject({ itemId: 'domino-skin-ruby', fragments: 1, cash: 3 });
  const command = { operation: 'buy_fragments', itemId: 'domino-skin-ruby', count: 1, payment: 'game', requestId: randomUUID(), expectedPrice: 63 };
  const results = await Promise.all([store.command(actor, command), store.command(actor, command)]);
  expect(results.map(result => result.receipt.alreadyApplied).sort()).toEqual([false, true]);
  expect(results[0].rewardCrates?.dominoes.fragments[command.itemId]).toBe(2);
  expect(results[0].wallet.owned).not.toContain(command.itemId);
  const completed = await store.command(actor, { ...command, requestId: randomUUID(), expectedPrice: 62 });
  expect(completed.wallet.domino_points).toBe(1100);
  expect(completed.wallet.owned).toContain(command.itemId);
  expect(completed.rewardCrates?.dominoes.fragments[command.itemId]).toBe(3);
  await expect(store.command(actor, { ...command, requestId: randomUUID() })).rejects.toMatchObject({ code: 'already_owned' });
});

it('uses the full catalog price to split each collectible into three whole-unit prices', async () => {
  const store = await setup();
  db.sqlite.prepare('UPDATE economy_wallets SET points=2000 WHERE user_id=?').run(id);
  for (const [itemId, prices] of [
    ['farkle-dice-ruby', [49, 48, 48]],
    ['bg-board-admiralty', [97, 96, 96]],
    ['bg-checkers-admiralty', [49, 48, 48]],
    ['card-deck-standard', [145, 145, 144]],
  ] as const) {
    const command = { operation: 'buy_fragments', itemId, count: 1, payment: 'cash' };
    await expect(store.command(actor, { ...command, count: 3, requestId: randomUUID() })).rejects.toMatchObject({ status: 400 });
    await expect(store.command(actor, { ...command, count: 2, requestId: randomUUID() })).rejects.toMatchObject({ status: 400 });
    const before = await store.wallet(actor);
    for (const price of prices) {
      const result = await store.command(actor, { ...command, requestId: randomUUID(), expectedPrice: price });
      expect(result.receipt.amount).toBe(price);
    }
    const after = await store.wallet(actor);
    expect(before.points - after.points).toBe(prices.reduce<number>((sum, price) => sum + price, 0));
    expect(after.owned).toContain(itemId);
  }
  await expect(store.command(actor, { operation: 'buy_fragments', itemId: 'rummy-jokers', count: 1, payment: 'cash', requestId: randomUUID() })).rejects.toMatchObject({ status: 400 });
});

it('refuses a stale quote and retries a recorded pre-update bulk receipt without charging', async () => {
  const store = await setup();
  const order = { operation: 'buy_fragments', itemId: 'card-deck-standard', count: 2, payment: 'cash', requestId: randomUUID() };
  const detail = { type: 'purchase', alreadyApplied: false, itemId: order.itemId, currency: 'points', amount: 290, fragmentItem: order.itemId, fragmentCount: 2 };
  db.sqlite.prepare("INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,'purchase','points',-290,0,?,?,1)")
    .run(randomUUID(), id, `fragment-buy:${order.requestId}`, 'Two fragments', JSON.stringify(detail));
  const replay = await store.command(actor, order);
  expect(replay.receipt).toMatchObject({ alreadyApplied: true, amount: 290 });
  expect(replay.wallet.points).toBe(1000);
  await expect(store.command(actor, { ...order, count: 1, expectedPrice: 145, requestId: randomUUID() })).rejects.toMatchObject({ code: 'fragment_price_changed' });
  const final = await store.command(actor, { ...order, count: 1, expectedPrice: 144, requestId: randomUUID() });
  expect(final.wallet.points).toBe(856);
  expect(final.wallet.owned).toContain(order.itemId);
});

it('carries only unspent verified wins from old counters and does not count losses',async()=>{const store=await setup();const ledger=(source:string,detail:unknown)=>db.sqlite.prepare('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,source,'reward','points',0,0,'Prior progress',JSON.stringify(detail),1);for(let n=0;n<6;n++){const match=randomUUID();ledger(`crate-progress:dominoes:bot:dominoes:${match}`,{game:'dominoes',channel:'bot'});if(n<2)ledger(`dominoes:win:${match}`,{tier:'normal'});}expect((await store.read(actor)).rewardCrates?.dominoes.progress?.computerWins).toBe(2);for(let n=0;n<7;n++)await verifiedCrateWin(store,db.sqlite,'dominoes',id);expect((await store.read(actor)).rewardCrates?.dominoes).toMatchObject({unopened:1,progress:{computerWins:0}});});
