import { fiveDiceRewardTier, fiveDiceWinner, type FiveDiceMatchReward, type FiveDiceReceipt } from '../src/lib/five-dice-rewards';
import { CARD_WIN_POINTS } from '../src/lib/reward-rates';
import { gameAchievementCash } from '../src/lib/reward-rates';
import { LEGACY_CUSTOM_PROFILE_IMAGE, PROFILE_IMAGE_SHAPES, customProfileImage, isProfileFrameItem, profileFrameItem, profileFrameName } from '../src/lib/profile-image';
import { randomUUID } from 'node:crypto';
import type { D1Binding, D1Statement } from './database';
import { RummyError } from '../src/lib/rummy-protocol';
import { memberId, rewardTier, type MatchReward, type RewardReceipt } from '../src/lib/rummy-rewards';
import { spadesRewardTier, spadesWinners, type SpadesMatchReward, type SpadesReceipt } from '../src/lib/spades-rewards';
import { WIN_POINTS } from '../src/lib/rummy';
import { SPADES_POINTS } from '../src/lib/spades';
import { RUMMY_DESIGNS } from '../src/lib/rummy-cosmetics';
import { canonicalDeckId, isSharedDeck, LEGACY_DECK_WINS } from '../src/lib/playing-decks';
import { ACHIEVEMENTS } from '../src/lib/achievement-catalog';
import { GEMS_LEVEL_COUNT } from '../src/lib/gems-levels';
import { CONVERSION_RATE, ECONOMY_CATALOG, POINT_FIELDS, POINT_GAMES, puzzleLevelPoints, type Currency, type EconomyWallet, type EconomyView, type EconomyStats, type EconomyHistory, type EconomyCommandResult, type EconomyReceipt, type PointGame, type PuzzleProgress } from '../src/lib/economy-protocol';

export interface EconomyIdentity { principal: string }
export interface LegacyEconomy { wallet: Partial<EconomyWallet> | null; awards: { source: string; amount?: number; rummy_tier?: string | null; created_at?: string | number }[]; joinedAt?: string | number }
interface WalletRow { user_id: string; points: number; f3_points: number; gems_points: number; rummy_points: number; spades_points: number; dice_points: number; lifetime_points: number; owned: string; equipped: string; pending_perks: string; revision: number; import_token: string; created_at: number; updated_at: number }
interface Snapshot { row: WalletRow; wallet: EconomyWallet }
interface Plan<T> { wallet?: EconomyWallet; statements?: D1Statement[]; result: T }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const safe = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 2_000_000_000;
const currencyForSource = (source: string): Currency => source.startsWith('faith3:') ? 'f3_points' : source.startsWith('gems:') ? 'gems_points' : source.startsWith('rummy:win:') ? 'rummy_points' : source.startsWith('spades:win:') ? 'spades_points' : source.startsWith('five-dice:win:') ? 'dice_points' : 'points';
const empty = (): EconomyWallet => ({ points: 0, f3_points: 0, gems_points: 0, rummy_points: 0, spades_points: 0, dice_points: 0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {} });
const parse = <T>(value: string, fallback: T): T => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const fromRow = (r: WalletRow): EconomyWallet => ({ points: r.points, f3_points: r.f3_points, gems_points: r.gems_points, rummy_points: r.rummy_points, spades_points: r.spades_points, dice_points: r.dice_points ?? 0, lifetime_points: r.lifetime_points, owned: parse(r.owned, []), equipped: parse(r.equipped, {}), pending_perks: parse(r.pending_perks, {}) });
const date = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : fallback;
const auth = (identity: EconomyIdentity) => { const id = memberId(identity.principal); if (!id) throw new RummyError('Sign in to earn points and use Clubhouse Cash.', 401, 'sign_in_required'); return id; };

/** Wallet mutations use a revision check inside the same D1 batch as their ledger
 * writes. A competing Worker retries from the committed balance; no debit, bonus
 * or conversion can commit independently of its unique receipt. */
