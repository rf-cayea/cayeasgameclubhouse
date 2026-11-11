import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { FarkleRoomStore } from '../server/farkle-rooms';
import { EconomyStore } from '../server/economy';
import { MatchmakingStore } from '../server/matchmaking';
import { farkleWinner, validFarkleReceipt, type FarkleMatchReward } from '../src/lib/farkle-rewards';
import { CARD_WIN_POINTS } from '../src/lib/reward-rates';
import type { Identity } from '../server/rooms';
const dbs: TestD1[] = []; afterEach(() => dbs.splice(0).forEach(db => db.sqlite.close()));
const actor: Identity = { principal: 'member:11111111-1111-4111-8111-111111111111', jokers: false }, guest = (n: number): Identity => ({ principal: `guest:test-${n}`, jokers: false });
function setup() { const db = new TestD1(); dbs.push(db); let index = 0; const random = () => ([2,2,3,3,4,6][index++ % 6]! - .5) / 6; return { db, store: new FarkleRoomStore(db, Date.now, random), economy: new EconomyStore(db), discovery: new MatchmakingStore(db) }; }
const send = (store: FarkleRoomStore, identity: Identity, input: Record<string, unknown>) => store.command(identity, { requestId: randomUUID(), ...input });
const options = { mode: 'online', seats: 2, level: 'normal' };

describe('authoritative Farkle rooms', () => {
  it.each([2,3,4])('opens a %i-player online lobby with the required ownership and starts only when everyone is ready', async seats => {
    const { store, discovery, economy } = setup(),peers=Array.from({length:seats},(_,n)=>seats>2?{principal:`member:${n+1}1111111-1111-4111-8111-111111111111`,jokers:false,owned:['farkle-party']}:guest(n)),host=peers[0]!;
    if(seats>2)for(const peer of peers)await economy.ensureMember(peer,{wallet:{owned:['farkle-party'],equipped:{}},awards:[]});
    let room = (await send(store, host, { operation: 'create', name: 'Host', options: { ...options, seats } })).view;
    expect(room.status).toBe('waiting');
    expect((await discovery.list('farkle', peers[1]!)).rooms).toEqual([]);
    await discovery.command('farkle', host, { operation: 'publish', code: room.code }, async () => null);
    expect((await discovery.list('farkle', peers[1]!)).rooms[0]).toMatchObject({ code: room.code, seats, variant: String(seats), locked: false });
    await expect(send(store,host,{operation:'start',code:room.code,revision:room.revision})).rejects.toMatchObject({code:'not_ready'});
    for(let index=1;index<seats;index++) {
      const peer=peers[index]!,joined=await discovery.command('farkle',peer,{operation:'join',code:room.code,name:`Guest ${index}`,requestId:randomUUID()},command=>store.command(peer,command));
      expect((joined as any).view.mySeat).toBe(index);
      await send(store,peer,{operation:'join',code:room.code,name:`Guest ${index}`});
      await send(store,peer,{operation:'ready',code:room.code,ready:true});
    }
    room=await store.get(room.code,host.principal);
    expect(room.players.filter(player=>player.occupied)).toHaveLength(seats);
    await expect(send(store,peers[1]!,{operation:'start',code:room.code,revision:room.revision})).rejects.toMatchObject({code:'not_host'});
    room=(await send(store,host,{operation:'start',code:room.code,revision:room.revision})).view;
    expect(room.state?.dice).toHaveLength(6);expect(room.state?.players).toHaveLength(seats);
    expect((await discovery.list('farkle',guest(1))).rooms).toEqual([]);
  });
  it('commits a random roll once, rejects stale/forged actions, and records a genuine Farkle', async () => {
    const { store, db }=setup(),host=guest(0);
    let room=(await send(store,host,{operation:'create',name:'Player',options:{...options,mode:'bot'}})).view;
    const command={operation:'move',code:room.code,revision:room.revision,requestId:randomUUID(),move:{t:'roll'}};
    const first=await store.command(host,command),retry=await store.command(host,command);
    expect(first.view.state?.activity[0]).toMatchObject({bust:true,dice:[2,2,3,3,4,6]});
    expect(retry.changed).toBe(false);expect(retry.view).toEqual(first.view);
    expect(first.view.state?.busts[0]).toBe(1);
    await expect(store.command(host,{...command,requestId:randomUUID()})).rejects.toMatchObject({code:'stale'});
    await expect(store.command(host,{...command,move:{t:'roll',dice:[1,1,1,1,1,1]}})).rejects.toThrow();
    await expect(store.command(host,{...command,move:{t:'bank'}})).rejects.toMatchObject({code:'request_reused'});
    await expect(store.get(room.code,guest(9).principal)).rejects.toMatchObject({status:403});
    expect(db.sqlite.prepare('SELECT count(*) n FROM farkle_requests').get()?.n).toBe(2);
  });
  it.each(['easy','normal','hard'] as const)('starts a %s computer game with the same fair six dice', async level => {
    const {store}=setup(),room=(await send(store,guest(0),{operation:'create',name:'Player',options:{mode:'bot',seats:2,level}})).view;
    expect(room.state?.players[1]).toMatchObject({bot:true,level});expect(room.state?.dice).toEqual(Array(6).fill(0));
    expect(room.reward.status).toBe('ineligible');
  });
  it('awards a completed member win to the shared dice wallet once, with separate Farkle achievements', async () => {
    const {store,db,economy}=setup();await economy.ensureMember(actor);
    const room=(await send(store,actor,{operation:'create',name:'Member',options:{...options,mode:'bot',level:'hard'}})).view;
    // Seed a server-owned endgame fixture; the browser can never submit these fields.
    const row=JSON.parse(db.sqlite.prepare('SELECT data FROM farkle_rooms WHERE code=?').get(room.code)!.data as string);
    row.state.scores=[9950,0];row.state.turnPoints=300;row.state.rolls=1;
    db.sqlite.prepare('UPDATE farkle_rooms SET data=? WHERE code=?').run(JSON.stringify(row),room.code);
    const won=await send(store,actor,{operation:'move',code:room.code,revision:room.revision,move:{t:'bank'}});
    expect(won.view.status).toBe('finished');expect(won.view.state?.winners).toEqual([0]);
    const evidence=JSON.parse(db.sqlite.prepare('SELECT payload FROM farkle_rewards').get()!.payload as string) as FarkleMatchReward;
    expect(farkleWinner(evidence)).toBe(actor.principal.slice(7));
    await economy.syncTrustedRewards(actor);await economy.syncTrustedRewards(actor);
    const receipt=await economy.claimFarkleReward(evidence);expect(validFarkleReceipt(evidence,receipt)).toBe(true);
    const data=await economy.read(actor);expect(data.wallet.dice_points).toBe(CARD_WIN_POINTS.hard);expect(data.wallet.points).toBe(0);expect(data.diceCrates).toMatchObject({unopened:0,totalEarned:0,progress:{computerWins:1,humanWins:0}});
    expect(data.stats).toMatchObject({farkleWins:1,farkleHardWins:1,diceWins:0,gamesPlayed:1});
    expect(data.achievements.find(badge=>badge.id==='farkle-victory-1')).toMatchObject({unlocked:true,claimed:false,currency:'dice_points'});
    const badge=await economy.command(actor,{operation:'claim_achievement',achievementId:'farkle-victory-1'});
    expect(badge.wallet.dice_points).toBeGreaterThan(CARD_WIN_POINTS.hard);expect(badge.wallet.points).toBeGreaterThan(0);
    await expect(economy.claimFarkleReward({...evidence,scores:[100000,0]})).rejects.toMatchObject({code:'reward_unverified'});
  });
});
