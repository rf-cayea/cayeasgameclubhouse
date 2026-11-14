import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { rememberedComputerLevel, rememberComputerLevel } from '@/lib/computer-modes';
import { GameHeader, GamePanel } from '@/components/GameChrome';
import { PokerDieFace } from '@/components/PokerDice';
import { PokerDiceCollection } from '@/components/PokerDiceCollection';
import { RewardCrates } from '@/components/DiceCrateRewards';
import { TableAchievementGuide } from '@/components/TableAchievementGuide';
import { useClubhouse } from '@/lib/clubhouse';
import { usePlayerProfile } from '@/lib/social';
import { CLASSIC_POKER_DICE, POKER_DICE_SETS, POKER_DICE_SLOT, equippedPokerDice } from '@/lib/poker-dice-sets';
import { SetupSetPicker } from '@/components/SetupSetPicker';
import { useCrownChanceRoom } from '@/lib/crown-chance-network';
import { applyCrownChanceMove, chanceCanBank, chanceHands, CHANCE_TARGETS, CHANCE_LIMITS, newCrownChance, type CrownChanceMove, type CrownChanceState, type ChanceChallenge } from '@/lib/crown-chance';
import type { CrownChanceOptions } from '@/lib/crown-chance-protocol';
import '@/styles/five-dice.css';
import '@/styles/poker-dice.css';

export const Route = createFileRoute('/games/crown-chance')({
  validateSearch: (search:Record<string,unknown>): {room?: string} => ({room:typeof search.room === 'string' && /^[0-9a-f]{8}$/i.test(search.room) ? search.room.toUpperCase() : undefined}),
  head: () => ({meta:[{title:'Crown & Chance — An Original Game by Richard Cayea'}]}),
  component: CrownChancePage,
});