export class EconomyStore {
  constructor(readonly binding: D1Binding, private readonly now = Date.now) {}
  private stmt(sql: string, ...values: unknown[]) { return this.binding.prepare(sql).bind(...values); }
  private first<T = Record<string, unknown>>(sql: string, ...values: unknown[]) { return this.stmt(sql, ...values).first<T>(); }
  private async rows<T>(sql: string, ...values: unknown[]): Promise<T[]> { const r = await this.first<{ data: string }>(sql, ...values); return parse(r?.data ?? '[]', []); }
  async hasMember(identity: EconomyIdentity) { return Boolean(await this.first('SELECT user_id FROM economy_wallets WHERE user_id=?', auth(identity))); }
  async wallet(identity: EconomyIdentity): Promise<EconomyWallet> {
    const id = auth(identity);
    const initial = await this.snapshot(id);
    if (initial.wallet.owned.includes(LEGACY_CUSTOM_PROFILE_IMAGE)) {
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
    if (!await this.prior(id, 'legacy:shared-playing-decks')) {
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
    return (await this.snapshot(id)).wallet;
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
      for (const field of ['points','f3_points','gems_points','rummy_points','spades_points','dice_points','lifetime_points'] as const) {
        if (prior[field] !== undefined && !safe(prior[field])) throw new RummyError('Your existing wallet could not be imported safely.', 503, 'wallet_import_failed');
        w[field] = prior[field] ?? 0;
      }
      if (!Array.isArray(prior.owned) || !prior.equipped || typeof prior.equipped !== 'object' || Array.isArray(prior.equipped)) throw new RummyError('Your existing collection could not be imported safely.', 503, 'wallet_import_failed');
      w.owned = [...new Set(prior.owned.filter((v): v is string => typeof v === 'string' && v.length <= 100))];
      w.equipped = Object.fromEntries(Object.entries(prior.equipped).filter(([k,v])=>k.length<=80 && typeof v === 'string' && v.length<=100));
      w.pending_perks = Object.fromEntries(Object.entries(prior.pending_perks ?? {}).filter(([k,v])=>k.length<=80 && safe(v)));
    }
    const awards = (legacy?.awards ?? []).filter(a=>a && typeof a.source === 'string' && a.source.length>0 && a.source.length<=200).map(a=>({ source:a.source, amount:safe(a.amount)?a.amount:0, currency:currencyForSource(a.source), detail:JSON.stringify({tier:a.rummy_tier ?? null}), time:date(a.created_at,now) }));
    const initial = [this.stmt('INSERT OR IGNORE INTO economy_wallets(user_id,points,f3_points,gems_points,rummy_points,spades_points,dice_points,lifetime_points,owned,equipped,pending_perks,revision,import_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)', id,w.points,w.f3_points,w.gems_points,w.rummy_points,w.spades_points,w.dice_points,w.lifetime_points,JSON.stringify(w.owned),JSON.stringify(w.equipped),JSON.stringify(w.pending_perks),token,Math.min(now,date(legacy?.joinedAt,now)),now),
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
      for (const field of ['points','f3_points','gems_points','rummy_points','spades_points','dice_points','lifetime_points'] as const) if (!safe(w[field])) throw new RummyError('This change would exceed the wallet limit.',409,'wallet_limit');
      try {
        await this.binding.batch([
          this.stmt('INSERT INTO command_guards(valid) SELECT CASE WHEN (SELECT revision FROM economy_wallets WHERE user_id=?)=? THEN 1 ELSE 0 END',id,snapshot.row.revision),
          this.stmt('UPDATE economy_wallets SET points=?,f3_points=?,gems_points=?,rummy_points=?,spades_points=?,dice_points=?,lifetime_points=?,owned=?,equipped=?,pending_perks=?,revision=revision+1,updated_at=? WHERE user_id=?',w.points,w.f3_points,w.gems_points,w.rummy_points,w.spades_points,w.dice_points,w.lifetime_points,JSON.stringify(w.owned),JSON.stringify(w.equipped),JSON.stringify(w.pending_perks),this.now(),id),
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
  private prior(id:string,source:string) { return this.first<{detail:string;amount:number;cash:number;created_at:number}>('SELECT detail,amount,cash,created_at FROM economy_ledger WHERE user_id=? AND source=?',id,source); }
  async puzzleProgress(identity:EconomyIdentity,game:'faith-3'|'3-gems'):Promise<PuzzleProgress & {cleared:number[]}> {
    const id=auth(identity); await this.snapshot(id);
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
  private async creditCard(id:string,source:string,game:'rummy'|'spades'|'five-dice',tier:keyof typeof WIN_POINTS,amount:number) {
    return this.transact(id,async({wallet})=>{
      const prior=await this.prior(id,source);
      if(prior) {
        const detail=parse<{tier?:string}>(prior.detail,{});
        return {statements:detail.tier===tier?[]:[this.stmt("UPDATE economy_ledger SET detail=json_set(detail,'$.tier',?) WHERE user_id=? AND source=?",tier,id,source)],result:{already:true,amount:prior.amount>0?prior.amount:amount}};
      }
      const currency=POINT_FIELDS[game];
      return {wallet:{...wallet,[currency]:wallet[currency]+amount,lifetime_points:wallet.lifetime_points+amount},statements:[this.ledger(id,source,'reward',currency,amount,`${game==='rummy'?'Rummy+':game==='five-dice'?'Farkle':'Spades'} · ${tier==='humans'?'online':tier} match win`,{tier})],result:{already:false,amount}};
    });
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
  async claimFiveDiceReward(result:FiveDiceMatchReward):Promise<FiveDiceReceipt> {
    const row=await this.first<{payload:string}>('SELECT payload FROM five_dice_rewards WHERE match_id=?',result.match_id);
    const tier=fiveDiceRewardTier(result.mode,result.players),winner=fiveDiceWinner(result);
    if(!row||JSON.stringify(parse(row.payload,null))!==JSON.stringify(result)||!tier||!winner)throw new RummyError('This match has no verified reward.',403,'reward_unverified');
    const source=`five-dice:win:${result.match_id}`,paid=await this.creditCard(winner,source,'five-dice',tier,CARD_WIN_POINTS[tier]);
    return {match_id:result.match_id,user_id:winner,amount:paid.amount,tier,source,already_credited:paid.already};
  }
  async syncTrustedRewards(identity:EconomyIdentity) {
    const id=auth(identity); await this.snapshot(id);
    const rummy=await this.rows<{payload:string}>('SELECT json_group_array(json_object(\'payload\',payload)) AS data FROM reward_outbox WHERE user_id=?',id);
    for(const row of rummy) { const result=parse<MatchReward|null>(row.payload,null); if(result) await this.claimRummyReward(result); }
    const spades=await this.rows<{payload:string}>(`SELECT json_group_array(json_object('payload',payload)) AS data FROM spades_rewards WHERE EXISTS(SELECT 1 FROM json_each(payload,'$.players') p WHERE json_extract(p.value,'$.user_id')=? AND json_extract(p.value,'$.bot')=0 AND CASE WHEN json_extract(payload,'$.variant')='teams' THEN CAST(p.key AS INTEGER)%2 ELSE CAST(p.key AS INTEGER) END=json_extract(payload,'$.winner'))`,id);
    for(const row of spades) {
      const result=parse<SpadesMatchReward|null>(row.payload,null);if(!result)continue;
      const tier=spadesRewardTier(result.mode,result.players);if(!tier||!spadesWinners(result).includes(id))continue;
      const source=`spades:win:${result.match_id}`,existing=await Promise.all(spadesWinners(result).map(winner=>this.prior(winner,source)));
      await this.creditCard(id,source,'spades',tier,existing.find(receipt=>receipt!==null&&receipt.amount>0)?.amount??SPADES_POINTS[tier]);
    }
    const dice=await this.rows<{payload:string}>(`SELECT json_group_array(json_object('payload',payload)) AS data FROM five_dice_rewards WHERE json_extract(payload,'$.players['||json_extract(payload,'$.winner')||'].user_id')=?`,id);
    for(const row of dice){const result=parse<FiveDiceMatchReward|null>(row.payload,null);if(result&&fiveDiceWinner(result)===id)await this.claimFiveDiceReward(result);}

  }
  private async stats(id:string,wallet:EconomyWallet):Promise<EconomyStats> {
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
    const faith=await this.puzzleProgress({principal:`member:${id}`},'faith-3'),gems=await this.puzzleProgress({principal:`member:${id}`},'3-gems');
    const chapters=(levels:number[],size:number,max:number)=>Array.from({length:max/size},(_,chapter)=>Array.from({length:size},(_,n)=>chapter*size+n+1).every(level=>levels.includes(level))).filter(Boolean).length;
    const result:EconomyStats={faithLevels:0,faithChapters:chapters(faith.levels,20,280),gemsLevels:0,gemsStars:0,gemsChapters:chapters(gems.levels,50,GEMS_LEVEL_COUNT),rummyWins:0,rummyHumanWins:0,rummyHardWins:0,spadesWins:0,spadesHumanWins:0,spadesHardWins:0,diceWins:0,diceHumanWins:0,diceHardWins:0,lifetime:wallet.lifetime_points,cosmetics:wallet.owned.filter(id=>ECONOMY_CATALOG.some(item=>item.id===id&&item.slot!==null)).length,friends:0,memberDays:Math.max(0,Math.floor((this.now()-(row?.created_at??this.now()))/86400000)),visits:0,profileComplete:0,gamesPlayed:0};
    for(const key of Object.keys(counts??{}) as (keyof EconomyStats)[])result[key]=Number(counts?.[key]??0);
    const dice=await this.first<{diceWins:number;diceHumanWins:number;diceHardWins:number}>(`SELECT count(*) diceWins,coalesce(sum(CASE WHEN json_extract(detail,'$.tier')='humans' THEN 1 ELSE 0 END),0) diceHumanWins,coalesce(sum(CASE WHEN json_extract(detail,'$.tier')='hard' THEN 1 ELSE 0 END),0) diceHardWins FROM economy_ledger WHERE user_id=? AND source LIKE 'five-dice:win:%'`,id);
    if(dice)Object.assign(result,dice);
    const earned=await this.first<{n:number}>('SELECT count(*) AS n FROM reward_outbox WHERE user_id=?',id);
    const cosmetics=new Set(wallet.owned.filter(id=>ECONOMY_CATALOG.some(item=>item.id===id&&item.slot!==null)));
    for(const design of RUMMY_DESIGNS)if(design.wins>0&&design.wins<=Number(earned?.n??0))cosmetics.add(design.id);
    result.cosmetics=cosmetics.size;
    result.gamesPlayed=[result.faithLevels,result.gemsLevels,result.rummyWins,result.spadesWins,result.diceWins].filter(n=>n>0).length;
    return result;
  }
  private async badgeViews(id:string,stats:EconomyStats) {
    const claimed=await this.rows<{source:string;amount:number;createdAt:number}>(`SELECT json_group_array(json_object('source',source,'amount',amount,'createdAt',created_at)) AS data FROM economy_ledger WHERE user_id=? AND (source LIKE 'badge:%' OR source LIKE 'badge-cash:%')`,id);
    return ACHIEVEMENTS.map(item=>{
      const receipt=claimed.find(row=>row.source===`badge:${item.id}`),cash=claimed.find(row=>row.source===`badge-cash:${item.id}`);
      return {...item,reward:receipt?.amount??item.reward,cashReward:receipt?(item.currency==='points'?receipt.amount:cash?.amount??gameAchievementCash(receipt.amount)):item.cashReward,progress:Math.min(item.goal,stats[item.stat]),unlocked:stats[item.stat]>=item.goal,claimed:Boolean(receipt),claimedAt:receipt?.createdAt??null};
    });
  }
  private async syncAchievementCash(identity:EconomyIdentity) {
    const id=auth(identity);
    const claimed=await this.rows<{source:string;amount:number}>("SELECT json_group_array(json_object('source',source,'amount',amount)) AS data FROM economy_ledger WHERE user_id=? AND source LIKE 'badge:%'",id);
    for(const row of claimed) {
      const badge=ACHIEVEMENTS.find(item=>`badge:${item.id}`===row.source);
      if(!badge||badge.currency==='points')continue;
      const cashReward=gameAchievementCash(row.amount);
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
  async read(identity:EconomyIdentity):Promise<EconomyView> {
    const id=auth(identity);await this.snapshot(id);
    await this.stmt('INSERT OR IGNORE INTO economy_visits(user_id,day) VALUES(?,?)',id,new Date(this.now()).toISOString().slice(0,10)).run();
    await this.syncTrustedRewards(identity);
    await this.syncAchievementCash(identity);
    await this.applyAllowances(identity);
    const wallet=await this.wallet(identity),stats=await this.stats(id,wallet);
    const sources=await this.rows<{source:string;tier:string|null}>(`SELECT json_group_array(json_object('source',source,'tier',json_extract(detail,'$.tier'))) AS data FROM (SELECT source,detail FROM economy_ledger WHERE user_id=? AND kind IN ('legacy','reward','achievement') AND source<>'legacy:shared-playing-decks' ORDER BY created_at DESC LIMIT 10000)`,id);
    const history=await this.rows<EconomyHistory>(`SELECT json_group_array(json_object('id',id,'source',source,'kind',kind,'currency',currency,'amount',amount,'cash',cash,'label',label,'createdAt',created_at)) AS data FROM (SELECT * FROM economy_ledger WHERE user_id=? AND source<>'legacy:shared-playing-decks' ORDER BY created_at DESC,id DESC LIMIT 50)`,id);
    const faith=await this.puzzleProgress(identity,'faith-3'),gems=await this.puzzleProgress(identity,'3-gems');
    return {wallet,sources:sources.map(s=>s.source),humanWinSources:sources.filter(s=>s.tier==='humans'&&s.source.startsWith('rummy:win:')).map(s=>s.source),stats,achievements:await this.badgeViews(id,stats),history,progress:{'faith-3':faith,'3-gems':gems},conversionRate:CONVERSION_RATE};
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
    if(await this.hasPendingAllowance(identity))await this.read(identity);
    if(!input||typeof input!=='object'||Array.isArray(input))throw new RummyError('Choose a points or rewards action.');
    const value=input as Record<string,unknown>;let receipt:EconomyReceipt;
    if(value.operation==='convert') {
      const game=value.game as PointGame,amount=value.amount,requestId=value.requestId;
      if(!POINT_GAMES.includes(game)||typeof amount!=='number'||!safe(amount)||amount<=0||typeof requestId!=='string'||!UUID.test(requestId))throw new RummyError('Convert a positive multiple of 13 game points.');
      const currency=POINT_FIELDS[game],cash=Math.floor(amount/CONVERSION_RATE.points)*CONVERSION_RATE.cash,source=`convert:${requestId.toLowerCase()}`;
      receipt=await this.transact(id,async({wallet})=>{
        const prior=await this.prior(id,source);
        if(prior){const detail=parse<{game:string;amount:number}>(prior.detail,{game:'',amount:0});if(detail.game!==game||detail.amount!==amount)throw new RummyError('That conversion ID already belongs to another conversion.',409,'request_reused');return {result:{type:'conversion',alreadyApplied:true,amount,cash:prior.cash,currency} as EconomyReceipt};}
        if(amount%CONVERSION_RATE.points!==0)throw new RummyError('Convert a positive multiple of 13 game points.');
        if(wallet[currency]<amount)throw new RummyError('Not enough game points for this conversion.',409,'insufficient_points');
        return {wallet:{...wallet,[currency]:wallet[currency]-amount,points:wallet.points+cash},statements:[this.ledger(id,source,'conversion',currency,-amount,`${game==='faith-3'?'Faith 3':game==='3-gems'?'3 Gems':game==='rummy'?'Rummy+':game==='five-dice'?'Farkle':'Spades'} points converted to Clubhouse Cash`,{game,amount},cash)],result:{type:'conversion',alreadyApplied:false,amount,cash,currency} as EconomyReceipt};
      });
    } else if(value.operation==='claim_achievement') {
      const item=ACHIEVEMENTS.find(a=>a.id===value.achievementId);if(!item)throw new RummyError('Choose an available achievement.');
      receipt=await this.transact(id,async({wallet})=>{
        const prior=await this.prior(id,`badge:${item.id}`);
        if(prior){const cash=await this.prior(id,`badge-cash:${item.id}`);return {result:{type:'achievement',alreadyApplied:true,achievementId:item.id,amount:prior.amount,currency:item.currency,cash:item.currency==='points'?0:cash?.amount??gameAchievementCash(prior.amount)} as EconomyReceipt};}
        const stats=await this.stats(id,wallet);
        if(stats[item.stat]<item.goal)throw new RummyError('This achievement is still in progress.',409,'achievement_locked');
        const cashBonus=item.currency==='points'?0:item.cashReward;
        return {wallet:{...wallet,[item.currency]:wallet[item.currency]+item.reward,points:wallet.points+(item.currency==='points'?item.reward:cashBonus),lifetime_points:wallet.lifetime_points+item.reward+cashBonus},statements:[this.ledger(id,`badge:${item.id}`,'achievement',item.currency,item.reward,item.name,{group:item.group}),...(cashBonus?[this.ledger(id,`badge-cash:${item.id}`,'achievement','points',cashBonus,`${item.name} · Cash bonus`,{achievementId:item.id})]:[])],result:{type:'achievement',alreadyApplied:false,achievementId:item.id,amount:item.reward,currency:item.currency,cash:item.currency==='points'?0:item.cashReward} as EconomyReceipt};
      });
    } else if(value.operation==='purchase') {
      const item=ECONOMY_CATALOG.find(item=>item.id===value.itemId);if(!item)throw new RummyError('This store item is unavailable.');
      if(value.payment!==undefined&&value.payment!=='game'&&value.payment!=='cash')throw new RummyError('Choose game points or Clubhouse Cash.');
      const selectable: readonly PointGame[] = isProfileFrameItem(item.id) ? POINT_GAMES : isSharedDeck(item.id) ? ['rummy','spades'] : [];
      if(value.game!==undefined&&!selectable.includes(value.game as PointGame))throw new RummyError('Choose a supported game for this unlock.');
      const currency=value.payment==='cash'?'points':value.game?POINT_FIELDS[value.game as PointGame]:item.currency,price=value.payment==='cash'?item.cashPrice:item.price;
      receipt=await this.transact(id,async({wallet})=>{
        if(wallet.owned.includes(item.id))return {result:{type:'purchase',alreadyApplied:true,itemId:item.id,amount:price,currency} as EconomyReceipt};
        const design=RUMMY_DESIGNS.find(design=>design.id===item.id);
        const wins=design?await this.first<{n:number}>('SELECT count(*) AS n FROM reward_outbox WHERE user_id=?',id):null;
        if(design&&!design.purchaseOnly&&Number(wins?.n??0)>=design.wins)return {wallet:{...wallet,owned:[...wallet.owned,item.id]},result:{type:'purchase',alreadyApplied:true,itemId:item.id,amount:price,currency} as EconomyReceipt};
        if(wallet[currency]<price)throw new RummyError('Not enough points or Clubhouse Cash for this item.',409,'insufficient_points');
        return {wallet:{...wallet,[currency]:wallet[currency]-price,owned:[...wallet.owned,item.id]},statements:[this.ledger(id,`purchase:${item.id}`,'purchase',currency,-price,item.name)],result:{type:'purchase',alreadyApplied:false,itemId:item.id,amount:price,currency} as EconomyReceipt};
      });
    } else if(value.operation==='equip') {
      const slot=typeof value.slot==='string'?value.slot:'',itemId=typeof value.itemId==='string'?value.itemId:'',defaults:Record<string,string>={faith3_skin:'faith3-classic',spades_table:'spades-table-classic',spades_deck:'spades-deck-classic'};
      if(!Object.hasOwn(defaults,slot))throw new RummyError('Choose a valid collection slot.');
      const item=ECONOMY_CATALOG.find(item=>item.id===itemId&&(item.slot===slot||(slot==='spades_deck'&&item.slot==='card_deck')));
      if(!item&&defaults[slot]!==itemId)throw new RummyError('That design does not belong in this slot.');
      receipt=await this.transact(id,async({wallet})=>{
        if(item&&!wallet.owned.includes(itemId))throw new RummyError('Collect this design before equipping it.',403,'not_owned');
        if(wallet.equipped[slot]===itemId)return {result:{type:'equip',alreadyApplied:true,itemId} as EconomyReceipt};
        return {wallet:{...wallet,equipped:{...wallet.equipped,[slot]:itemId}},result:{type:'equip',alreadyApplied:false,itemId} as EconomyReceipt};
      });
    } else if(value.operation==='check_in') {
      const day=new Date(this.now()).toISOString().slice(0,10),prior=await this.first('SELECT day FROM economy_visits WHERE user_id=? AND day=?',id,day);
      await this.stmt('INSERT OR IGNORE INTO economy_visits(user_id,day) VALUES(?,?)',id,day).run();receipt={type:'check_in',alreadyApplied:Boolean(prior)};
    } else throw new RummyError('Choose a valid points or rewards action.');
    return {ok:true,...await this.read(identity),receipt};
  }
}
