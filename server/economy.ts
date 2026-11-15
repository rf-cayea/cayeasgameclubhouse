import { RUMMY_TABLE_SURFACES, canonicalCardTable, ownsCardTable } from '../src/lib/card-table-themes';
import { CARROM_BOARD_SLOT, CARROM_PUCK_SLOT, CARROM_STRIKER_SLOT, CLASSIC_CARROM_STRIKER, CLASSIC_CARROM_BOARD, CLASSIC_CARROM_PUCKS } from '../src/lib/carrom-sets';
import {carromRewardTier,carromWinner,type CarromMatchReward,type CarromReceipt} from '../src/lib/carrom-rewards';
import {CollectiblesStore} from './collectibles';
import {CRATE_POLICY} from '../src/lib/dice-crates';
import {bgRewardTier,bgWinner,type BGMatchReward,type BGReceipt} from '../src/lib/backgammon-rewards';
import {REWARD_CRATE_POOLS,REWARD_CRATE_META,crateCollectionForGame,type RewardCrateCollection} from '../src/lib/reward-crates';
import { DICE_CRATE_DESIGNS, DICE_CRATE_CASH, DICE_FRAGMENTS_REQUIRED, type DiceCrateView, type DiceCrateReward } from '../src/lib/dice-crates';
import { crownCourtRewardTier, crownCourtWinner, type CrownCourtMatchReward, type CrownCourtReceipt } from '../src/lib/crown-court-rewards';
import { crownChanceRewardTier, crownChanceWinner, type CrownChanceMatchReward, type CrownChanceReceipt } from '../src/lib/crown-chance-rewards';
import { farkleRewardTier, farkleWinner, type FarkleMatchReward, type FarkleReceipt } from '../src/lib/farkle-rewards';
import { D6_DICE_SLOT, CLASSIC_D6_DICE } from '../src/lib/d6-dice';
import { collectionBundle } from '../src/lib/collection-bundles';
import { DOMINO_INCLUDED_SKINS,DOMINO_SKIN_SLOT } from '../src/lib/dominoes-skins';
import { dominoRewardTier, dominoWinner, type DominoMatchReward, type DominoReceipt } from '../src/lib/dominoes-rewards';
import { fiveDiceRewardTier, fiveDiceWinner, type FiveDiceMatchReward, type FiveDiceReceipt } from '../src/lib/five-dice-rewards';
import { CARD_WIN_POINTS } from '../src/lib/reward-rates';
import { gameAchievementCash,legacyGameAchievementCash } from '../src/lib/reward-rates';
import { LEGACY_CUSTOM_PROFILE_IMAGE, PROFILE_IMAGE_SHAPES, customProfileImage, profileFrameItem, profileFrameName } from '../src/lib/profile-image';
import { randomUUID, randomInt } from 'node:crypto';
import type { D1Binding, D1Statement } from './database';
import { readJsonGroups } from './json-groups';
import { RummyError } from '../src/lib/rummy-protocol';
import { memberId, rewardTier, type MatchReward, type RewardReceipt } from '../src/lib/rummy-rewards';
import { spadesRewardTier, spadesWinners, type SpadesMatchReward, type SpadesReceipt } from '../src/lib/spades-rewards';
import { WIN_POINTS } from '../src/lib/rummy';
import { SPADES_POINTS } from '../src/lib/spades';
import { RUMMY_DESIGNS } from '../src/lib/rummy-cosmetics';
import { canonicalDeckId, isSharedDeck, LEGACY_DECK_WINS } from '../src/lib/playing-decks';
import { ACHIEVEMENTS } from '../src/lib/achievement-catalog';
import { GEMS_LEVEL_COUNT } from '../src/lib/gems-levels';
import { CONVERSION_RATE, ECONOMY_CATALOG, POINT_FIELDS, POINT_GAMES, puzzleLevelPoints, fragmentPrice, isSharedTable, storePointSources, type Currency, type EconomyWallet, type EconomyView, type EconomyStats, type EconomyHistory, type EconomyCommandResult, type EconomyReceipt, type PointGame, type PuzzleProgress } from '../src/lib/economy-protocol';

export interface EconomyIdentity { principal: string }
export interface LegacyEconomy { wallet: Partial<EconomyWallet> | null; awards: { source: string; amount?: number; rummy_tier?: string | null; created_at?: string | number }[]; joinedAt?: string | number }
interface WalletRow { user_id: string; points: number; f3_points: number; gems_points: number; rummy_points: number; spades_points: number; dice_points: number; domino_points: number; lifetime_points: number; owned: string; equipped: string; pending_perks: string; revision: number; import_token: string; created_at: number; updated_at: number }
interface Snapshot { row: WalletRow; wallet: EconomyWallet }
interface WalletProjection extends WalletRow { deck_migrated: number; rummy_wins: number }
interface Plan<T> { wallet?: EconomyWallet; statements?: D1Statement[]; result: T }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const safe = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2_000_000_000;
const currencyForSource = (source: string): Currency => source.startsWith('faith3:') ? 'f3_points' : source.startsWith('gems:') ? 'gems_points' : source.startsWith('rummy:win:') ? 'rummy_points' : source.startsWith('spades:win:') ? 'spades_points' : (source.startsWith('five-dice:win:') || source.startsWith('farkle:win:') || source.startsWith('crown-court:win:') || source.startsWith('backgammon:win:') || source.startsWith('carrom:win:')) ? 'dice_points' : source.startsWith('dominoes:win:') ? 'domino_points' : 'points';
const empty = (): EconomyWallet => ({ points: 0, f3_points: 0, gems_points: 0, rummy_points: 0, spades_points: 0, dice_points: 0, domino_points: 0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {} });
const parse = <T>(value: string, fallback: T): T => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const fromRow = (r: WalletRow): EconomyWallet => ({ points: r.points, f3_points: r.f3_points, gems_points: r.gems_points, rummy_points: r.rummy_points, spades_points: r.spades_points, dice_points: r.dice_points ?? 0, domino_points: r.domino_points ?? 0, lifetime_points: r.lifetime_points, owned: parse(r.owned, []), equipped: parse(r.equipped, {}), pending_perks: parse(r.pending_perks, {}) });
const date = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : fallback;
const auth = (identity: EconomyIdentity) => { const id = memberId(identity.principal); if (!id) throw new RummyError('Sign in to earn points and use Clubhouse Cash.', 401, 'sign_in_required'); return id; };

/** Wallet mutations use a revision check inside the same D1 batch as their ledger
 * writes. A competing Worker retries from the committed balance; no debit, bonus
 * or conversion can commit independently of its unique receipt. */