function CrownChancePage() {
  const {user,wallet,ready,applyWallet} = useClubhouse(), design = equippedPokerDice(wallet), profile = usePlayerProfile(user?.id ?? null);
  const network = useCrownChanceRoom(user?.id ?? null,ready), room = network.room, invitation = Route.useSearch().room;
  const [mode,setMode] = useState<'solo'|'local'|'bot'|'online'>(invitation ? 'online' : 'solo');
  const [options,setOptions] = useState<CrownChanceOptions>({mode:'bot',seats:2,level:rememberedComputerLevel('crown-chance'),length:'fast',minimum:0});
  const [challenge,setChallenge] = useState<ChanceChallenge>('marathon');
  const [local,setLocal] = useState<CrownChanceState|null>(null), [mask,setMask] = useState(0);
  const [panel,setPanel] = useState<'help'|'dice'|'rewards'|'leave'|null>(null);
  const [name,setName] = useState('Player'), [code,setCode] = useState(invitation ?? ''), [copied,setCopied] = useState(false);
  const [record,setRecord] = useState(''), [equipmentBusy,setEquipmentBusy] = useState(false);
  const state = local ?? room?.state;
  const mine = Boolean(state && (local || room?.mySeat === state.turn));
  const busy = !local && (network.pending || Boolean(network.uncertain) || !network.healthy);
  // A start or join request is what makes the table healthy; waiting for it here
  // would leave the setup buttons disabled forever.
  const starting = !network.initialized || network.pending || Boolean(network.uncertain);
  const hands = state && mine ? chanceHands(state) : [];
  const selected = hands.find(hand => hand.mask === mask);
  // Rolling is closed until a hand is claimed, so offer the best hand in one tap.
  const claim = selected ?? (state && state.phase==='play' && !state.available ? hands[0] : undefined);
  const format = (n:number) => n.toLocaleString();
  useEffect(() => { if (profile.data?.gamerName) setName(profile.data.gamerName); }, [profile.data?.gamerName]);

  async function move(action:CrownChanceMove) {
    if (!state || !mine || busy) return;
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
      setRecord(attack ? `Personal best · ${format(best)} points` : `Personal best · ${best} turns`);
    } catch { /* The result remains visible even if storage is disabled. */ }
  }

  function start() {
    setMask(0); setRecord('');
    if (mode === 'bot' || mode === 'online') {
      void network.command({operation:'create',name,options:{...options,mode,seats:mode==='bot'?2:options.seats}});
      return;
    }
    const players = Array.from({length:mode==='solo'?1:options.seats},(_,i)=>({id:String(i),name:i===0?name:`Player ${i+1}`,bot:false}));
    setLocal(newCrownChance(players,options.length,mode==='solo'?challenge:null,mode==='solo'?0:options.minimum));
  }

  async function leave() {
    if (local) setLocal(null);
    else if (room && !await network.command({operation:'leave',code:room.code})) return;
    setPanel(null); setMask(0);
  }

  return <div className="game-viewport fd-scene cc-scene">
    <GameHeader title="Crown & Chance"><button onClick={()=>setPanel('help')}>Rules</button><button onClick={()=>setPanel('dice')}>Dice</button><button onClick={()=>setPanel('rewards')}>Rewards</button></GameHeader>
    <main className="chance-main">
      {(network.error || network.uncertain) && <p className="fd-network" role="alert">{network.error || 'This action still needs confirmation.'} {network.uncertain ? <button disabled={network.pending} onClick={()=>void network.retry()}>Retry same action</button> : <button onClick={()=>void network.refresh()}>Refresh table</button>}</p>}
      {!state && !room ? <section className="fd-setup" aria-labelledby="chance-start-title">
        <div className="fd-setup-art" aria-hidden="true"><div><PokerDieFace value={5} design={design}/></div><div><PokerDieFace value={6} design={design}/></div><div><PokerDieFace value={3} design={design}/></div></div>
        <p className="fd-eyebrow">ORIGINAL GAME BY RICHARD CAYEA</p>
        <h2 id="chance-start-title">Crown<br/><em>&amp; Chance.</em></h2>
        <p className="fd-setup-description">Build poker hands with six dice. Bank the points or risk the next roll.</p>
        <div className="fd-mode-switch" role="group" aria-label="Crown & Chance play mode">
          {([['solo','Solo'],['local','Pass and play'],['bot','Vs computer'],['online','Online friends']] as const).map(([value,label])=><button key={value} aria-pressed={mode===value} disabled={Boolean(network.code)} onClick={()=>setMode(value)}>{label}</button>)}
        </div>
        <div className="fd-setup-fields">
          <label>Player name<input aria-label="Crown & Chance player name" maxLength={24} value={name} disabled={Boolean(profile.data)||network.pending} onChange={event=>setName(event.target.value)} autoComplete="nickname"/></label>
          {!(mode==='solo'&&challenge==='attack')&&<label>Target<select value={options.length} onChange={event=>setOptions({...options,length:event.target.value as CrownChanceOptions['length']})}><option value="fast">Fast · 4,000</option><option value="long">Long · 12,000</option></select></label>}
          {mode==='solo'&&<label>Solo challenge<select value={challenge} onChange={event=>setChallenge(event.target.value as ChanceChallenge)}>{Object.entries(CHANCE_LIMITS).map(([key,limit])=><option key={key} value={key}>{key==='attack'?'Score Attack · 10 turns':`${key[0]!.toUpperCase()+key.slice(1)} · ${limit ? `${limit} turns` : 'unlimited turns'}`}</option>)}</select></label>}
          {(mode==='local'||mode==='online')&&<label>Players<select value={options.seats} onChange={event=>setOptions({...options,seats:Number(event.target.value) as CrownChanceOptions['seats']})}>{[2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>}
          {mode==='bot'&&<label>Computer difficulty<select value={options.level} onChange={event=>{ rememberComputerLevel('crown-chance', event.target.value); setOptions({...options,level:event.target.value as CrownChanceOptions['level']}); }}><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>}
          {mode!=='solo'&&<label>Opening house rule<select value={options.minimum} onChange={event=>setOptions({...options,minimum:Number(event.target.value) as CrownChanceOptions['minimum']})}><option value={0}>Pair or better</option><option value={500}>Pair or better + 500 points</option><option value={1000}>Pair or better + 1,000 points</option></select></label>}
          {mode==='online'&&<label>Join with table code<input value={code} maxLength={8} onChange={event=>setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g,''))}/></label>}
        </div>
        <SetupSetPicker label="Dice set" slot={POKER_DICE_SLOT} designs={[CLASSIC_POKER_DICE,...POKER_DICE_SETS].filter(set=>!set.price||wallet?.owned.includes(set.id))} selected={design.id} userId={user?.id??null} disabled={!ready||network.pending} onEquipped={applyWallet} onBusyChange={setEquipmentBusy}><PokerDieFace value={5} design={design}/><PokerDieFace value={6} design={design}/></SetupSetPicker>
        <div className="multiplayer-start-actions">
          <button className={mode==='online'?'fd-primary':'fd-primary fd-start'} disabled={equipmentBusy||Boolean(network.code)||name.trim().length<2||(mode==='bot'||mode==='online')&&starting} onClick={start}>{mode==='online'?'Create online table':'Start game'}<span aria-hidden="true">→</span></button>
          {mode==='online'&&<button className="fd-text-button" disabled={starting||Boolean(network.code)||code.length!==8||name.trim().length<2} onClick={()=>void network.command({operation:'join',name,code})}>Join table</button>}
        </div>
      </section> : room?.status==='waiting' ? <section className="chance-table">
        <h2>Online table · {room.code}</h2>
        <p>{format(CHANCE_TARGETS[room.options.length])} point target · {room.options.minimum ? `Pair or better and ${format(room.options.minimum)} points to open` : 'Pair or better to open'}</p>
        <div className="chance-scores">{room.players.map(player=><article key={player.id}><strong>{player.name}</strong><span>{player.ready?'Ready':'Waiting'}</span></article>)}</div>
        <div className="chance-actions"><button className="btn-ghost-gold" onClick={async()=>{const link=new URL('/games/crown-chance',location.origin);link.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(link.href);setCopied(true);}catch{setCopied(false);}}}>{copied?'Invitation copied':'Copy invitation'}</button>
        <button className="btn-ghost-gold" disabled={busy} onClick={()=>void network.command({operation:'ready',code:room.code,ready:!room.players[room.mySeat]?.ready})}>{room.players[room.mySeat]?.ready?'Unready':'Ready'}</button>
        {room.owner&&<button className="btn-gold" disabled={busy||!room.players.every(player=>player.ready)} onClick={()=>void network.command({operation:'start',code:room.code,revision:room.revision})}>Start match</button>}
        <button className="btn-ghost-gold" disabled={busy} onClick={()=>void leave()}>Leave table</button></div>
      </section> : state && room?.status !== 'abandoned' ? <section className="chance-play" aria-label="Crown & Chance table">
        <div className="fk-round"><span>{state.challenge==='attack'?'SCORE ATTACK · 10 TURNS':`TARGET ${format(CHANCE_TARGETS[state.length])}`}{state.finalRound?' · FINAL ROUND':''}{state.challenge&&CHANCE_LIMITS[state.challenge]>0?` · ${state.scores[0]!.turns}/${CHANCE_LIMITS[state.challenge]} TURNS`:''}</span><strong role="status">{state.phase==='finished' ? state.challenge==='attack' ? 'Score Attack complete' : state.challenge ? state.winners.length ? 'Target reached' : 'Turn limit reached' : `${state.players[state.winners[0]!]!.name} wins` : `${state.players[state.turn]!.name}’s turn`}</strong><span className="fd-connection" data-healthy={network.healthy}>{network.live?'Live':network.healthy?'Connected':'Offline'}</span></div>
        <div className="chance-hud">
          <div className="chance-cards" style={{gridTemplateColumns:`repeat(${state.players.length},minmax(0,1fr))`}}>{state.players.map((player,i)=><article key={player.id} className="chance-card" data-active={i===state.turn&&state.phase==='play'} data-you={Boolean(local)||room?.mySeat===i}><span className="chance-card-face" aria-hidden="true">{player.bot?'🤖':'♛'}</span><span className="chance-card-tag">{local?`PLAYER ${i+1}`:room?.mySeat===i?'YOU':player.bot?'COMPUTER':'OPPONENT'}</span><strong>{player.name}</strong><b>{format(state.scores[i]!.points)}</b><small>{state.scores[i]!.turns} turns · {state.scores[i]!.busts} busts</small><small className="chance-card-best">best bank {format(state.scores[i]!.best)}</small></article>)}</div>
          <aside className="chance-guide" aria-label="Poker hand scoring guide"><div><p className="chance-guide-title">HAND VALUES</p>{[['Single 9','50'],['Single Ace','100'],['Pair','200'],['Two Pair','450'],['Three Pair','900'],['Three alike','450+']].map(([name,points])=><p key={name}><span>{name}</span><b>{points}</b></p>)}</div><div><p className="chance-guide-title">SUPER HANDS</p>{[['Full House','1,600'],['Four alike','2,000'],['Five alike','3,000'],['Six alike','5,000'],['Low straight','1,200'],['Six-dice straight','2,700']].map(([name,points])=><p key={name}><span>{name}</span><b>{points}</b></p>)}</div></aside>
        </div>
        {state.phase==='play'&&<>
        <div className="chance-board">
          <div className="chance-lane"><span className="chance-lane-label">CLAIMED<br/>THIS TURN</span><div className="chance-lane-dice">{state.claimed.map((claimed,i)=>claimed?<span className="chance-mini" key={i}><PokerDieFace value={state.dice[i]!} design={design}/></span>:null)}</div><b className="chance-lane-points">{format(state.pending)}</b></div>
          <div className="chance-lane" data-live="true"><span className="chance-lane-label">{state.available?'IN PLAY':'PICK A HAND'}</span><div className="chance-dice-row" aria-label="Six poker dice">{state.dice.map((value,i)=><button className="chance-die" key={i} aria-label={`Die ${i+1}: ${value?['9','10','Jack','Queen','King','Ace'][value-1]:'ready'}${state.claimed[i]?', claimed':''}`} aria-pressed={Boolean(mask&(1<<i))} data-kept={state.claimed[i]} data-selected={Boolean(mask&(1<<i))} disabled={!mine||busy||!value||state.claimed[i]} onClick={()=>setMask(mask^(1<<i))}><PokerDieFace value={value||i+1} ghost={!value} held={state.claimed[i]} design={design}/></button>)}</div><b className="chance-lane-points">{claim?`+${format(claim.points)}`:''}</b></div>
        </div>
        <div className="fk-roll-message" role="status" aria-live="polite"><strong>{state.notice}</strong><span>{claim?`${claim.name} · +${format(claim.points)}`:`${format(state.pending)} unbanked`}{!state.scores[state.turn]!.points&&!state.qualified?' · first bank needs a pair or better':''}</span></div>
        <footer className="chance-actions-bar"><button className="chance-bank" disabled={!mine||busy||!chanceCanBank(state)} onClick={()=>void move({t:'bank'})}>BANK<small>{format(state.pending)}</small></button><button className="chance-collect" disabled={!mine||busy||!claim} onClick={()=>claim&&void move({t:'claim',mask:claim.mask})}>COLLECT{claim?` ${format(claim.points)}`:''}</button><button className="chance-roll" disabled={!mine||busy||!state.available} onClick={()=>void move({t:'roll'})}>{state.claimed.every(Boolean)?'HOT DICE':'ROLL'}</button></footer>
        </>}
        {state.phase==='finished'&&<footer className="chance-actions-bar"><button className="chance-collect" onClick={()=>void leave()}>PLAY AGAIN</button></footer>}
        {record&&<p className="fd-notice">{record}</p>}{room&&<p className="fd-notice" role="status">{room.reward.message}</p>}
        <button className={state.phase==='finished'?'fd-primary':'fk-all-plays'} disabled={busy} onClick={()=>state.phase==='finished'?void leave():setPanel('leave')}>{state.phase==='finished'?'Play again':'Leave game'}</button>
      </section> : <section className="chance-table"><p>This table ended.</p><button className="btn-gold" disabled={busy} onClick={()=>void leave()}>Back to setup</button></section>}
    </main>
    {panel&&<GamePanel title={{help:'Crown & Chance rules',dice:'Shared poker dice',rewards:'Poker dice rewards',leave:'Leave this game?'}[panel]} close={()=>setPanel(null)}>
      {panel==='dice'?<PokerDiceCollection/>:panel==='rewards'?<><TableAchievementGuide game="crown-chance"/><RewardCrates collection="poker"/></>:panel==='leave'?<><p>Leaving ends the current game.</p><button className="btn-gold" onClick={()=>void leave()}>Leave game</button></>:<ChanceRules/>}
    </GamePanel>}
  </div>;
}

