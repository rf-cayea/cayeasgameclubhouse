import { useCrownChancePresentation } from '@/lib/crown-chance-presentation';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { GameHeader, GamePanel } from '@/components/GameChrome';
import { CrownChanceBoard, ChanceHandOptions, ChanceMoveHistory, ChanceScoringGuide, chanceHandRanks, formatChancePoints } from '@/components/CrownChanceBoard';
import { FarkleAudioIcon, FarkleSoundControls } from '@/components/FarkleSoundControls';
import { PokerDiceCollection, PokerSetArtwork } from '@/components/PokerDiceCollection';
import { RewardCrates } from '@/components/DiceCrateRewards';
import { TableAchievementGuide } from '@/components/TableAchievementGuide';
import { useClubhouse } from '@/lib/clubhouse';
import { usePlayerProfile } from '@/lib/social';
import { equippedPokerDice } from '@/lib/poker-dice-sets';
import { useCrownChanceRoom } from '@/lib/crown-chance-network';
import { applyCrownChanceMove, chanceCanBank, chanceHands, CHANCE_HIGH_HANDS, CHANCE_TARGETS, CHANCE_LIMITS, newCrownChance, type CrownChanceMove, type CrownChanceState, type ChanceChallenge } from '@/lib/crown-chance';
import { useClassicFarkleAudio } from '@/lib/use-classic-farkle-audio';
import type { CrownChanceOptions } from '@/lib/crown-chance-protocol';

export const Route = createFileRoute('/games/crown-chance')({
  loader: async () => { await import('@/styles/five-dice.css'); await Promise.all([import('@/styles/classic-farkle.css'), import('@/styles/crown-chance.css')]); },
  validateSearch: (search:Record<string,unknown>): {room?: string} => ({room:typeof search.room === 'string' && /^[0-9a-f]{8}$/i.test(search.room) ? search.room.toUpperCase() : undefined}),
  head: () => ({meta:[{title:'Crown & Chance — An Original Game by Richard Cayea'}]}),
  component: CrownChancePage,
});

