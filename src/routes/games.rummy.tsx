import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { HubNav } from '@/components/HubNav';
import { RummyHand } from '@/components/RummyHand';
import { RummyPractice } from '@/components/RummyPractice';
import { CardArtwork } from '@/components/CardArtwork';
import { CardGameHero, PlayerMedallion, TableCrest } from '@/components/CardTableParts';
import { cardLabel } from '@/lib/hand-order';
import { analyseHand, canLayOff, canTakeDiscard } from '@/lib/rummy-engine';
import { bestArrangement, isMeld, JOKER_PERK, LEVELS, sortHandByRank, sortHandBySuit, VARIANTS, type Card, type Level, type Move, type Variant } from '@/lib/rummy';
import { useRummyRoom } from '@/lib/rummy-network';
import type { GameMode, RoomView } from '@/lib/rummy-protocol';
import { useClubhouse } from '@/lib/clubhouse';

export const Route = createFileRoute('/games/rummy')({
  head: () => ({ meta: [{ title: "Rummy+ — Cayea's Game Clubhouse" }] }), component: RummyPage,
});

const compact = (card: Card) => card.startsWith('X') ? `Joker ${card[1]}` : `${card[0] === 'T' ? '10' : card[0]}${({ S: '♠', H: '♥', D: '♦', C: '♣' } as Record<string, string>)[card[1]!]}`;
function Face({ card }: { card: Card }) {
  return <span className="card-face-small"><CardArtwork card={card} /></span>;
}
function readSaved(key: string, fallback: string) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
interface Appearance { felt: string; roomImage: string; tableImage: string }
function initialAppearance(): Appearance {
  try { const saved = JSON.parse(readSaved('rummy-appearance', '{}')); return { felt: ['forest', 'ocean', 'wine'].includes(saved.felt) ? saved.felt : 'forest', roomImage: typeof saved.roomImage === 'string' && saved.roomImage.startsWith('data:image/') ? saved.roomImage : '', tableImage: typeof saved.tableImage === 'string' && saved.tableImage.startsWith('data:image/') ? saved.tableImage : '' }; }
  catch { return { felt: 'forest', roomImage: '', tableImage: '' }; }
}