export class EconomyStore {
  constructor(readonly binding: D1Binding, private readonly now = Date.now, private readonly random = (max:number)=>randomInt(max)) {}
  private stmt(sql: string, ...values: unknown[]) { return this.binding.prepare(sql).bind(...values); }
  private first<T = Record<string, unknown>>(sql: string, ...values: unknown[]) { return this.stmt(sql, ...values).first<T>(); }
  private async rows<T>(sql: string, ...values: unknown[]): Promise<T[]> { const r = await this.first<{ data: string }>(sql, ...values); return parse(r?.data ?? '[]', []); }
  async hasMember(identity: EconomyIdentity) { return Boolean(await this.first('SELECT user_id FROM economy_wallets WHERE user_id=?', auth(identity))); }
  async wallet(identity: EconomyIdentity): Promise<EconomyWallet> {
    const id = auth(identity);
    const projected = () => this.first<WalletProjection>(`SELECT w.*,
      EXISTS(SELECT 1 FROM economy_ledger WHERE user_id=w.user_id AND source='legacy:shared-playing-decks') AS deck_migrated,
      (SELECT count(*) FROM reward_outbox WHERE user_id=w.user_id) AS rummy_wins
      FROM economy_wallets w WHERE w.user_id=?`, id);
    const initial = await projected();
    if (!initial) throw new RummyError('Your wallet is being prepared. Refresh and try again.', 503, 'wallet_unavailable');
    const migrateFrame = fromRow(initial).owned.includes(LEGACY_CUSTOM_PROFILE_IMAGE);
    if (migrateFrame) {
      await this.transact(id, async ({ wallet }) => {
        if (!wallet.owned.includes(LEGACY_CUSTOM_PROFILE_IMAGE)) return { result: undefined };
        const profile = await this.first<{avatar: string}>('SELECT avatar FROM social_profiles WHERE user_id=?', id);
        const current = customProfileImage(profile?.avatar)?.shape ?? 'circle';
        const shape = !wallet.owned.includes(profileFrameItem(current)) ? current : PROFILE_IMAGE_SHAPES.find(value => !wallet.owned.includes(profileFrameItem(value))) ?? current;
        return { wallet: { ...wallet, owned: [...new Set([...wallet.owned.filter(item => item !== LEGACY_CUSTOM_PROFILE_IMAGE), profileFrameItem(shape)])] },
          statements: [this.ledger(id, 'legacy:custom-profile-frame', 'legacy', 'points', 0, `Existing image unlock · ${profileFrameName(shape)} frame`, { frame: shape })], result: undefined };
      });
    }
    // Snapshot older win rewards once. New wins earn points towards the shared
    // collection; they must not silently unlock a newly priced collectible.
    if (!initial.deck_migrated) {
      await this.transact(id, async ({ wallet }) => {
        if (await this.prior(id, 'legacy:shared-playing-decks')) return { result: undefined };
        const wins = await this.first<{n:number}>('SELECT count(*) AS n FROM reward_outbox WHERE user_id=?', id);
        const earned = Object.entries(LEGACY_DECK_WINS).filter(([, threshold]) => Number(wins?.n ?? 0) >= threshold).map(([deck]) => deck);
        const owned = [...new Set([...wallet.owned.map(canonicalDeckId), ...earned])];
        const equipped = { ...wallet.equipped };
        if (equipped.spades_deck) equipped.spades_deck = canonicalDeckId(equipped.spades_deck);
        return { wallet: { ...wallet, owned, equipped }, statements: [this.ledger(id, 'legacy:shared-playing-decks', 'legacy', 'points', 0, 'Existing shared card collection', { earned })], result: undefined };
      });
    }
    const row = migrateFrame || !initial.deck_migrated ? await projected() ?? initial : initial;
    const wallet = fromRow(row);
    const tables = RUMMY_TABLE_SURFACES.filter(table => table.wins <= row.rummy_wins).map(table => table.id);
    return { ...wallet, owned: [...new Set([...wallet.owned, ...tables])] };
  }
  private async snapshot(id: string): Promise<Snapshot> {
    const row = await this.first<WalletRow>('SELECT * FROM economy_wallets WHERE user_id=?', id);
    if (!row) throw new RummyError('Your wallet is being prepared. Refresh and try again.', 503, 'wallet_unavailable');
    return { row, wallet: fromRow(row) };
  }
  async ensureMember(identity: EconomyIdentity, legacy?: LegacyEconomy): Promise<EconomyWallet> {
    const id = auth(identity);
    if (await this.hasMember(identity)) return this.wallet(identity);
    const now = this.now(), token = randomUUID(), w = empty(), prior = legacy?.wallet;
    if (prior) {
      for (const field of ['points','f3_points','gems_points','rummy_points','spades_points','dice_points','domino_points','lifetime_points'] as const) {
        if (prior[field] !== undefined && !safe(prior[field])) throw new RummyError('Your existing wallet could not be imported safely.', 503, 'wallet_import_failed');
        w[field] = prior[field] ?? 0;
      }
      if (!Array.isArray(prior.owned) || !prior.equipped || typeof prior.equipped !== 'object' || Array.isArray(prior.equipped)) throw new RummyError('Your existing collection could not be imported safely.', 503, 'wallet_import_failed');
      w.owned = [...new Set(prior.owned.filter((v): v is string => typeof v === 'string' && v.length <= 100))];
      w.equipped = Object.fromEntries(Object.entries(prior.equipped).filter(([k,v])=>k.length<=80 && typeof v === 'string' && v.length<=100));
      w.pending_perks = Object.fromEntries(Object.entries(prior.pending_perks ?? {}).filter(([k,v])=>k.length<=80 && safe(v)));
    }
    const awards = (legacy?.awards ?? []).filter(a=>a && typeof a.source === 'string' && a.source.length>0 && a.source.length<=200).map(a=>({ source:a.source, amount:safe(a.amount)?a.amount:0, currency:currencyForSource(a.source), detail:JSON.stringify({tier:a.rummy_tier ?? null}), time:date(a.created_at,now) }));
    const initial = [this.stmt('INSERT OR IGNORE INTO economy_wallets(user_id,points,f3_points,gems_points,rummy_points,spades_points,dice_points,domino_points,lifetime_points,owned,equipped,pending_perks,revision,import_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)', id,w.points,w.f3_points,w.gems_points,w.rummy_points,w.spades_points,w.dice_points,w.domino_points,w.lifetime_points,JSON.stringify(w.owned),JSON.stringify(w.equipped),JSON.stringify(w.pending_perks),token,Math.min(now,date(legacy?.joinedAt,now)),now),
      this.stmt(`INSERT OR IGNORE INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at)
        SELECT lower(hex(randomblob(16))),?,json_extract(value,'$.source'),'legacy',json_extract(value,'$.currency'),json_extract(value,'$.amount'),0,'Earlier Clubhouse reward',json_extract(value,'$.detail'),json_extract(value,'$.time') FROM json_each(?)
        WHERE EXISTS(SELECT 1 FROM economy_wallets WHERE user_id=? AND import_token=?)`,id,JSON.stringify(awards),id,token),
      this.stmt(`INSERT OR IGNORE INTO economy_progress(user_id,game,level,stars,created_at) SELECT ?, 'faith-3', CAST(substr(source,14) AS INTEGER),1,created_at FROM economy_ledger
        WHERE user_id=? AND source GLOB 'faith3:level:[0-9]*' AND CAST(substr(source,14) AS INTEGER) BETWEEN 1 AND 280 AND EXISTS(SELECT 1 FROM economy_wallets WHERE user_id=? AND import_token=?)`,id,id,id,token),
      this.stmt('INSERT OR IGNORE INTO economy_visits(user_id,day) VALUES(?,?)',id,new Date(now).toISOString().slice(0,10))];
    await this.binding.batch(initial); return this.wallet(identity);
  }
  private async transact<T>(id: string, work: (snapshot: Snapshot) => Promise<Plan<T>>): Promise<T> {
    for (let attempt=0;attempt<8;attempt++) {
      const snapshot=await this.snapshot(id), plan=await work(snapshot);
      if (!plan.wallet && !plan.statements?.length) return plan.result;
      const w=plan.wallet ?? snapshot.wallet;
      for (const field of ['points','f3_points','gems_points','rummy_points','spades_points','dice_points','domino_points','lifetime_points'] as const) if (!safe(w[field])) throw new RummyError('This change would exceed the wallet limit.',409,'wallet_limit');
      try {
        await this.binding.batch([
          this.stmt('INSERT INTO command_guards(valid) SELECT CASE WHEN (SELECT revision FROM economy_wallets WHERE user_id=?)=? THEN 1 ELSE 0 END',id,snapshot.row.revision),
          this.stmt('UPDATE economy_wallets SET points=?,f3_points=?,gems_points=?,rummy_points=?,spades_points=?,dice_points=?,domino_points=?,lifetime_points=?,owned=?,equipped=?,pending_perks=?,revision=revision+1,updated_at=? WHERE user_id=?',w.points,w.f3_points,w.gems_points,w.rummy_points,w.spades_points,w.dice_points,w.domino_points,w.lifetime_points,JSON.stringify(w.owned),JSON.stringify(w.equipped),JSON.stringify(w.pending_perks),this.now(),id),
          ...(plan.statements ?? []),this.stmt('DELETE FROM command_guards'),
        ]);
        return plan.result;
      } catch(error) {
        if (/room_revision_matches|CHECK constraint failed.*command_guards/i.test(String(error))) continue;
        throw error;
      }
    }
    throw new RummyError('Your wallet changed in another tab. Refresh before trying again.',409,'wallet_changed');
  }
  private ledger(id:string,source:string,kind:EconomyHistory['kind'],currency:Currency,amount:number,label:string,detail:unknown={},cash=0) {
    return this.stmt('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',randomUUID(),id,source,kind,currency,amount,cash,label,JSON.stringify(detail),this.now());
  }
  private prior(id:string,source:string) { return this.first<{detail:string;amount:number;cash:number;created_at:number;kind:string}>('SELECT detail,amount,cash,created_at,kind FROM economy_ledger WHERE user_id=? AND source=?',id,source); }
  async puzzleProgress(identity:EconomyIdentity,game:'faith-3'|'3-gems'):Promise<PuzzleProgress & {cleared:number[]}> {
    const id=auth(identity); await this.snapshot(id);
    await this.syncClassicCardRewards(identity);
    return this.readPuzzleProgress(id, game);
  }
  private async readPuzzleProgress(id: string, game: 'faith-3' | '3-gems') {
    const rows=await this.rows<{level:number;stars:number}>(`SELECT json_group_array(json_object('level',level,'stars',stars)) AS data FROM (SELECT level,stars FROM economy_progress WHERE user_id=? AND game=? UNION ALL SELECT level,stars FROM gems_extended_progress WHERE user_id=? AND ?='3-gems' ORDER BY level)`,id,game,id,game);
    const levels=rows.map(r=>r.level); let unlocked=1;
    while(levels.includes(unlocked) && unlocked<(game==='faith-3'?280:GEMS_LEVEL_COUNT)) unlocked++;
    return {levels,cleared:levels,stars:Object.fromEntries(rows.map(r=>[String(r.level),r.stars])),unlocked};
  }
  async creditPuzzle(identity:EconomyIdentity,game:'faith-3'|'3-gems',level:number,metadata:{stars?:number;flawless?:boolean;completionId?:string}={}) {
    const id=auth(identity), stars=game==='3-gems'?(metadata.stars??1):1,max=game==='faith-3'?280:GEMS_LEVEL_COUNT;
    if (!['faith-3','3-gems'].includes(game)||!Number.isInteger(level)||level<1||level>max||!Number.isInteger(stars)||stars<1||stars>3) throw new RummyError('Invalid verified level completion.');
    const source=`${game==='faith-3'?'faith3':'gems'}:level:${level}`,currency=POINT_FIELDS[game],amount=puzzleLevelPoints(game,level),extended=game==='3-gems'&&level>150;
    const result=await this.transact(id,async({wallet})=>{
      const previous=await this.prior(id,source);
      if(previous) {
        return { statements:[extended ? this.stmt('UPDATE gems_extended_progress SET stars=max(stars,?) WHERE user_id=? AND level=?',stars,id,level) : this.stmt('UPDATE economy_progress SET stars=max(stars,?) WHERE user_id=? AND game=? AND level=?',stars,id,game,level)], result:{amount:0,alreadyCredited:true} };
      }
      const progress=await this.puzzleProgress(identity,game);
      if(level>progress.unlocked) throw new RummyError('Complete earlier levels before claiming this reward.',409,'level_locked');
      const next={...wallet,[currency]:wallet[currency]+amount,lifetime_points:wallet.lifetime_points+amount};
      return {wallet:next,statements:[this.ledger(id,source,'reward',currency,amount,`${game==='faith-3'?'Faith 3':'3 Gems'} · level ${level}`,metadata),extended ? this.stmt('INSERT INTO gems_extended_progress(user_id,level,stars,created_at) VALUES(?,?,?,?)',id,level,stars,this.now()) : this.stmt('INSERT INTO economy_progress(user_id,game,level,stars,created_at) VALUES(?,?,?,?,?)',id,game,level,stars,this.now())],result:{amount,alreadyCredited:false}};
    });
    return {...result,wallet:await this.wallet(identity)};
  }
  private async creditCard(id:string,source:string,game:'rummy'|'spades'|'five-dice'|'farkle'|'crown-court'|'crown-chance'|'dominoes'|'backgammon'|'carrom'|'crazy-eights'|'hearts',tier:keyof typeof WIN_POINTS,amount:number) {
    return this.transact(id,async({wallet})=>{
      const prior=await this.prior(id,source);
      if(prior) {
        const detail=parse<{tier?:string}>(prior.detail,{});
        return {statements:detail.tier===tier?[]:[this.stmt("UPDATE economy_ledger SET detail=json_set(detail,'$.tier',?) WHERE user_id=? AND source=?",tier,id,source)],result:{already:true,amount:prior.amount>0?prior.amount:amount}};
      }
      const currency=(game==='carrom'||game==='backgammon'||game==='farkle'||game==='crown-court'||game==='crown-chance')?'dice_points':game==='crazy-eights'?'rummy_points':game==='hearts'?'spades_points':POINT_FIELDS[game];
      return {wallet:{...wallet,[currency]:wallet[currency]+amount,lifetime_points:wallet.lifetime_points+amount},statements:[this.ledger(id,source,'reward',currency,amount,`${game==='carrom'?'Carrom / Disc Pool':game==='backgammon'?'Backgammon':game==='rummy'?'Rummy+':game==='five-dice'?'Quintsee':game==='crown-court'?'Crown & Court':game==='crown-chance'?'Crown & Chance':game==='farkle'?'Farkle':game==='dominoes'?'Dominoes':game==='crazy-eights'?'Crazy 8’s':game==='hearts'?'Hearts':'Spades'} · ${tier==='humans'?'online':tier} match win`,{tier}),...await this.crateProgressStatements(id,game,source.split(':').at(-1)!,tier==='humans'?'human':'bot')],result:{already:false,amount}};
    });
  }
  private async crateProgressStatements(id:string,game:string,matchId:string,channel:'human'|'bot'):Promise<D1Statement[]>{
    const collection=crateCollectionForGame(game);if(!collection||!UUID.test(matchId))return[];
    const prefix=`crate-progress-v3:${collection}:${channel}:`,source=`${prefix}${game}:${matchId}`;
    if(await this.prior(id,source))return[];
    const row=await this.first<{n:number}>("SELECT count(*) n FROM economy_ledger WHERE user_id=? AND kind='reward' AND source LIKE ?",id,`${prefix}%`),count=Number(row?.n??0)+(await this.crateCarry(id,collection,channel))+1,required=CRATE_POLICY[channel].wins;
    return [this.ledger(id,source,'reward','points',0,`${REWARD_CRATE_META[collection].name} crate progress · ${count%required||required}/${required}`,{game,channel}),...(count%required===0?[this.ledger(id,`${REWARD_CRATE_META[collection].earned}${game}:${matchId}`,'reward','points',0,`${REWARD_CRATE_META[collection].name} reward crate earned`,{game,channel})]:[])];
  }
  private async crateCarry(id:string,collection:RewardCrateCollection,channel:'human'|'bot'){
    const prefix=`crate-progress:${collection}:${channel}:`,r=await this.first<{n:number}>("SELECT count(*) n FROM economy_ledger WHERE user_id=? AND kind='reward' AND source LIKE ?",id,prefix+'%'),remaining=Number(r?.n??0)%(channel==='human'?3:7);
    if(channel==='human'||!remaining)return remaining;
    const old=await this.rows<{source:string}>(`SELECT json_group_array(json_object('source',source)) data FROM (SELECT source FROM economy_ledger WHERE user_id=? AND kind='reward' AND source LIKE ? ORDER BY created_at DESC,rowid DESC LIMIT ?)`,id,prefix+'%',remaining);let wins=0;for(const row of old){const [game,match]=row.source.slice(prefix.length).split(':');if((await this.prior(id,`${game}:win:${match}`))?.kind==='reward')wins++;}return wins;
  }
  async claimRummyReward(result:MatchReward):Promise<RewardReceipt> {
    const row=await this.first<{payload:string;user_id:string}>('SELECT payload,user_id FROM reward_outbox WHERE match_id=?',result.match_id);
    const tier=rewardTier(result.mode,result.participants), winner=result.participants[result.winner_index]?.user_id;
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner||row.user_id!==winner) throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`rummy:win:${result.match_id}`,paid=await this.creditCard(winner,source,'rummy',tier,WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async claimSpadesReward(result:SpadesMatchReward):Promise<SpadesReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM spades_rewards WHERE match_id=?',result.match_id),tier=spadesRewardTier(result.mode,result.players);
    const winners=spadesWinners(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winners.length) throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    for(const id of winners) await this.snapshot(id);
    const source=`spades:win:${result.match_id}`;
    const existing=await Promise.all(winners.map(id=>this.prior(id,source)));
    // A partially delivered partnership keeps the match's original payout.
    const amount=existing.find(receipt=>receipt!==null&&receipt.amount>0)?.amount??SPADES_POINTS[tier];
    const previous=await Promise.all(winners.map(id=>this.creditCard(id,source,'spades',tier,amount)));
    return {match_id:result.match_id,user_ids:winners,amount,tier,source,already_credited:previous.every(receipt=>receipt.already)};
  }
  async claimCrownCourtReward(result:CrownCourtMatchReward):Promise<CrownCourtReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM crown_court_rewards WHERE match_id=?',result.match_id);
    const tier=crownCourtRewardTier(result.mode,result.players),winner=crownCourtWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`crown-court:win:${result.match_id}`,paid=await this.creditCard(winner,source,'crown-court',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async claimCrownChanceReward(result:CrownChanceMatchReward):Promise<CrownChanceReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM crown_chance_rewards WHERE match_id=?',result.match_id);
    const tier=crownChanceRewardTier(result.mode,result.players),winner=crownChanceWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`crown-chance:win:${result.match_id}`,paid=await this.creditCard(winner,source,'crown-chance',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async claimBackgammonReward(result:BGMatchReward):Promise<BGReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM backgammon_rewards WHERE match_id=?',result.match_id);
    const tier=bgRewardTier(result.mode,result.players),winner=bgWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`backgammon:win:${result.match_id}`,paid=await this.creditCard(winner,source,'backgammon',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async claimCarromReward(result:CarromMatchReward):Promise<CarromReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM carrom_rewards WHERE match_id=?',result.match_id);
    const tier=carromRewardTier(result.mode,result.players),winner=carromWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`carrom:win:${result.match_id}`,paid=await this.creditCard(winner,source,'carrom',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async claimFarkleReward(result:FarkleMatchReward):Promise<FarkleReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM farkle_rewards WHERE match_id=?',result.match_id);
    const tier=farkleRewardTier(result.mode,result.players),winner=farkleWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`farkle:win:${result.match_id}`,paid=await this.creditCard(winner,source,'farkle',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async claimFiveDiceReward(result:FiveDiceMatchReward):Promise<FiveDiceReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM five_dice_rewards WHERE match_id=?',result.match_id);
    const tier=fiveDiceRewardTier(result.mode,result.players),winner=fiveDiceWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`five-dice:win:${result.match_id}`,paid=await this.creditCard(winner,source,'five-dice',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async claimDominoReward(result:DominoMatchReward):Promise<DominoReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM domino_rewards WHERE match_id=?',result.match_id);
    const tier=dominoRewardTier(result.mode,result.players),winner=dominoWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`dominoes:win:${result.match_id}`,paid=await this.creditCard(winner,source,'dominoes',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async syncClassicCardRewards(identity: EconomyIdentity) {
    const id = auth(identity);
    const wins = await this.rows<{matchId:string; game:'crazy-eights'|'hearts'; tier:'normal'|'humans'}>(`
      SELECT json_group_array(json_object('matchId',r.match_id,'game',r.game,'tier',r.tier)) AS data
      FROM classic_card_rewards r WHERE r.user_id=? AND NOT EXISTS (
        SELECT 1 FROM economy_ledger l WHERE l.user_id=r.user_id AND l.source=r.game||':win:'||r.match_id
      )`,id);
    for (const win of wins) await this.creditCard(id,`${win.game}:win:${win.matchId}`,win.game,win.tier,CARD_WIN_POINTS[win.tier]);
  }
  async syncTrustedRewards(identity:EconomyIdentity) {
    const id = auth(identity);
    await this.snapshot(id);
    await this.syncClassicCardRewards(identity);
    // A trusted reward with a tier has already been reconciled. Legacy rows
    // still pass through the claim functions so missing tiers can be repaired.
    const unchecked = (game: string) => `NOT EXISTS (
      SELECT 1 FROM economy_ledger l WHERE l.user_id=? AND l.source='${game}:win:'||r.match_id
      AND l.kind='reward' AND json_extract(l.detail,'$.tier') IN ('easy','normal','hard','humans')
    )`;
    const singleWinner = `json_extract(r.payload,'$.players['||json_extract(r.payload,'$.winner')||'].user_id')=?`;
    const games = [
      { name: 'five-dice', table: 'five_dice_rewards', claim: (payload: string) => {
        const result = parse<FiveDiceMatchReward | null>(payload, null);
        if (result && fiveDiceWinner(result) === id) return this.claimFiveDiceReward(result);
      } },
      { name: 'crown-court', table: 'crown_court_rewards', claim: (payload: string) => {
        const result = parse<CrownCourtMatchReward | null>(payload, null);
        if (result && crownCourtWinner(result) === id) return this.claimCrownCourtReward(result);
      } },
      { name: 'crown-chance', table: 'crown_chance_rewards', claim: (payload: string) => {
        const result = parse<CrownChanceMatchReward | null>(payload, null);
        if (result && crownChanceWinner(result) === id) return this.claimCrownChanceReward(result);
      } },
      { name: 'backgammon', table: 'backgammon_rewards', claim: (payload: string) => {
        const result = parse<BGMatchReward | null>(payload, null);
        if (result && bgWinner(result) === id) return this.claimBackgammonReward(result);
      } },
      { name: 'carrom', table: 'carrom_rewards', claim: (payload: string) => {
        const result = parse<CarromMatchReward | null>(payload, null);
        if (result && carromWinner(result) === id) return this.claimCarromReward(result);
      } },
      { name: 'farkle', table: 'farkle_rewards', claim: (payload: string) => {
        const result = parse<FarkleMatchReward | null>(payload, null);
        if (result && farkleWinner(result) === id) return this.claimFarkleReward(result);
      } },
      { name: 'dominoes', table: 'domino_rewards', claim: (payload: string) => {
        const result = parse<DominoMatchReward | null>(payload, null);
        if (result && dominoWinner(result) === id) return this.claimDominoReward(result);
      } },
    ];
    const spadesWinner = `EXISTS(SELECT 1 FROM json_each(r.payload,'$.players') p
      WHERE json_extract(p.value,'$.user_id')=? AND json_extract(p.value,'$.bot')=0
      AND CASE WHEN json_extract(r.payload,'$.variant')='teams' THEN CAST(p.key AS INTEGER)%2 ELSE CAST(p.key AS INTEGER) END=json_extract(r.payload,'$.winner'))`;
    const queries = [
      `SELECT 'rummy' AS game, r.payload FROM reward_outbox r WHERE r.user_id=? AND ${unchecked('rummy')}`,
      `SELECT 'spades' AS game, r.payload FROM spades_rewards r WHERE ${spadesWinner} AND ${unchecked('spades')}`,
      ...games.map(({ name, table }) => `SELECT '${name}' AS game, r.payload FROM ${table} r WHERE ${singleWinner} AND ${unchecked(name)}`),
    ];
    const pending = await readJsonGroups<{game:string;payload:string}>(this.binding, queries.map(query => ({
      sql: `SELECT json_group_array(json_object('game',game,'payload',payload)) FROM (${query})`,
      values: [id, id],
    })));
    for (const { game, payload } of pending) {
      if (game === 'rummy') {
        const result = parse<MatchReward | null>(payload, null);
        if (result) await this.claimRummyReward(result);
      } else if (game === 'spades') {
        const result = parse<SpadesMatchReward | null>(payload, null);
        if (!result) continue;
        const tier = spadesRewardTier(result.mode, result.players);
        const winners = spadesWinners(result);
        if (!tier || !winners.includes(id)) continue;
        const source = `spades:win:${result.match_id}`;
        const existing = await Promise.all(winners.map(winner => this.prior(winner, source)));
        await this.creditCard(id, source, 'spades', tier, existing.find(receipt => receipt !== null && receipt.amount > 0)?.amount ?? SPADES_POINTS[tier]);
      } else {
        await games.find(entry => entry.name === game)?.claim(payload);
      }
    }
  }
  private async stats(id: string, wallet: EconomyWallet, progress?: EconomyView['progress']): Promise<EconomyStats> {
    const counts=await this.first<Record<string,number>>(`SELECT
      (SELECT count(*) FROM economy_progress WHERE user_id=? AND game='faith-3') faithLevels,
      ((SELECT count(*) FROM economy_progress WHERE user_id=? AND game='3-gems') + (SELECT count(*) FROM gems_extended_progress WHERE user_id=?)) gemsLevels,
      ((SELECT coalesce(sum(stars),0) FROM economy_progress WHERE user_id=? AND game='3-gems') + (SELECT coalesce(sum(stars),0) FROM gems_extended_progress WHERE user_id=?)) gemsStars,
      (SELECT count(*) FROM economy_ledger WHERE user_id=? AND source LIKE 'rummy:win:%') rummyWins,
      (SELECT count(*) FROM economy_ledger WHERE user_id=? AND source LIKE 'rummy:win:%' AND json_extract(detail,'$.tier')='humans') rummyHumanWins,
      (SELECT count(*) FROM economy_ledger WHERE user_id=? AND source LIKE 'rummy:win:%' AND json_extract(detail,'$.tier')='hard') rummyHardWins,
      (SELECT count(*) FROM economy_ledger WHERE user_id=? AND source LIKE 'spades:win:%') spadesWins,
      (SELECT count(*) FROM economy_ledger WHERE user_id=? AND source LIKE 'spades:win:%' AND json_extract(detail,'$.tier')='humans') spadesHumanWins,
      (SELECT count(*) FROM economy_ledger WHERE user_id=? AND source LIKE 'spades:win:%' AND json_extract(detail,'$.tier')='hard') spadesHardWins,
      (SELECT count(*) FROM social_friends WHERE (low_id=? OR high_id=?) AND status='accepted') friends,
      (SELECT count(*) FROM economy_visits WHERE user_id=?) visits,
      (SELECT CASE WHEN gamer_name NOT LIKE 'player\\_%' ESCAPE '\\' AND length(trim(bio))>0 AND name_flagged=0 THEN 1 ELSE 0 END FROM social_profiles WHERE user_id=?) profileComplete`,id,id,id,id,id,id,id,id,id,id,id,id,id,id,id);
    const row=await this.first<{created_at:number}>('SELECT created_at FROM economy_wallets WHERE user_id=?',id);
    if (!progress) await this.syncClassicCardRewards({ principal: `member:${id}` });
    const [faith, gems] = progress ? [progress['faith-3'], progress['3-gems']] : await Promise.all([this.readPuzzleProgress(id, 'faith-3'), this.readPuzzleProgress(id, '3-gems')]);
    const chapters=(levels:number[],size:number,max:number)=>Array.from({length:max/size},(_,chapter)=>Array.from({length:size},(_,n)=>chapter*size+n+1).every(level=>levels.includes(level))).filter(Boolean).length;
    const result:EconomyStats={faithLevels:0,faithChapters:chapters(faith.levels,20,280),gemsLevels:0,gemsStars:0,gemsChapters:chapters(gems.levels,50,GEMS_LEVEL_COUNT),rummyWins:0,rummyHumanWins:0,rummyHardWins:0,spadesWins:0,spadesHumanWins:0,spadesHardWins:0,diceWins:0,diceHumanWins:0,diceHardWins:0,dominoWins:0,dominoHumanWins:0,dominoHardWins:0,farkleWins:0,farkleHumanWins:0,farkleHardWins:0,crownWins:0,crownHumanWins:0,crownHardWins:0,chanceWins:0,chanceHumanWins:0,chanceHardWins:0,eightsWins:0,eightsHumanWins:0,heartsWins:0,heartsHumanWins:0,carromWins:0,carromHumanWins:0,carromHardWins:0,backgammonWins:0,backgammonHumanWins:0,backgammonHardWins:0,lifetime:wallet.lifetime_points,cosmetics:wallet.owned.filter(id=>ECONOMY_CATALOG.some(item=>item.id===id&&item.slot!==null)).length,friends:0,memberDays:Math.max(0,Math.floor((this.now()-(row?.created_at??this.now()))/86400000)),visits:0,profileComplete:0,gamesPlayed:0};
    for(const key of Object.keys(counts??{}) as (keyof EconomyStats)[])result[key]=Number(counts?.[key]??0);
    const winGroups = {
      'five-dice': 'dice', 'crown-court': 'crown', 'crown-chance': 'chance',
      backgammon: 'backgammon', carrom: 'carrom', farkle: 'farkle',
      dominoes: 'domino', 'crazy-eights': 'eights', hearts: 'hearts',
    } as const;
    const wins = await this.rows<{ game: keyof typeof winGroups; total: number; online: number; hard: number }>(`
      SELECT json_group_array(json_object('game',game,'total',total,'online',online,'hard',hard)) AS data
      FROM (
        SELECT substr(source,1,instr(source,':')-1) AS game, count(*) AS total,
          coalesce(sum(json_extract(detail,'$.tier')='humans'),0) AS online,
          coalesce(sum(json_extract(detail,'$.tier')='hard'),0) AS hard
        FROM economy_ledger
        WHERE user_id=? AND substr(source,instr(source,':'),5)=':win:'
        GROUP BY game
      )`, id);
    for (const win of wins) {
      if (!Object.hasOwn(winGroups, win.game)) continue;
      const group = winGroups[win.game];
      result[`${group}Wins`] = win.total;
      result[`${group}HumanWins`] = win.online;
      if (group !== 'eights' && group !== 'hearts') result[`${group}HardWins`] = win.hard;
    }
    const earned=await this.first<{n:number}>('SELECT count(*) AS n FROM reward_outbox WHERE user_id=?',id);
    const cosmetics=new Set(wallet.owned.filter(id=>ECONOMY_CATALOG.some(item=>item.id===id&&item.slot!==null)));
    for(const design of RUMMY_DESIGNS)if(design.wins>0&&design.wins<=Number(earned?.n??0))cosmetics.add(design.id);
    result.cosmetics=cosmetics.size;
    result.gamesPlayed=[result.carromWins,result.faithLevels,result.gemsLevels,result.rummyWins,result.spadesWins,result.diceWins,result.farkleWins,result.backgammonWins,result.crownWins,result.chanceWins,result.dominoWins,result.eightsWins,result.heartsWins].filter(n=>n>0).length;
    return result;
  }
  private async badgeViews(id:string,stats:EconomyStats) {
    const claimed=await this.rows<{source:string;amount:number;createdAt:number}>(`SELECT json_group_array(json_object('source',source,'amount',amount,'createdAt',created_at)) AS data FROM economy_ledger WHERE user_id=? AND (source LIKE 'badge:%' OR source LIKE 'badge-cash:%')`,id);
    return ACHIEVEMENTS.map(item=>{
      const receipt=claimed.find(row=>row.source===`badge:${item.id}`),cash=claimed.find(row=>row.source===`badge-cash:${item.id}`);
      return {...item,reward:receipt?.amount??item.reward,cashReward:receipt?(item.currency==='points'?receipt.amount:cash?.amount??legacyGameAchievementCash(receipt.amount)):item.cashReward,progress:Math.min(item.goal,stats[item.stat]),unlocked:stats[item.stat]>=item.goal,claimed:Boolean(receipt),claimedAt:receipt?.createdAt??null};
    });
  }
  private async syncAchievementCash(identity:EconomyIdentity) {
    const id=auth(identity);
    const claimed=await this.rows<{source:string;amount:number;cashReward:number|null}>("SELECT json_group_array(json_object('source',source,'amount',amount,'cashReward',json_extract(detail,'$.cashReward'))) AS data FROM economy_ledger WHERE user_id=? AND source LIKE 'badge:%'",id);
    for(const row of claimed) {
      const badge=ACHIEVEMENTS.find(item=>`badge:${item.id}`===row.source);
      if(!badge||badge.currency==='points')continue;
      const cashReward=typeof row.cashReward==='number'?row.cashReward:legacyGameAchievementCash(row.amount);
      await this.transact(id,async({wallet})=>{
        const source=`badge-cash:${badge.id}`;
        if(await this.prior(id,source))return {result:undefined};
        return {wallet:{...wallet,points:wallet.points+cashReward,lifetime_points:wallet.lifetime_points+cashReward},statements:[this.ledger(id,source,'achievement','points',cashReward,`${badge.name} · Cash bonus`,{achievementId:badge.id})],result:undefined};
      });
    }
  }
  async pendingAllowances() {
    return this.rows<{id:string;userId:string;targetCash:number}>("SELECT json_group_array(json_object('id',id,'userId',user_id,'targetCash',target_cash)) AS data FROM (SELECT id,user_id,target_cash FROM economy_allowances WHERE applied_at IS NULL ORDER BY created_at,id LIMIT 10)");
  }
  async hasPendingAllowance(identity:EconomyIdentity) {
    return Boolean(await this.first('SELECT id FROM economy_allowances WHERE user_id=? AND applied_at IS NULL LIMIT 1',auth(identity)));
  }
  private async applyAllowances(identity:EconomyIdentity) {
    const id=auth(identity);
    const rows=await this.rows<{id:string;targetCash:number;reason:string}>("SELECT json_group_array(json_object('id',id,'targetCash',target_cash,'reason',reason)) AS data FROM (SELECT * FROM economy_allowances WHERE user_id=? AND applied_at IS NULL ORDER BY created_at,id)",id);
    for(const allowance of rows)await this.transact(id,async({wallet})=>{
      const source=`allowance:${allowance.id}`;
      if(await this.prior(id,source))return {result:undefined};
      const delta=allowance.targetCash-wallet.points;
      return {wallet:{...wallet,points:allowance.targetCash},statements:[this.ledger(id,source,'reward','points',delta,`${allowance.reason} · balance set to ${allowance.targetCash.toLocaleString()}`,{targetCash:allowance.targetCash}),this.stmt('UPDATE economy_allowances SET applied_at=? WHERE id=? AND user_id=? AND applied_at IS NULL',this.now(),allowance.id,id)],result:undefined};
    });
  }
  async readWallet(identity: EconomyIdentity): Promise<EconomyWallet> {
    const id = auth(identity);
    await this.syncTrustedRewards(identity);
    await this.stmt('INSERT OR IGNORE INTO economy_visits(user_id,day) VALUES(?,?)', id, new Date(this.now()).toISOString().slice(0,10)).run();
    await this.syncAchievementCash(identity);
    await this.applyAllowances(identity);
    return this.wallet(identity);
  }
  async read(identity: EconomyIdentity): Promise<EconomyView> {
    const id = auth(identity), wallet = await this.readWallet(identity);
    const [sources, history, faith, gems] = await Promise.all([
      this.rows<{source:string;tier:string|null}>(`SELECT json_group_array(json_object('source',source,'tier',json_extract(detail,'$.tier'))) AS data FROM (SELECT source,detail FROM economy_ledger WHERE user_id=? AND kind IN ('legacy','reward','achievement') AND source<>'legacy:shared-playing-decks' ORDER BY created_at DESC LIMIT 10000)`, id),
      this.rows<EconomyHistory>(`SELECT json_group_array(json_object('id',id,'source',source,'kind',kind,'currency',currency,'amount',amount,'cash',cash,'label',label,'createdAt',created_at)) AS data FROM (SELECT * FROM economy_ledger WHERE user_id=? AND source<>'legacy:shared-playing-decks' ORDER BY created_at DESC,id DESC LIMIT 50)`, id),
      this.readPuzzleProgress(id, 'faith-3'),
      this.readPuzzleProgress(id, '3-gems'),
    ]);
    const progress = { 'faith-3': faith, '3-gems': gems };
    const stats = await this.stats(id, wallet, progress);
    const collections = Object.keys(REWARD_CRATE_POOLS) as RewardCrateCollection[];
    const crates = await Promise.all(collections.map(async kind => [kind, await this.diceCrates(id, kind)] as const));
    const rewardCrates = Object.fromEntries(crates) as Record<RewardCrateCollection, DiceCrateView>;
    return {
      rewardCrates, diceCrates: rewardCrates.dice, wallet, sources: sources.map(item => item.source),
      humanWinSources: sources.filter(item => item.tier === 'humans' && item.source.startsWith('rummy:win:')).map(item => item.source),
      stats, achievements: await this.badgeViews(id, stats),
      history: history.map(item => ({ ...item, label: item.source.startsWith('five-dice:') ? item.label.replace(/\bFarkle\b/g, 'Quintsee') : item.label })),
      progress, conversionRate: CONVERSION_RATE,
    };
  }
  private async diceFragments(id:string,collection:RewardCrateCollection='dice'):Promise<Record<string,number>> {
    const pool=REWARD_CRATE_POOLS[collection],prefix=REWARD_CRATE_META[collection].opened;
    const rows=await this.rows<{itemId:string;n:number}>(`SELECT json_group_array(json_object('itemId',item_id,'n',n)) AS data FROM (SELECT coalesce(json_extract(detail,'$.crate.itemId'),json_extract(detail,'$.fragmentItem')) AS item_id,sum(coalesce(json_extract(detail,'$.fragmentCount'),1)) AS n FROM economy_ledger WHERE user_id=? AND ((kind='reward' AND (source LIKE ? OR json_extract(detail,'$.crate.itemId') IN ('card-deck-four-nations','card-deck-rome'))) OR (kind='purchase' AND source LIKE 'fragment-buy:%')) GROUP BY item_id)`,id,`${prefix}%`);
    return Object.fromEntries(rows.filter(row=>pool.some(d=>d.id===row.itemId)).map(row=>[row.itemId,Number(row.n)]));
  }
  private async diceCrates(id:string,collection:RewardCrateCollection='dice'):Promise<DiceCrateView> {
    const meta=REWARD_CRATE_META[collection],start=meta.earned.length+1;
    const available=await this.rows<DiceCrateView['available'][number]>(`SELECT json_group_array(json_object('id',substr(source,${start}),'game',json_extract(detail,'$.game'),'earnedAt',created_at)) AS data FROM (SELECT * FROM economy_ledger e WHERE user_id=? AND kind='reward' AND source LIKE ? AND NOT EXISTS(SELECT 1 FROM economy_ledger o WHERE o.user_id=e.user_id AND o.source=?||substr(e.source,${start})) ORDER BY created_at,source LIMIT 20)`,id,`${meta.earned}%`,meta.opened);
    const counts=await this.first<{earned:number;opened:number}>(`SELECT coalesce(sum(CASE WHEN source LIKE ? THEN 1 ELSE 0 END),0) AS earned,coalesce(sum(CASE WHEN source LIKE ? THEN 1 ELSE 0 END),0) AS opened FROM economy_ledger WHERE user_id=? AND kind='reward'`,`${meta.earned}%`,`${meta.opened}%`,id);
    const recent=await this.rows<DiceCrateReward>(`SELECT json_group_array(json_extract(detail,'$.crate')) AS data FROM (SELECT detail FROM economy_ledger WHERE user_id=? AND kind='reward' AND source LIKE ? ORDER BY created_at DESC,rowid DESC LIMIT 5)`,id,`${meta.opened}%`);
    const countsProgress=await this.first<{humanWins:number;computerWins:number}>(`SELECT coalesce(sum(CASE WHEN source LIKE ? THEN 1 ELSE 0 END),0) humanWins,coalesce(sum(CASE WHEN source LIKE ? THEN 1 ELSE 0 END),0) computerWins FROM economy_ledger WHERE user_id=? AND kind='reward'`, `crate-progress-v3:${collection}:human:%`,`crate-progress-v3:${collection}:bot:%`,id);
    return {progress:{humanWins:(Number(countsProgress?.humanWins??0)+await this.crateCarry(id,collection,'human'))%6,computerWins:(Number(countsProgress?.computerWins??0)+await this.crateCarry(id,collection,'bot'))%9},unopened:Math.max(0,Number(counts?.earned??0)-Number(counts?.opened??0)),totalEarned:Number(counts?.earned??0),available,fragments:await this.diceFragments(id,collection),recent};
  }
  private async openDiceCrate(id:string,crateId:string,collection:RewardCrateCollection='dice'):Promise<EconomyReceipt> {
    if(!/^(carrom|backgammon|five-dice|farkle|dominoes|rummy|spades|hearts|crazy-eights|crown-court|crown-chance):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(crateId)||crateCollectionForGame(crateId.split(':')[0].toLowerCase())!==collection)throw new RummyError('Choose one of your earned crates.');
    crateId=crateId.toLowerCase();const meta=REWARD_CRATE_META[collection],catalog=REWARD_CRATE_POOLS[collection];
    return this.transact(id,async({wallet})=>{
      const source=`${meta.opened}${crateId}`,prior=await this.prior(id,source);
      if(prior){if(prior.kind!=='reward')throw new RummyError('This crate has no valid opening receipt.',409,'crate_receipt_invalid');const receipt=parse<EconomyReceipt>(prior.detail,{type:'dice_crate',alreadyApplied:true});return {result:{...receipt,alreadyApplied:true}};}
      const grant=await this.prior(id,`${meta.earned}${crateId}`);
      if(!grant||grant.kind!=='reward'||grant.amount!==0||parse<{game?:string}>(grant.detail,{}).game!==crateId.split(':')[0])throw new RummyError('This crate is not available in your rewards.',404,'crate_not_earned');
      const fragments=await this.diceFragments(id,collection),unowned=catalog.filter(d=>!wallet.owned.includes(d.id));
      const pool=unowned.length?unowned:catalog,design=pool[this.random(pool.length)]!;
      const grantDetail=parse<{channel?:'human'|'bot'}>(grant.detail,{}),priorWin=grantDetail.channel?null:await this.prior(id,`${crateId.split(':')[0]}:win:${crateId.split(':')[1]}`),channel=grantDetail.channel??(parse<{tier?:string}>(priorWin?.detail??'{}',{}).tier==='humans'?'human':'bot');
      const {min,max}=CRATE_POLICY[channel];
      const cash=min+this.random(max-min+1),count=(fragments[design.id]??0)+1;
      const spare=wallet.owned.includes(design.id),unlocked=!spare&&count>=DICE_FRAGMENTS_REQUIRED;
      const crate:DiceCrateReward={crateId,channel,cash,itemId:design.id,fragments:count,unlocked,spare};
      const receipt:EconomyReceipt={type:'dice_crate',alreadyApplied:false,cash,itemId:design.id,crate};
      return {wallet:{...wallet,points:wallet.points+cash,lifetime_points:wallet.lifetime_points+cash,owned:unlocked?[...wallet.owned,design.id]:wallet.owned},statements:[...await new CollectiblesStore(this.binding,this.now,this.random).cratePlan(id,crateId),this.ledger(id,source,'reward','points',cash,`${meta.name} crate · ${design.name} ${spare?'spare fragment':unlocked?'unlocked':`${count}/3 fragment`}`,receipt)],result:receipt};
    });
  }
  async publicProfile(identity:EconomyIdentity,target:string) {
    const viewer=auth(identity);
    if(!UUID.test(target))throw new RummyError('Invalid player link.');target=target.toLowerCase();
    const profile=await this.first('SELECT user_id FROM social_profiles WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM social_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))',target,viewer,target,target,viewer);
    if(!profile)throw new RummyError('Player profile not found.',404,'not_found');
    if(!await this.first('SELECT user_id FROM economy_wallets WHERE user_id=?',target))return {userId:target,lifetimePoints:0,badges:[],achievements:[]};
    const wallet=await this.wallet({principal:`member:${target}`}),stats=await this.stats(target,wallet),badges=(await this.badgeViews(target,stats)).filter(b=>b.claimed);
    return {userId:target,lifetimePoints:wallet.lifetime_points,badges,achievements:badges,stats};
  }
  async command(identity:EconomyIdentity,input:unknown):Promise<EconomyCommandResult> {
    const id=auth(identity);await this.wallet(identity);
    if(await this.hasPendingAllowance(identity))await this.readWallet(identity);
    if(!input||typeof input!=='object'||Array.isArray(input))throw new RummyError('Choose a points or rewards action.');
    const value=input as Record<string,unknown>;let receipt:EconomyReceipt;
    if(value.operation==='buy_fragments'){
      const { itemId, count, payment, requestId, game, expectedPrice } = value;
      const collection = (Object.keys(REWARD_CRATE_POOLS) as RewardCrateCollection[])
        .find(kind => REWARD_CRATE_POOLS[kind].some(design => design.id === itemId));
      const item = ECONOMY_CATALOG.find(design => design.id === itemId);
      if (!collection || !item || typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > DICE_FRAGMENTS_REQUIRED ||
        (payment !== 'game' && payment !== 'cash') || typeof requestId !== 'string' || !UUID.test(requestId) ||
        (expectedPrice !== undefined && !safe(expectedPrice))) {
        throw new RummyError('Choose one collectible fragment.');
      }
      if (game !== undefined && (!isSharedDeck(item.id) || (game !== 'rummy' && game !== 'spades'))) {
        throw new RummyError('Choose a compatible card-game balance.');
      }
      const currency = payment === 'cash' ? 'points' : game === 'spades' ? 'spades_points' : item.currency;
      const source = `fragment-buy:${requestId.toLowerCase()}`;
      receipt = await this.transact<EconomyReceipt>(id, async ({ wallet }) => {
        const prior = await this.prior(id, source);
        if (prior) {
          const detail = parse<Partial<EconomyReceipt> & { fragmentItem?: string; fragmentCount?: number }>(prior.detail, {});
          if (detail.type !== 'purchase' || detail.fragmentItem !== item.id || detail.fragmentCount !== count ||
            detail.currency !== currency || (expectedPrice !== undefined && detail.amount !== expectedPrice)) {
            throw new RummyError('This purchase ID belongs to another purchase.', 409, 'request_reused');
          }
          return { result: { ...detail, type: 'purchase', alreadyApplied: true } };
        }
        // Old bulk purchase receipts remain retryable, but every new purchase buys one fragment.
        if (count !== 1) throw new RummyError('Fragments are sold one at a time.');
        const fragments = await this.diceFragments(id, collection);
        const before = fragments[item.id] ?? 0;
        if (wallet.owned.includes(item.id) || before >= DICE_FRAGMENTS_REQUIRED) {
          throw new RummyError('You already own this set.', 409, 'already_owned');
        }
        const amount = fragmentPrice(item, payment, before);
        if (expectedPrice !== undefined && expectedPrice !== amount) {
          throw new RummyError('Your fragment progress changed. Review the updated price and try again.', 409, 'fragment_price_changed');
        }
        if (wallet[currency] < amount) throw new RummyError('Not enough points or Clubhouse Cash for this fragment.', 409, 'insufficient_points');
        const result = { type: 'purchase' as const, alreadyApplied: false, itemId: item.id, amount, currency, fragmentItem: item.id, fragmentCount: 1 };
        const owned = before + 1 === DICE_FRAGMENTS_REQUIRED ? [...wallet.owned, item.id] : wallet.owned;
        return {
          wallet: { ...wallet, [currency]: wallet[currency] - amount, owned },
          statements: [this.ledger(id, source, 'purchase', currency, -amount, `${item.name} · 1 fragment`, result)],
          result,
        };
      });
    } else if(value.operation==='open_reward_crate') {
      if(Object.keys(value).length!==3||typeof value.crateId!=='string'||typeof value.collection!=='string'||!Object.hasOwn(REWARD_CRATE_POOLS,value.collection))throw new RummyError('Choose one earned reward crate.');
      receipt=await this.openDiceCrate(id,value.crateId,value.collection as RewardCrateCollection);
    } else if(value.operation==='open_dice_crate') {
      if(Object.keys(value).length!==2||typeof value.crateId!=='string')throw new RummyError('Choose one earned dice crate.');
      receipt=await this.openDiceCrate(id,value.crateId);
    } else if(value.operation==='convert') {
      const game=value.game as PointGame,amount=value.amount,requestId=value.requestId;
      if(!POINT_GAMES.includes(game)||typeof amount!=='number'||!safe(amount)||amount<=0||typeof requestId!=='string'||!UUID.test(requestId))throw new RummyError('Convert a positive multiple of 13 game points.');
      const currency=POINT_FIELDS[game],cash=Math.floor(amount/CONVERSION_RATE.points)*CONVERSION_RATE.cash,source=`convert:${requestId.toLowerCase()}`;
      receipt=await this.transact(id,async({wallet})=>{
        const prior=await this.prior(id,source);
        if(prior){const detail=parse<{game:string;amount:number}>(prior.detail,{game:'',amount:0});if(detail.game!==game||detail.amount!==amount)throw new RummyError('That conversion ID already belongs to another conversion.',409,'request_reused');return {result:{type:'conversion',alreadyApplied:true,amount,cash:prior.cash,currency} as EconomyReceipt};}
        if(amount%CONVERSION_RATE.points!==0)throw new RummyError('Convert a positive multiple of 13 game points.');
        if(wallet[currency]<amount)throw new RummyError('Not enough game points for this conversion.',409,'insufficient_points');
        return {wallet:{...wallet,[currency]:wallet[currency]-amount,points:wallet.points+cash},statements:[this.ledger(id,source,'conversion',currency,-amount,`${game==='faith-3'?'Faith 3':game==='3-gems'?'3 Gems':game==='rummy'?'Rummy+':game==='five-dice'?'Dice':game==='dominoes'?'Dominoes':'Spades'} points converted to Clubhouse Cash`,{game,amount},cash)],result:{type:'conversion',alreadyApplied:false,amount,cash,currency} as EconomyReceipt};
      });
    } else if(value.operation==='claim_achievement') {
      const item=ACHIEVEMENTS.find(a=>a.id===value.achievementId);if(!item)throw new RummyError('Choose an available achievement.');
      receipt=await this.transact(id,async({wallet})=>{
        const prior=await this.prior(id,`badge:${item.id}`);
        if(prior){const cash=await this.prior(id,`badge-cash:${item.id}`);return {result:{type:'achievement',alreadyApplied:true,achievementId:item.id,amount:prior.amount,currency:item.currency,cash:item.currency==='points'?0:cash?.amount??parse<{cashReward?:number}>(prior.detail,{}).cashReward??legacyGameAchievementCash(prior.amount)} as EconomyReceipt};}
        const stats=await this.stats(id,wallet);
        if(stats[item.stat]<item.goal)throw new RummyError('This achievement is still in progress.',409,'achievement_locked');
        const cashBonus=item.currency==='points'?0:item.cashReward;
        return {wallet:{...wallet,[item.currency]:wallet[item.currency]+item.reward,points:wallet.points+(item.currency==='points'?item.reward:cashBonus),lifetime_points:wallet.lifetime_points+item.reward+cashBonus},statements:[this.ledger(id,`badge:${item.id}`,'achievement',item.currency,item.reward,item.name,{group:item.group,cashReward:cashBonus}),...(cashBonus?[this.ledger(id,`badge-cash:${item.id}`,'achievement','points',cashBonus,`${item.name} · Cash bonus`,{achievementId:item.id})]:[])],result:{type:'achievement',alreadyApplied:false,achievementId:item.id,amount:item.reward,currency:item.currency,cash:item.currency==='points'?0:item.cashReward} as EconomyReceipt};
      });
    } else if(value.operation==='purchase') {
      const item=ECONOMY_CATALOG.find(item=>item.id===value.itemId);if(!item)throw new RummyError('This store item is unavailable.');
      if(value.payment!==undefined&&value.payment!=='game'&&value.payment!=='cash')throw new RummyError('Choose game points or Clubhouse Cash.');
      const selectable = storePointSources(item);
      if(value.game!==undefined&&!selectable.includes(value.game as PointGame))throw new RummyError('Choose a supported game for this unlock.');
      const currency=value.payment==='cash'?'points':value.game?POINT_FIELDS[value.game as PointGame]:item.currency,price=value.payment==='cash'?item.cashPrice:item.price;
      receipt=await this.transact(id,async({wallet})=>{
        if(wallet.owned.includes(item.id) || (isSharedTable(item) && ownsCardTable(wallet.owned, item.id)))return {result:{type:'purchase',alreadyApplied:true,itemId:item.id,amount:price,currency} as EconomyReceipt};
        const bundle=collectionBundle(item.id);
        if(bundle&&bundle.items.every(id=>wallet.owned.includes(id)))return {wallet:{...wallet,owned:[...wallet.owned,item.id]},result:{type:'purchase',alreadyApplied:true,itemId:item.id,amount:price,currency} as EconomyReceipt};
        const design=RUMMY_DESIGNS.find(design=>design.id===item.id);
        const wins=design?await this.first<{n:number}>('SELECT count(*) AS n FROM reward_outbox WHERE user_id=?',id):null;
        if(design&&!design.purchaseOnly&&Number(wins?.n??0)>=design.wins)return {wallet:{...wallet,owned:[...wallet.owned,item.id]},result:{type:'purchase',alreadyApplied:true,itemId:item.id,amount:price,currency} as EconomyReceipt};
        if(wallet[currency]<price)throw new RummyError('Not enough points or Clubhouse Cash for this item.',409,'insufficient_points');
        return {wallet:{...wallet,[currency]:wallet[currency]-price,owned:[...new Set([...wallet.owned,item.id,...(bundle?.items??[])])]},statements:[this.ledger(id,`purchase:${item.id}`,'purchase',currency,-price,item.name)],result:{type:'purchase',alreadyApplied:false,itemId:item.id,amount:price,currency} as EconomyReceipt};
      });
    } else if(value.operation==='equip') {
      const slot=typeof value.slot==='string'?value.slot:'',itemId=typeof value.itemId==='string'?(slot==='spades_table'?canonicalCardTable(value.itemId):value.itemId):'',defaults:Record<string,string>={poker_dice:'poker-dice-ivory',[CARROM_STRIKER_SLOT]:CLASSIC_CARROM_STRIKER.id,[CARROM_BOARD_SLOT]:CLASSIC_CARROM_BOARD.id,[CARROM_PUCK_SLOT]:CLASSIC_CARROM_PUCKS.id,[D6_DICE_SLOT]:CLASSIC_D6_DICE.id,domino_skin:'domino-skin-classic',bg_board:'bg-board-classic',bg_checkers:'bg-checkers-classic',farkle_dice:'farkle-dice-classic',faith3_skin:'faith3-classic',spades_table:'spades-table-classic',spades_deck:'spades-deck-classic'};
      if(!Object.hasOwn(defaults,slot))throw new RummyError('Choose a valid collection slot.');
      const item=ECONOMY_CATALOG.find(item=>item.id===itemId&&(item.slot===slot||(slot==='spades_table'&&item.slot==='rummy_table')||(slot==='spades_deck'&&item.slot==='card_deck')||(slot==='farkle_dice'&&item.slot===D6_DICE_SLOT)));
      if(!item&&defaults[slot]!==itemId&&!(slot==='spades_table'&&itemId==='rummy-table-classic')&&!(slot===DOMINO_SKIN_SLOT&&DOMINO_INCLUDED_SKINS.some(skin=>skin.id===itemId)))throw new RummyError('That design does not belong in this slot.');
      receipt=await this.transact(id,async({wallet})=>{
        const milestone = slot === 'spades_table' ? RUMMY_TABLE_SURFACES.find(table => table.id === itemId) : undefined;
        const wins = milestone ? await this.first<{n:number}>('SELECT count(*) AS n FROM reward_outbox WHERE user_id=?', id) : null;
        const owned = slot === 'spades_table' ? ownsCardTable(wallet.owned, itemId) || Boolean(milestone && Number(wins?.n ?? 0) >= milestone.wins) : wallet.owned.includes(itemId);
        if(item&&!owned)throw new RummyError('Collect this design before equipping it.',403,'not_owned');
        if(wallet.equipped[slot]===itemId&&(!(slot===D6_DICE_SLOT||slot==='farkle_dice')||wallet.equipped[D6_DICE_SLOT]===itemId&&wallet.equipped.farkle_dice===itemId))return {result:{type:'equip',alreadyApplied:true,itemId} as EconomyReceipt};
        return {wallet:{...wallet,equipped:{...wallet.equipped,[slot]:itemId,...(slot===D6_DICE_SLOT||slot==='farkle_dice'?{[D6_DICE_SLOT]:itemId,farkle_dice:itemId}:{})}},result:{type:'equip',alreadyApplied:false,itemId} as EconomyReceipt};
      });
    } else if(value.operation==='check_in') {
      const day=new Date(this.now()).toISOString().slice(0,10),prior=await this.first('SELECT day FROM economy_visits WHERE user_id=? AND day=?',id,day);
      await this.stmt('INSERT OR IGNORE INTO economy_visits(user_id,day) VALUES(?,?)',id,day).run();receipt={type:'check_in',alreadyApplied:Boolean(prior)};
    } else throw new RummyError('Choose a valid points or rewards action.');
    return {ok:true,...await this.read(identity),receipt};
  }
}