function CrownChancePage() {
  const {user,wallet,ready,error:accountError,reload} = useClubhouse(), design = equippedPokerDice(wallet);
  const profile = usePlayerProfile(user?.id ?? null);
  const network = useCrownChanceRoom(user?.id ?? null,ready), room = network.room, invitation = Route.useSearch().room;
  const [mode,setMode] = useState<'solo'|'local'|'bot'|'online'>(invitation ? 'online' : 'solo');
  const [options,setOptions] = useState<CrownChanceOptions>({mode:'bot',seats:2,level:'normal',length:'fast',minimum:0});
  const [challenge,setChallenge] = useState<ChanceChallenge>('marathon');
  const [local,setLocal] = useState<CrownChanceState|null>(null), [mask,setMask] = useState(0);
  const [panel,setPanel] = useState<'help'|'dice'|'rewards'|'leave'|'hands'|'moves'|'audio'|null>(null);
  const [firstName,setFirstName] = useState(''), [secondName,setSecondName] = useState('');
  const [code,setCode] = useState(invitation ?? ''), [copied,setCopied] = useState(false);
  const [record,setRecord] = useState('');
  const twoPlayerLocal = mode === 'local' && options.seats === 2;
  const networkName = profile.data?.gamerName || (mode === 'online' ? 'Guest' : 'Player');
  const state = local ?? room?.state;
  const mine = Boolean(state && (local || room?.mySeat === state.turn));
  const connecting = network.pending || Boolean(network.uncertain);
  const scope = local ? 'local' : room?.status === 'abandoned' ? '' : room?.code ?? '';
  const presentation = useCrownChancePresentation(scope, scope ? state : null, local ? undefined : room?.mySeat);
  const busy = presentation.busy || !local && (connecting || !network.healthy);
  const hands = state && mine && !presentation.busy ? chanceHands(state) : [];
  const selected = hands.find(hand => hand.mask === mask);
  const seenHands = new Set<string>();
  const choices = state ? hands.filter(hand => {
    const key = chanceHandRanks(state.dice, hand.mask);
    if (seenHands.has(key)) return false;
    seenHands.add(key);
    return true;
  }) : [];
  const last = presentation.frame;
  const audio = useClassicFarkleAudio(scope, last ? {
    id: last.id,
    seat: last.seat,
    kind: last.kind === 'claim' ? 'keep' : last.kind,
    points: last.kind === 'roll' ? 0 : last.points,
    rolled: last.kind === 'roll' ? last.rolled : [],
    bust: last.kind === 'roll' && last.lost !== undefined,
    hot: last.kind === 'claim' && last.hot,
  } : null, null, { bustDelay: 360, effectsOnly: true });

  useEffect(() => { setMask(0); }, [room?.code, room?.revision]);

  function pickHand(handMask: number) {
    if (!mine || busy) return;
    setMask(handMask);
    setPanel(previous => previous === 'hands' ? null : previous);
  }

  async function move(action:CrownChanceMove) {
    if (!state || !mine || busy) return;
    audio.unlock();
    if (local) {
      const next = applyCrownChanceMove(local,local.turn,action);
      if (!next) return;
      setLocal(next);
      if (next.phase === 'finished' && next.challenge) saveRecord(next);
    } else if (room) {
      if (!await network.command({operation:'move',code:room.code,revision:room.revision,move:action})) return;
    }
    setMask(0);
  }

  function saveRecord(next:CrownChanceState) {
    const score = next.scores[0]!;
    if (next.challenge !== 'attack' && !next.winners.length) return;
    const attack = next.challenge === 'attack', key = `clubhouse-chance-record:${attack?'attack':`${next.length}:${next.challenge}`}`;
    const value = attack ? score.points : score.turns;
    try {
      const previous = localStorage.getItem(key);
      const best = previous === null ? value : attack ? Math.max(value,Number(previous)) : Math.min(value,Number(previous));
      localStorage.setItem(key,String(best));
      setRecord(attack ? `Personal best · ${formatChancePoints(best)} points` : `Personal best · ${best} turns`);
    } catch { /* The result remains visible even if storage is disabled. */ }
  }

  function start() {
    audio.unlock();
    setMask(0); setRecord('');
    if (mode === 'bot' || mode === 'online') {
      void network.command({operation:'create',name:networkName,options:{...options,mode,seats:mode==='bot'?2:options.seats}});
      return;
    }
    const names = twoPlayerLocal ? [firstName.trim(), secondName.trim()] : [];
    const players = Array.from({ length: mode === 'solo' ? 1 : options.seats }, (_, index) => ({
      id: String(index), name: names[index] || (mode === 'solo' ? 'Player' : `Player ${index + 1}`), bot: false,
    }));
    setLocal(newCrownChance(players,options.length,mode==='solo'?challenge:null,mode==='solo'?0:options.minimum));
  }

  async function leave() {
    if (local) setLocal(null);
    else if (room && !await network.command({operation:'leave',code:room.code})) return;
    setPanel(null); setMask(0);
  }

  return <div className="game-viewport fd-scene chance-scene">
    <GameHeader title="Crown & Chance">
      <button onClick={()=>setPanel('help')}>Rules</button>
      <button onClick={()=>setPanel('dice')}>Dice</button>
      <button onClick={()=>setPanel('rewards')}>Rewards</button>
      {state && <button onClick={()=>setPanel('moves')}>Moves</button>}
      <button className="fd-audio-button" aria-label="Audio settings" onClick={()=>setPanel('audio')}><FarkleAudioIcon muted={audio.silent}/></button>
    </GameHeader>
    <main className="chance-main">
      {(network.error || network.uncertain) && <p className="fd-network" role="alert">{network.error || 'This action still needs confirmation.'} {network.uncertain ? <button disabled={network.pending} onClick={()=>void network.retry()}>Retry same action</button> : <button onClick={()=>void network.refresh()}>Refresh table</button>}</p>}
      {!state && !room ? <section className="chance-setup">
        <div className="chance-intro"><h2>Crown &amp; Chance</h2><p>Original game by Richard Cayea</p><PokerSetArtwork design={design}/><p>Build poker hands with six dice. Bank the points or risk the next roll.</p></div>
        <div className="chance-setup-fields">
          <p role="status">{!ready ? 'Checking your Clubhouse sign-in…' : user ? 'Signed in to the Clubhouse.' : accountError ? 'Could not verify your Clubhouse sign-in.' : 'Playing as a guest.'}</p>
          {accountError && <div role="alert"><p>{accountError}</p><button className="btn-ghost-gold" onClick={()=>void reload()}>Retry account check</button></div>}
          {network.code && <p role="status">Reconnecting to your saved table…</p>}
          <label>Play<select value={mode} onChange={event=>setMode(event.target.value as typeof mode)}><option value="solo">Solo</option><option value="local">Pass and play</option><option value="bot">Vs computer</option><option value="online">Online friends</option></select></label>
          {!(mode==='solo'&&challenge==='attack')&&<label>Target<select value={options.length} onChange={event=>setOptions({...options,length:event.target.value as CrownChanceOptions['length']})}><option value="fast">Fast · 4,000</option><option value="long">Long · 12,000</option></select></label>}
          {mode==='solo'&&<label>Solo challenge<select value={challenge} onChange={event=>setChallenge(event.target.value as ChanceChallenge)}>{Object.entries(CHANCE_LIMITS).map(([key,limit])=><option key={key} value={key}>{key==='attack'?'Score Attack · 10 turns':`${key[0]!.toUpperCase()+key.slice(1)} · ${limit ? `${limit} turns` : 'unlimited turns'}`}</option>)}</select></label>}
          {(mode==='local'||mode==='online')&&<label>Players<select value={options.seats} onChange={event=>setOptions({...options,seats:Number(event.target.value) as CrownChanceOptions['seats']})}>{[2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>}
          {twoPlayerLocal && <div className="chance-local-names">
            <label>Player 1 name<input maxLength={24} placeholder="Player 1" value={firstName} onChange={event=>setFirstName(event.target.value)}/></label>
            <label>Player 2 name<input maxLength={24} placeholder="Player 2" value={secondName} onChange={event=>setSecondName(event.target.value)}/></label>
          </div>}
          {mode==='bot'&&<label>Computer difficulty<select value={options.level} onChange={event=>setOptions({...options,level:event.target.value as CrownChanceOptions['level']})}><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>}
          {mode!=='solo'&&<label>Opening house rule<select value={options.minimum} onChange={event=>setOptions({...options,minimum:Number(event.target.value) as CrownChanceOptions['minimum']})}><option value={0}>Pair or better</option><option value={500}>Pair or better + 500 points</option><option value={1000}>Pair or better + 1,000 points</option></select></label>}
          <button className="btn-gold" disabled={Boolean(network.code)||(mode==='bot'||mode==='online')&&(!network.initialized||connecting)} onClick={start}>{network.pending ? 'Opening table…' : mode==='online'?'Create online table':'Start game'}</button>
          {mode==='online'&&<><label>Join with table code<input value={code} maxLength={8} onChange={event=>setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g,''))}/></label><button className="btn-ghost-gold" disabled={!network.initialized||connecting||Boolean(network.code)||code.length!==8} onClick={()=>void network.command({operation:'join',name:networkName,code})}>Join table</button></>}
        </div>
      </section> : room?.status==='waiting' ? <section className="chance-table">
        <h2>Online table · {room.code}</h2>
        <p>{formatChancePoints(CHANCE_TARGETS[room.options.length])} point target · {room.options.minimum ? `Pair or better and ${formatChancePoints(room.options.minimum)} points to open` : 'Pair or better to open'}</p>
        <div className="chance-scores">{room.players.map(player=><article key={player.id}><strong>{player.name}</strong><span>{player.ready?'Ready':'Waiting'}</span></article>)}</div>
        <div className="chance-actions"><button className="btn-ghost-gold" onClick={async()=>{const link=new URL('/games/crown-chance',location.origin);link.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(link.href);setCopied(true);}catch{setCopied(false);}}}>{copied?'Invitation copied':'Copy invitation'}</button>
        <button className="btn-ghost-gold" disabled={busy} onClick={()=>void network.command({operation:'ready',code:room.code,ready:!room.players[room.mySeat]?.ready})}>{room.players[room.mySeat]?.ready?'Unready':'Ready'}</button>
        {room.owner&&<button className="btn-gold" disabled={busy||!room.players.every(player=>player.ready)} onClick={()=>void network.command({operation:'start',code:room.code,revision:room.revision})}>Start match</button>}
        <button className="btn-ghost-gold" disabled={busy} onClick={()=>void leave()}>Leave table</button></div>
      </section> : state && room?.status !== 'abandoned' ? <CrownChanceBoard
        state={state} frame={presentation.frame} design={design} mask={mask} hands={hands} choices={choices} selected={selected}
        canPlay={mine && !busy} locked={busy} mySeat={room?.mySeat}
        connection={room ? network.live ? 'Live' : network.healthy ? 'Connected' : 'Offline' : undefined}
        record={record} reward={room?.reward.message}
        onToggle={index=>setMask(previous=>previous ^ (1 << index))}
        onPick={pickHand} onAllHands={()=>setPanel('hands')} onMoves={()=>setPanel('moves')}
        onMove={action=>void move(action)}
        onLeave={()=>state.phase === 'finished' ? void leave() : setPanel('leave')}
      /> : <section className="chance-table"><p>This table ended.</p><button className="btn-gold" disabled={busy} onClick={()=>void leave()}>Back to setup</button></section>}
    </main>
    {panel&&<GamePanel title={{help:'Crown & Chance rules',dice:'Shared poker dice',rewards:'Poker dice rewards',leave:'Leave this game?',hands:'Scoring hands in this roll',moves:'Rolls and score record',audio:'Dice sounds'}[panel]} close={()=>setPanel(null)}>
      {panel==='dice'?<PokerDiceCollection/>:panel==='rewards'?<><TableAchievementGuide game="crown-chance"/><RewardCrates collection="poker"/></>:panel==='leave'?<><p>Leaving ends the current game.</p><button className="btn-gold" onClick={()=>void leave()}>Leave game</button></>:panel==='audio'?<FarkleSoundControls audio={audio} gameName="Crown & Chance" effectsOnly/>
        :panel==='moves'?<ChanceMoveHistory state={state}/>
        :panel==='hands'&&state?<ChanceHandOptions hands={choices} dice={state.dice} mask={mask} onPick={pickHand} disabled={!mine||busy}/>
        :<ChanceRules/>}
    </GamePanel>}
  </div>;
}