function RummyPage() {
  const network = useRummyRoom();
  const { wallet } = useClubhouse();
  const ownsJokers = wallet?.owned.includes(JOKER_PERK) ?? false;
  const [practice, setPractice] = useState(false);
  const [name, setName] = useState(() => readSaved('rummy-name', 'Player'));
  const [mode, setMode] = useState<GameMode>('bot');
  const [variant, setVariant] = useState<Variant>('classic');
  const [seats, setSeats] = useState(2);
  const [level, setLevel] = useState<Level>('normal');
  const [jokers, setJokers] = useState(false);
  const [joinCode, setJoinCode] = useState(() => new URL(window.location.href).searchParams.get('room')?.toUpperCase() ?? '');
  const [notice, setNotice] = useState('');
  const [appearance, setAppearance] = useState(initialAppearance);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { if (variant === 'gin') setSeats(2); }, [variant]);
  useEffect(() => { if (!ownsJokers) setJokers(false); }, [ownsJokers]);
  useEffect(() => { try { localStorage.setItem('rummy-appearance', JSON.stringify(appearance)); } catch { /* Large custom images can remain session-only. */ } }, [appearance]);
  const felt = { forest: '#18513f', ocean: '#174b64', wine: '#632c40' }[appearance.felt] ?? '#18513f';
  const sceneStyle = { '--rummy-felt': felt, ...(appearance.tableImage ? { '--rummy-table-background': `url("${appearance.tableImage}")` } : {}), ...(appearance.roomImage ? { backgroundImage: `url("${appearance.roomImage}")` } : {}) } as CSSProperties;
  async function create() {
    setNotice('');
    try { localStorage.setItem('rummy-name', name); } catch { /* Optional preference. */ }
    await network.command({ operation: 'create', name, options: { mode, variant, seats, level, jokers: jokers && ownsJokers } });
  }
  async function image(file: File | undefined, kind: 'roomImage' | 'tableImage') {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2_000_000) { setNotice('Choose an image smaller than 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setAppearance(previous => ({ ...previous, [kind]: String(reader.result) }));
    reader.onerror = () => setNotice('That image could not be loaded.');
    reader.readAsDataURL(file);
  }
  async function invite() {
    const url = new URL('/games/rummy', window.location.origin); url.searchParams.set('room', network.room!.code);
    try { await navigator.clipboard.writeText(url.toString()); setNotice('Invitation link copied.'); }
    catch { setNotice(`Share room code ${network.room!.code} with your friends.`); }
  }
  return <div className="rummy-scene" style={sceneStyle}><HubNav /><main className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
    <CardGameHero title="Rummy+" symbol="♦" description="Find your rhythm. Make your meld. Classic, Gin & Rummy 500." active={Boolean(network.room) && !practice}>
      <div className="flex flex-wrap gap-2"><button aria-pressed={!practice} className={practice ? 'btn-ghost-gold text-sm' : 'btn-gold text-sm'} onClick={() => setPractice(false)}>Game table</button><button aria-pressed={practice} className={practice ? 'btn-gold text-sm' : 'btn-ghost-gold text-sm'} onClick={() => setPractice(true)}>Hand practice</button></div>
    </CardGameHero>
    <details className="card-appearance-panel"><summary className="cursor-pointer text-gold">Table appearance</summary>
      <div className="mt-3 grid gap-3 pb-2 sm:grid-cols-2"><label>Felt color<select aria-label="Felt color" value={appearance.felt} onChange={event => setAppearance({ ...appearance, felt: event.target.value, tableImage: '' })} className="ml-2 rounded-lg border border-border bg-background p-2"><option value="forest">Forest</option><option value="ocean">Ocean</option><option value="wine">Burgundy</option></select></label><button className="text-left text-gold underline" onClick={() => setAppearance({ felt: 'forest', roomImage: '', tableImage: '' })}>Reset appearance</button>
        <label>Room background<input aria-label="Room background image" className="mt-1 block w-full text-xs" type="file" accept="image/*" onChange={event => void image(event.target.files?.[0], 'roomImage')} /></label><label>Custom table surface<input aria-label="Table surface image" className="mt-1 block w-full text-xs" type="file" accept="image/*" onChange={event => void image(event.target.files?.[0], 'tableImage')} /></label></div><p className="pb-2 text-xs text-muted-foreground">Images stay in your browser. The outer wrapper is transparent so the room and table artwork remain visible.</p>
    </details>
    {(network.error || notice) && <p role={network.error ? 'alert' : 'status'} className="my-4 rounded-xl border border-border bg-background/80 p-3 text-sm">{network.error || notice}{network.code && <button className="ml-3 text-gold underline" onClick={() => void network.refresh()}>Reconnect / refresh</button>}</p>}
    {practice ? <RummyPractice /> : network.room ? <>
      <div className="card-room-bar">
        <span className="table-connection" data-connected={network.healthy}>{VARIANTS[network.room.variant].name} · {network.room.mode === 'bot' ? 'Vs computer' : network.room.mode === 'local' ? 'Pass and play' : `Room ${network.room.code}`} · {network.live ? 'Live table' : network.healthy ? 'Checking for updates' : 'Disconnected'}</span>
        <div className="flex gap-4">{network.room.mode === 'online' && <button className="text-gold underline" onClick={() => void invite()}>Copy invitation</button>}<button className="text-gold underline" onClick={() => setLeaving(true)}>Leave table</button></div>
      </div>
      {network.room.reward && <p role="status" className={`card-reward-note my-4 ${network.room.reward.status === 'credited' ? 'border-gold text-gold' : 'border-border'}`}>{network.room.reward.message}{network.room.reward.status === 'credited' && <Link to="/store" className="ml-3 underline">View reward wallet</Link>}</p>}
      {network.room.status === 'waiting' ? <section className="rummy-table mx-auto max-w-4xl p-8 sm:p-12" aria-label="Multiplayer lobby">
        <h2 className="font-display text-3xl text-gold">Your table is waiting</h2><p className="mt-2">Share code <strong className="tracking-widest text-gold">{network.room.code}</strong>. {network.room.players.length} of {network.room.capacity} seats filled.</p>
        <ul className="my-6 grid gap-3 sm:grid-cols-2">{network.room.players.map(player => <li key={player.id} className="rounded-xl bg-black/25 px-4 py-3">{player.name}{player.you ? ' (you)' : ''} <span className="float-right text-sm text-gold">{player.ready ? 'Ready' : 'Not ready'}</span></li>)}</ul>
        <div className="flex flex-wrap gap-3"><button className="btn-ghost-gold" disabled={network.pending} onClick={() => void network.command({ operation: 'ready', code: network.room!.code, ready: !network.room!.players[network.room!.mySeat ?? 0]!.ready })}>{network.room.players[network.room.mySeat ?? 0]?.ready ? 'Not ready' : 'Ready to play'}</button>{network.room.owner && <button className="btn-gold" disabled={network.pending || network.room.players.length !== network.room.capacity || network.room.players.some(player => !player.ready)} onClick={() => void network.command({ operation: 'start', code: network.room!.code, revision: network.room!.revision })}>Start game</button>}</div>
      </section> : <GameTable key={`${network.room.code}:${network.room.round}`} room={network.room} pending={network.pending || !network.healthy} send={async move => network.command({ operation: 'move', code: network.room!.code, revision: network.room!.revision, requestId: crypto.randomUUID(), move })} />}
      {leaving && <LeaveTableDialog pending={network.pending} active={network.room.status === 'playing'} close={() => setLeaving(false)} confirm={async () => { if (await network.command({ operation: 'leave', code: network.room!.code })) setLeaving(false); }} />}
    </> : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.6fr)]">
      <section className="rummy-table p-7 sm:p-12" aria-label="Start a Rummy game"><p className="spades-eyebrow mb-2">A good hand starts here</p><h2 className="font-display text-3xl text-gold">Take a seat</h2><p className="mt-2 text-sm">Play a full match, take turns on one device, or invite friends to a private table.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm">Your name<input aria-label="Your name" value={name} onChange={event => setName(event.target.value)} maxLength={24} className="rummy-input mt-1" /></label>
          <label className="text-sm">Play mode<select aria-label="Play mode" value={mode} onChange={event => setMode(event.target.value as GameMode)} className="rummy-input mt-1"><option value="bot">Vs computer</option><option value="local">Pass and play</option><option value="online">Online with friends</option></select></label>
          <label className="text-sm">Rummy variant<select aria-label="Rummy variant" value={variant} onChange={event => setVariant(event.target.value as Variant)} className="rummy-input mt-1">{Object.entries(VARIANTS).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Players<select aria-label="Players" value={seats} onChange={event => setSeats(Number(event.target.value))} className="rummy-input mt-1">{Array.from({ length: variant === 'gin' ? 1 : 3 }, (_, i) => <option value={i + 2} key={i}>{i + 2}</option>)}</select></label>
          {mode === 'bot' && <label className="text-sm">Computer level<select aria-label="Computer level" value={level} onChange={event => setLevel(event.target.value as Level)} className="rummy-input mt-1">{Object.entries(LEVELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
          <div className="self-end pb-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" aria-label="Joker Mode" checked={jokers} disabled={!ownsJokers} onChange={event => setJokers(event.target.checked)} />Joker Mode</label>{!ownsJokers && <Link to="/store" className="mt-1 inline-block text-xs text-gold underline">Unlock for 800 Rummy+ points</Link>}</div>
        </div><button className="btn-gold mt-6" disabled={network.pending || name.trim().length < 2} onClick={() => void create()}>{network.pending ? 'Setting the table…' : mode === 'online' ? 'Create online room' : 'Start game'}</button>
      </section>
      <section className="card-side-panel"><h2 className="font-display text-2xl text-gold">Join a friend</h2><label className="mt-4 block text-sm">Room code<input aria-label="Room code" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8))} maxLength={8} className="rummy-input mt-1 font-mono uppercase tracking-widest" placeholder="8-character code" /></label><button className="btn-ghost-gold mt-4" disabled={network.pending || joinCode.length !== 8 || name.trim().length < 2} onClick={() => void network.command({ operation: 'join', code: joinCode, name })}>Join room</button><p className="mt-4 text-xs text-muted-foreground">Guest play works without an account. Reopening this page in the same browser resumes your saved table. Online players see only their own hand.</p></section>
    </div>}
    <p className="my-6 text-xs text-muted-foreground">Eligible signed-in match wins earn wallet points. Guest, practice, and pass-and-play games are unranked. Convert game points to Clubhouse Cash in the store.</p>
  </main></div>;
}

