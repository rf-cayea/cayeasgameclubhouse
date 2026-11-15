import {afterEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {EconomyStore} from '../server/economy';
import {CROSS_GAME_DECKS} from '../src/lib/playing-decks';
import {REWARD_CRATE_POOLS,REWARD_CRATE_META,type RewardCrateCollection} from '../src/lib/reward-crates';
const id='11111111-1111-4111-8111-111111111111',actor={principal:`member:${id}`},close:(()=>void)[]=[];
afterEach(()=>close.splice(0).forEach(fn=>fn()));
const games={dice:'farkle',cards:'hearts',dominoes:'dominoes',carrom:'carrom',backgammon:'backgammon',poker:'crown-chance'} as const;
async function setup(target:string){const db=new TestD1();close.push(()=>db.sqlite.close());const store=new EconomyStore(db,Date.now,()=>0);
 await store.ensureMember(actor,{wallet:{points:500,owned:[...new Set(Object.values(REWARD_CRATE_POOLS).flat().filter(item=>item.id!==target).map(item=>item.id))],equipped:{}},awards:[]});
 async function grant(kind:RewardCrateCollection){const crateId=`${games[kind]}:${randomUUID()}`;db.sqlite.prepare("INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,'reward','points',0,0,'Earned test crate',?,?)").run(randomUUID(),id,REWARD_CRATE_META[kind].earned+crateId,JSON.stringify({game:games[kind],channel:'bot'}),Date.now());return crateId;}
 return{db,store,grant};
}
describe('featured historical deck fragments across every crate',()=>{
 for(const deck of CROSS_GAME_DECKS)for(const kind of Object.keys(games) as RewardCrateCollection[]){
  it(`${deck.name} drops from ${kind} crates and appears in shared card progress`,async()=>{
   const{store,grant}=await setup(deck.id),crateId=await grant(kind),result=await store.command(actor,{operation:'open_reward_crate',collection:kind,crateId});
   expect(result.receipt.crate).toMatchObject({itemId:deck.id,fragments:1,unlocked:false,cash:3});
   for(const category of Object.keys(games) as RewardCrateCollection[])expect(result.rewardCrates?.[category].fragments[deck.id]).toBe(1);
   const retry=await store.command(actor,{operation:'open_reward_crate',collection:kind,crateId});expect(retry.receipt.alreadyApplied).toBe(true);expect(retry.wallet.points).toBe(result.wallet.points);
  });
 }
 it('combines three fragments from different crate types into one permanent shared deck unlock',async()=>{
  const deck=CROSS_GAME_DECKS[0]!,{store,grant}=await setup(deck.id);
  for(const [n,kind] of (['dice','dominoes','cards'] as const).entries()){
   const result=await store.command(actor,{operation:'open_reward_crate',collection:kind,crateId:await grant(kind)});
   expect(result.receipt.crate).toMatchObject({itemId:deck.id,fragments:n+1,unlocked:n===2});
  }
  const data=await store.read(actor);expect(data.wallet.owned).toContain(deck.id);
  await store.command(actor,{operation:'equip',slot:'spades_deck',itemId:deck.id});
 });
 it.each(['hearts','crazy-eights'] as const)('counts verified %s wins for computer and real-player card-deck crates once',async game=>{
  const{store,db}=await setup('card-deck-rome');
  for(const tier of ['normal','humans'] as const){
   const required=tier==='normal'?9:6;
   for(let n=0;n<required;n++){
    db.sqlite.prepare('INSERT INTO classic_card_rewards(match_id,user_id,game,tier) VALUES(?,?,?,?)').run(randomUUID(),id,game,tier);
    await store.syncTrustedRewards(actor);await store.syncTrustedRewards(actor);
    expect((await store.read(actor)).rewardCrates?.cards.totalEarned).toBe((tier==='normal'?0:1)+Number(n+1===required));
   }
  }
  const crates=(await store.read(actor)).rewardCrates!.cards;expect(crates.unopened).toBe(2);
  for(const crate of crates.available){const result=await store.command(actor,{operation:'open_reward_crate',collection:'cards',crateId:crate.id});expect(result.receipt.crate?.cash).toBe(result.receipt.crate?.channel==='human'?28:3);}
 });
});