function ChanceRules() {
  return <div className="chance-rules"><p>Roll all six dice and claim at least one scoring hand from the current roll. You may claim more hands with different dice before banking or rolling the unclaimed dice. A roll with no scoring hand busts and wipes your unbanked points. When all six dice have scored, Hot Dice lets you bank or roll all six again.</p>
    <p>Your first bank in every mode must include a pair or better. Multiplayer can add an opening minimum if everyone agrees. Later banks may use singles alone. Ace suits are artwork and there are no flushes.</p>
    <p>Dice that can score glow green. Tap dice to build a hand or use Hint to select the highest-scoring hand available. Selected dice glow gold. Claim adds that hand to your unbanked turn score.</p>
    <table><caption>Scoring hands</caption><tbody>{[
      ['Single 9 / Ace','50 / 100'],['Pair / pair of Aces','200 / 250'],['Two Pair / Three Pair','450 / 900'],
      ['Three of a Kind (9, 10, J, Q, K, A)','500 / 550 / 600 / 650 / 700 / 750'],
      ['Low Straight (9–K) / High Straight (10–A)','1,200 / 1,400'],...Object.entries(CHANCE_HIGH_HANDS).map(([key, { name, points }]) => [
        key === 'sixDiceStraight' ? `${name} (9–A)` : name,
        formatChancePoints(points),
      ]),
    ].map(([hand,points])=><tr key={hand}><td>{hand}</td><td>{points}</td></tr>)}</tbody></table>
    <ChanceScoringGuide/>
    <p>Three of a Kind scores 500 for 9s, 550 for 10s, 600 for Jacks, 650 for Queens, 700 for Kings, and 750 for Aces.</p>
    <p>Fast games target 4,000. Long games target 12,000. In multiplayer, reaching the target starts the final round. Finish the current round so all players have equal turns. If the leaders tie, only those players take another turn each until the tie breaks.</p>
    <p>Solo Target Sprint lets you choose Casual (15 turns), Standard (10), Expert (7), or unlimited Marathon. Score Attack measures your score after exactly 10 turns. A bust counts as a turn.</p>
    <p>Verified wins against computers or signed-in online players count toward account achievements and shared poker dice crates. Solo and pass-and-play results stay separate.</p>
  </div>;
}