function LeaveTableDialog({ pending, active, close, confirm }: { pending: boolean; active: boolean; close: () => void; confirm: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby="leave-title" onCancel={event => { if (pending) event.preventDefault(); else close(); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-background p-6 text-foreground backdrop:bg-black/70"><h2 id="leave-title" className="font-display text-2xl text-gold">Leave this table?</h2><p className="mt-3 text-sm">{active ? 'Leaving ends this game for everyone. No winner or rewards will be declared.' : 'You can join another table or start a new game.'}</p><div className="mt-5 flex gap-3"><button className="btn-gold" disabled={pending} onClick={() => void confirm()}>Confirm leave</button><button className="btn-ghost-gold" disabled={pending} onClick={close}>Stay</button></div></dialog>;
}

function GameTable({ room, pending, send }: { room: RoomView; pending: boolean; send: (move: Move) => Promise<boolean> }) {
  const [selected, setSelected] = useState<Card[]>([]);
  const [order, setOrder] = useState<Card[]>(room.hand);
  const [history, setHistory] = useState<Card[][]>([]);
  const [revealed, setRevealed] = useState('');
  const [notice, setNotice] = useState('');
  const fingerprint = [...room.hand].sort().join(',');
  const turnKey = `${room.round}:${room.turn}`;
  const ended = ['roundOver', 'gameOver'].includes(room.phase ?? '') || room.status === 'abandoned';
  const visible = room.mode !== 'local' || revealed === turnKey || ended;
  const yourTurn = room.status === 'playing' && room.mySeat === room.turn && visible;
  const canAct = yourTurn && !pending;
  useEffect(() => { setSelected([]); setHistory([]); setOrder(previous => [...previous.filter(card => room.hand.includes(card)), ...room.hand.filter(card => !previous.includes(card))]); }, [fingerprint, room.mySeat]);
  const hand = [...order.filter(card => room.hand.includes(card)), ...room.hand.filter(card => !order.includes(card))];
  const analysis = useMemo(() => analyseHand(fingerprint ? fingerprint.split(',') : [], room.variant), [fingerprint, room.variant]);
  function arrange(cards: Card[], text: string) { if (cards.length !== hand.length || new Set(cards).size !== hand.length || cards.some(card => !hand.includes(card))) return; setHistory(previous => [...previous.slice(-19), hand]); setOrder(cards); setNotice(text); }
  async function act(move: Move) { if (await send(move)) { setSelected([]); setNotice(''); } }
  const card = selected.length === 1 ? selected[0] : undefined;
  const canDiscard = canAct && room.phase === 'play' && card && card !== room.drewDiscard && !room.mustUse;
  const knockDebt = room.variant === 'gin' && card ? bestArrangement(room.hand.filter(value => value !== card), 'gin').dw : Infinity;
  const pickupState = { variant: room.variant, opening: room.opening, turn: room.turn, discard: room.discard, melds: room.melds, hands: room.players.map((_, i) => i === room.mySeat ? room.hand : []) };
  return <section className="rummy-table p-4 sm:p-8 lg:px-12" aria-label="Rummy playing table">
    <div className="table-round-bar"><span>Round {room.round} · Target {room.target}</span><strong role="status" className="text-gold">{room.status === 'abandoned' ? 'Table closed — game ended without a winner' : room.phase === 'gameOver' ? `${room.players[room.winner!]!.name} wins the match!` : room.phase === 'roundOver' ? 'Round over' : yourTurn ? 'Your turn' : `${room.players[room.turn]?.name}’s turn`}</strong></div>
    <ul className="rummy-player-list" aria-label="Players and scores">{room.players.map((player, i) => <li key={player.id} className="clubhouse-player" data-active={room.turn === i && !ended}><div className="clubhouse-player-top"><PlayerMedallion name={player.name} bot={player.bot} seat={i}/><div><span className="player-name">{player.name}{player.you && room.mode !== 'local' ? ' (you)' : ''}</span><span className="player-subtitle">{player.bot ? 'Computer' : 'Clubhouse player'}{room.dealer === i ? ' · dealer' : ''}</span></div></div><div className="player-score-line"><b>{player.score}</b> points <span>· {player.count} cards</span></div></li>)}</ul>
    <div className="rummy-pile-arena" aria-label="Stock and discard piles"><div className="rummy-pile-crest"><TableCrest symbol="♦" /></div><div className="rummy-pile"><button className="rummy-stock-card disabled:opacity-65" aria-label="Draw from stock" disabled={!canAct || room.phase !== 'draw' || ['first', 'dealer'].includes(room.opening ?? '')} onClick={() => void act({ t: 'draw', from: 'stock' })}><CardArtwork back /></button><p className="mt-1 text-xs">Stock · {room.stockCount}</p></div>
      <div className="rummy-pile"><button aria-label="Take top discard" disabled={!canAct || room.phase !== 'draw' || !canTakeDiscard(pickupState)} onClick={() => void act({ t: 'draw', from: 'discard' })} className="rounded-lg disabled:opacity-70">{room.discard.length ? <Face card={room.discard.at(-1)!} /> : <span className="inline-block h-20 w-14 rounded-lg border border-white/30" />}</button><p className="mt-1 text-xs">Discard · {room.discard.length}</p></div>
      {canAct && ['first', 'dealer'].includes(room.opening ?? '') && <button className="btn-ghost-gold text-sm" disabled={pending} onClick={() => void act({ t: 'pass' })}>Pass opening upcard</button>}
    </div>
    {room.variant === 'r500' && room.discard.length > 1 && <details className="my-3 text-sm"><summary className="cursor-pointer text-gold">Choose from discard pile (use the chosen card this turn)</summary><div className="mt-2 flex max-w-full gap-2 overflow-x-auto p-2">{room.discard.map((discard, index) => <button key={discard} aria-label={`Take discard pile from ${cardLabel(discard)}`} disabled={!canAct || room.phase !== 'draw' || !canTakeDiscard(pickupState, index)} onClick={() => void act({ t: 'draw', from: 'discard', index })}><Face card={discard} /></button>)}</div></details>}
    <div className="rummy-meld-area" aria-label="Table melds"><h2 className="mb-2 font-display text-xl text-gold">{room.variant === 'gin' ? 'Gin melds stay in your hand' : 'Table melds'}</h2>{room.melds.length ? <div className="flex flex-wrap gap-4">{room.melds.map((meld, index) => <div key={index} className="max-w-full"><div className="flex max-w-full gap-1 overflow-x-auto">{meld.cards.map(({ c }) => <Face key={c} card={c} />)}</div><button className="mt-2 text-sm text-gold underline disabled:opacity-50" disabled={!canAct || room.phase !== 'play' || !card || !canLayOff(card, meld, room.variant)} onClick={() => card && void act({ t: 'layoff', card, meld: index })}>Lay off on meld {index + 1}</button></div>)}</div> : <p className="text-sm text-foreground/75">{room.variant === 'gin' ? 'After drawing, select one card to discard. Knock with ten or fewer deadwood points, or go Gin.' : 'Select three or more matching cards, then choose Meld selected.'}</p>}</div>
    {room.roundResult && <section className="my-4 rounded-2xl border border-gold/50 bg-black/30 p-4" aria-label="Round result"><h2 className="font-display text-2xl text-gold">{room.phase === 'gameOver' ? 'Match complete' : 'Round result'}</h2><p className="mt-2">{room.roundResult.note}</p><ul className="mt-2 flex flex-wrap gap-4 text-sm">{room.roundResult.points.map((points, i) => <li key={i}>{room.players[i]!.name}: {points >= 0 ? '+' : ''}{points}</li>)}</ul>{room.phase === 'roundOver' && room.owner && room.status === 'playing' && <button className="btn-gold mt-4" disabled={pending} onClick={() => void act({ t: 'next' })}>Next round</button>}{room.phase === 'roundOver' && !room.owner && <p className="mt-3 text-sm text-muted-foreground">Waiting for the host to start the next round.</p>}</section>}
    {room.revealedHands && <details className="my-4 text-sm"><summary className="cursor-pointer text-gold">Revealed hands</summary>{room.revealedHands.map((cards, i) => <p key={i} className="mt-2 break-words">{room.players[i]!.name}: {cards.map(compact).join(' · ') || 'Empty hand'}</p>)}</details>}
    {!visible ? <div role="region" className="my-6 rounded-2xl border border-gold/40 bg-black/30 p-8 text-center" aria-label="Pass and play privacy screen"><h2 className="font-display text-3xl text-gold">Pass the device to {room.players[room.turn]!.name}</h2><p className="my-3 text-sm">The next hand stays covered until its player is ready.</p><button className="btn-gold" onClick={() => setRevealed(turnKey)}>Reveal my hand</button></div> : <div className="game-hand-section min-w-0"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl text-gold">{room.mode === 'local' ? `${room.players[room.mySeat ?? 0]!.name}’s hand` : 'Your hand'}</h2><span className="text-xs">{analysis.optimal ? 'Lowest' : 'Suggested'} deadwood: {analysis.dw}</span></div>
      <div className="hand-toolbar"><button className="btn-ghost-gold text-sm" onClick={() => arrange([...analysis.melds.flat(), ...analysis.deadwood], 'Hand grouped into suggested melds.')}>Best sort</button><button className="btn-ghost-gold text-sm" onClick={() => arrange(sortHandBySuit(hand), 'Sorted by suit.')}>Sort by suit</button><button className="btn-ghost-gold text-sm" onClick={() => arrange(sortHandByRank(hand), 'Sorted by rank.')}>Sort by rank</button><button className="btn-ghost-gold text-sm" disabled={!history.length} onClick={() => { const last = history.at(-1)!; setOrder(last); setHistory(previous => previous.slice(0, -1)); setNotice('Arrangement restored.'); }}>Undo arrangement</button></div>
      <p className="text-xs text-foreground/75">Click or tap cards to select them for a move. Enter selects a focused card; Space picks it up for reordering.</p><RummyHand compact key={`${room.mySeat}:${room.round}`} cards={hand} onReorder={cards => arrange(cards, 'Hand reordered.')} selectedCards={selected} onToggleCard={card => setSelected(previous => previous.includes(card) ? previous.filter(value => value !== card) : [...previous, card])} />
      {room.mustUse && <p role="status" className="my-2 text-sm text-gold">Use {compact(room.mustUse)} in a meld or layoff before discarding.</p>}
      <div className="table-action-bar" aria-label="Turn actions"><button className="btn-gold" disabled={!canDiscard} onClick={() => card && void act({ t: 'discard', card })}>Discard selected</button>{room.variant === 'gin' ? <button className="btn-gold" disabled={!canDiscard || knockDebt > 10} onClick={() => card && void act({ t: 'discard', card, knock: true })}>{knockDebt === 0 ? 'Go Gin' : 'Knock'}</button> : <button className="btn-gold" disabled={!canAct || room.phase !== 'play' || selected.length < 3 || !isMeld(selected, room.variant)} onClick={() => void act({ t: 'meld', cards: selected })}>Meld selected</button>}<button className="btn-ghost-gold" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection ({selected.length})</button></div><p className="mt-3 min-h-6 text-sm text-gold" role="status">{notice}</p>
    </div>}
    <details className="mt-5 border-t border-white/15 pt-3 text-sm"><summary className="cursor-pointer text-gold">Recent moves and rules</summary><ol className="my-3 space-y-1 text-xs">{room.log.map((line, i) => <li key={i}>{line}</li>)}</ol><p className="text-xs text-foreground/75">{VARIANTS[room.variant].summary} A picked-up discard cannot be discarded straight back. Rummy 500 discard pickups must be used in a meld or layoff. Gin has a 25-point Gin/undercut bonus; the final two stock cards end a round without points. The host advances rounds. Leaving an active table ends the game. Large hands above 20 cards use a fast legal meld suggestion.</p></details>
  </section>;
}