function ChanceRules() {
  return <div className="chance-rules"><p>Roll all six dice and claim at least one scoring hand from the current roll. You may claim more hands with different dice before banking or rolling the unclaimed dice. A roll with no scoring hand busts and wipes your unbanked points. When all six dice have scored, Hot Dice lets you bank or roll all six again.</p>
    <p>Your first bank in every mode must include a pair or better. Multiplayer can add an opening minimum if everyone agrees. Later banks may use singles alone. Ace suits are artwork and there are no flushes.</p>
    <table><caption>Scoring hands</caption><tbody>{[
      ['Single 9 / Ace','50 / 100'],['Pair / pair of Aces','200 / 250'],['Two Pair / Three Pair','450 / 900'],
      ['Three of a Kind (9, 10, J, Q, K, A)','500 / 550 / 600 / 650 / 700 / 750'],
      ['Low Straight (9–K) / High Straight (10–A)','1,200 / 1,400'],['Full House','1,600'],
      ['Four of a Kind','2,000'],['Six-Dice Straight (9–A)','2,700'],['Five of a Kind','3,000'],['Six of a Kind','5,000'],
    ].map(([hand,points])=><tr key={hand}><td>{hand}</td><td>{points}</td></tr>)}</tbody></table>
    <p>Fast games target 4,000. Long games target 12,000. In multiplayer, reaching the target starts the final round. Finish the current round so all players have equal turns. If the leaders tie, only those players take another turn each until the tie breaks.</p>
    <p>Solo Target Sprint lets you choose Casual (15 turns), Standard (10), Expert (7), or unlimited Marathon. Score Attack measures your score after exactly 10 turns. A bust counts as a turn.</p>
    <p>Verified wins against computers or signed-in online players count toward account achievements and shared poker dice crates. Solo and pass-and-play results stay separate.</p>
  </div>;
}
