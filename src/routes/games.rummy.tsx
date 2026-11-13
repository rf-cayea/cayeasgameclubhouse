import {RewardCrates} from '@/components/DiceCrateRewards';
import { MultiplayerLobby, MatchMakingButton } from '@/components/MultiplayerLobby';
import { RUMMY_DESIGNS } from '@/lib/rummy-cosmetics';
import { CardSetupArtwork } from '@/components/CardSetupArtwork';
import { RummyTableMelds, RummyCallOffer } from '@/components/RummyTableMelds';
import { useCardGameMusic, CardGameMusicButton, CardGameMusicPanel } from '@/components/CardGameMusic';
import { smartRummySort } from '@/lib/rummy-smart-sort';
import { useRummySound, useRummyAnnouncement } from '@/lib/use-rummy-announcements';
import { RummyAnnouncement } from '@/components/RummyAnnouncement';
import { FarkleAudioIcon } from '@/components/FarkleSoundControls';
import '@/styles/rummy-enhancements.css';
import { FriendInvitePanel } from '@/components/FriendInvitePanel';
import { RoomConnectionDetails } from '@/components/RoomConnectionDetails';
import { usePlayerProfile } from '@/lib/social';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { rememberedComputerLevel, rememberComputerLevel } from '@/lib/computer-modes';
import { GameHeader, GamePanel } from '@/components/GameChrome';
import { RummyCollection, useRummyAppearance } from '@/components/RummyCollection';
import { rummyDesign } from '@/lib/rummy-cosmetics';
import { CardDragTable, CardDropZone } from '@/components/CardDragTable';
import { rummyDropAction } from '@/lib/card-drag';
import { RummyHand } from '@/components/RummyHand';
import { RummyPractice } from '@/components/RummyPractice';
import { CardArtwork, CardDeckProvider } from '@/components/CardArtwork';
import { rummyDeck } from '@/lib/card-decks';
import { PlayerMedallion, TableCrest } from '@/components/CardTableParts';
import { cardLabel } from '@/lib/hand-order';
import { analyseHand, canLayOff, canTakeDiscard } from '@/lib/rummy-engine';
import { bestArrangement, isMeld, JOKER_PERK, LEVELS, sortHandByRank, sortHandBySuit, VARIANTS, type Card, type Level, type Move, type PublicPlay, type Variant } from '@/lib/rummy';
import { useRummyRoom } from '@/lib/rummy-network';
import type { GameMode, RoomView } from '@/lib/rummy-protocol';
import { useClubhouse } from '@/lib/clubhouse';

export const Route = createFileRoute('/games/rummy')({
  validateSearch: (search: Record<string, unknown>): { room?: string } => ({ room: typeof search.room === 'string' && /^[a-f0-9]{8}$/i.test(search.room) ? search.room.toUpperCase() : undefined }),
  head: () => ({ meta: [{ title: "Rummy+ — Cayea's Game Clubhouse" }] }), component: RummyPage,
});

const compact = (card: Card) => card.startsWith('X') ? `Joker ${card[1]}` : `${card[0] === 'T' ? '10' : card[0]}${({ S: '♠', H: '♥', D: '♦', C: '♣' } as Record<string, string>)[card[1]!]}`;
function playDescription(play: PublicPlay) {
  const cards = play.cards.map(compact).join(' · ');
  switch (play.kind) {
    case 'stock': return 'Drew from stock';
    case 'pickup': return `Picked up ${cards}`;
    case 'meld': return `Melded ${cards}`;
    case 'rummy': return `Called Rummy on ${cards} · meld ${(play.meld ?? 0) + 1}`;
    case 'layoff': return `Laid off ${cards} on meld ${(play.meld ?? 0) + 1}`;
    case 'discard': return `Discarded ${cards}`;
    case 'pass': return 'Passed the opening upcard';
  }
}
function Face({ card }: { card: Card }) {
  return <span className="card-face-small"><CardArtwork card={card} /></span>;
}
function readSaved(key: string, fallback: string) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
interface Appearance { felt: string; tableImage: string; plainFelt?: boolean }
function initialAppearance(): Appearance {
  try { const saved = JSON.parse(readSaved('rummy-appearance', '{}')); return { plainFelt: saved.plainFelt === true, felt: ['forest', 'ocean', 'wine'].includes(saved.felt) ? saved.felt : 'forest', tableImage: typeof saved.tableImage === 'string' && saved.tableImage.startsWith('data:image/') ? saved.tableImage : '' }; }
  catch { return { felt: 'forest', tableImage: '' }; }
}

function RummyPage() {
  const incomingRoom = Route.useSearch().room;
  const music = useCardGameMusic();
  const sound = useRummySound();
  const [tableOpen, setTableOpen] = useState(false), [cratesOpen,setCratesOpen]=useState(false);
  const network = useRummyRoom();
  const { user, wallet } = useClubhouse();
  const profile = usePlayerProfile(user?.id ?? null);
  const collection = useRummyAppearance(user?.id ?? null, network.room?.status === 'finished' ? `${network.room.code}:${network.room.revision}` : '');
  const [appearanceOpen, setAppearanceOpen] = useState(false), [joinOpen, setJoinOpen] = useState(false);
  const ownsJokers = wallet?.owned.includes(JOKER_PERK) ?? false;
  const [practice, setPractice] = useState(false);
  const [name, setName] = useState(() => readSaved('rummy-name', 'Player'));
  const [mode, setMode] = useState<GameMode>('bot');
  const [variant, setVariant] = useState<Variant>('classic');
  const [seats, setSeats] = useState(2);
  const [level, setLevel] = useState<Level>(rememberedComputerLevel('rummy'));
  const [jokers, setJokers] = useState(false);
  const [joinCode, setJoinCode] = useState(() => new URL(window.location.href).searchParams.get('room')?.toUpperCase() ?? '');
  const [notice, setNotice] = useState('');
  const [appearance, setAppearance] = useState(initialAppearance);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { if (variant === 'gin') setSeats(2); }, [variant]);
  useEffect(() => { if (!ownsJokers) setJokers(false); }, [ownsJokers]);
  useEffect(() => { try { localStorage.setItem('rummy-appearance', JSON.stringify(appearance)); } catch { /* Large custom images can remain session-only. */ } }, [appearance]);
  useEffect(() => { if (profile.data) setName(profile.data.gamerName); }, [profile.data?.gamerName, user?.id]);
  useEffect(() => {
    if (!incomingRoom) return;
    setJoinCode(incomingRoom);
    if (network.code === incomingRoom) setJoinOpen(false);
    else if (!network.code) setJoinOpen(true);
    else if (network.code !== incomingRoom) setNotice('Another table is saved in this browser. Leave it before joining the invited table.');
  }, [incomingRoom, network.code]);
  const felt = { forest: '#18513f', ocean: '#174b64', wine: '#632c40' }[appearance.felt] ?? '#18513f';
  const tableDesign = rummyDesign(collection.data.equipped.table, 'table');
  const tableImage = appearance.tableImage || tableDesign.image;
  const sceneStyle = { '--table-surface-size': !appearance.tableImage ? tableDesign.backgroundSize ?? 'cover' : 'cover', '--rummy-felt': felt, '--rummy-table-background': appearance.plainFelt && !appearance.tableImage ? felt : !appearance.tableImage && tableDesign.surface ? tableDesign.surface : `linear-gradient(#09271b28, #09271b28), url("${tableImage}")` } as CSSProperties;
  async function create() {
    setNotice('');
    try { !user && localStorage.setItem('rummy-name', name); } catch { /* Optional preference. */ }
    await network.command({ operation: 'create', name, options: { mode, variant, seats, level, jokers: jokers && ownsJokers } });
  }
  async function image(file: File | undefined, kind: 'tableImage') {
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
  return <CardDeckProvider deck={rummyDeck(collection.data.equipped.deck)}><div className="rummy-scene game-viewport rummy-viewport" style={sceneStyle} onPointerDownCapture={()=>{sound.unlock();music.unlock();}} onKeyDownCapture={()=>{sound.unlock();music.unlock();}}><GameHeader title="Rummy+"><button className="dice-crate-entry" aria-label="Rewards crates" onClick={()=>setCratesOpen(true)}>🎁<span className="dice-crate-label"> Rewards</span></button><button aria-label="Artwork & rewards" onClick={() => setAppearanceOpen(true)}>Artwork</button>{!practice && network.room && <button onClick={() => setTableOpen(true)}>{network.room.mode === 'online' ? 'Invite' : 'Table'}</button>}{practice ? <button onClick={() => setPractice(false)}>Game table</button> : network.room ? <button aria-label="Leave table" onClick={() => setLeaving(true)}>Leave</button> : <><button aria-label="Hand practice" onClick={() => setPractice(true)}>Practice</button><button onClick={() => setJoinOpen(true)}>Join</button></>}<CardGameMusicButton music={music}/></GameHeader><CardGameMusicPanel music={music}/><main className="mx-auto max-w-7xl px-3 py-6 sm:px-6"><div className="table-play-stage" aria-label="Rummy table surface">
    {cratesOpen&&<GamePanel title="Card-deck reward crates" close={()=>setCratesOpen(false)}><RewardCrates collection="cards"/></GamePanel>}
    {tableOpen && <GamePanel title="Rummy+ table & invitations" close={() => setTableOpen(false)}>{network.room?.mode === 'online' && <><button className="btn-gold" onClick={() => void invite()}>Copy invitation link</button><FriendInvitePanel userId={user?.id ?? null} game="rummy" code={network.room.code}/></>}<RoomConnectionDetails game="rummy" connection={network}/><Link to="/profile" className="mt-4 inline-block text-gold underline">Edit your gamer name</Link></GamePanel>}
    {appearanceOpen && <GamePanel title="Rummy+ artwork & rewards" close={() => setAppearanceOpen(false)}><RummyCollection ownedOnly collection={collection} onEquip={slot => { if (slot === 'table') setAppearance(previous => ({ ...previous, tableImage: '', plainFelt: false })); }}/><details className="card-appearance-panel"><summary>Use your own images</summary><div className="mt-3 grid gap-3"><label>Plain felt color<select aria-label="Felt color" value={appearance.felt} onChange={event => setAppearance(previous => ({ ...previous, felt: event.target.value, tableImage: '', plainFelt: true }))} className="rummy-input"><option value="forest">Forest</option><option value="ocean">Ocean</option><option value="wine">Burgundy</option></select></label><label>Custom table surface<input aria-label="Table surface image" className="mt-1 block w-full text-xs" type="file" accept="image/*" onChange={event => void image(event.target.files?.[0], 'tableImage')} /></label><button className="btn-ghost-gold" onClick={() => setAppearance({ felt: 'forest', tableImage: '' })}>Use collected artwork</button></div><p className="mt-3 text-xs">Custom images stay in this browser. Earned designs and your selected artwork are saved to your account.</p></details></GamePanel>}
    {(network.error || notice) && <p role={network.error ? 'alert' : 'status'} className="my-4 rounded-xl border border-border bg-background/80 p-3 text-sm">{network.error || notice}{network.code && <button className="ml-3 text-gold underline" onClick={() => void network.refresh()}>Reconnect / refresh</button>}</p>}
    {practice ? <RummyPractice /> : network.room ? <>
      <div className="card-room-bar game-connection-bar">
        <span className="table-connection" data-connected={network.healthy}>{VARIANTS[network.room.variant].name} · {network.room.mode === 'bot' ? 'Vs computer' : network.room.mode === 'local' ? 'Pass and play' : `Room ${network.room.code}`} · {network.live ? 'Live table' : network.healthy ? 'Checking for updates' : 'Disconnected'}</span>
        <div className="flex gap-4">{network.room.mode === 'online' && <button className="text-gold underline" onClick={() => void invite()}>Copy invitation</button>}<button className="text-gold underline" onClick={() => setLeaving(true)}>Leave table</button></div>
      </div>
      {network.room.reward && ['pending', 'credited'].includes(network.room.reward.status) && <p role="status" className={`card-reward-note my-4 ${network.room.reward.status === 'credited' ? 'border-gold text-gold' : 'border-border'}`}>{network.room.reward.message}{network.room.reward.status === 'credited' && <Link to="/store" className="ml-3 underline">View reward wallet</Link>}</p>}
      {collection.unlocked.length > 0 && <div className="game-art-reward" role="status">Artwork earned: {collection.unlocked.join(', ')}.<button onClick={() => setAppearanceOpen(true)}>View reward</button><button aria-label="Dismiss artwork reward" onClick={collection.dismissUnlocks}>×</button></div>}
      {network.room.status === 'waiting' ? <MultiplayerLobby game="rummy" code={network.room.code} owner={network.room.owner} capacity={network.room.capacity} players={network.room.players} pending={network.pending || !network.healthy} details={`${VARIANTS[network.room.variant].name} · ${network.room.capacity} players${network.room.jokers?' · Joker Mode':''}`} onReady={()=>void network.command({operation:'ready',code:network.room!.code,ready:!network.room!.players.find(player=>player.you)?.ready})} onStart={()=>void network.command({operation:'start',code:network.room!.code,revision:network.room!.revision})} onLeave={()=>setLeaving(true)}/> : <GameTable sound={sound} key={`${network.room.code}:${network.room.round}`} room={network.room} pending={network.pending || !network.healthy} send={async move => network.command({ operation: 'move', code: network.room!.code, revision: network.room!.revision, requestId: crypto.randomUUID(), move })} />}
      {leaving && <LeaveTableDialog pending={network.pending} active={network.room.status === 'playing'} close={() => setLeaving(false)} confirm={async () => { if (await network.command({ operation: 'leave', code: network.room!.code })) setLeaving(false); }} />}
    </> : <div className="rummy-setup-grid grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.6fr)]">
      <section className="rummy-table rummy-setup-table p-7 sm:p-12" aria-label="Start a Rummy game"><p className="spades-eyebrow mb-2">A good hand starts here</p><h2 className="font-display text-3xl text-gold">Take a seat</h2><p className="mt-2 text-sm">Play a full match, take turns on one device, or invite friends to a private table.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm">Your name<input aria-label="Your name" value={name} readOnly={Boolean(user)} onChange={event => setName(event.target.value)} maxLength={24} className="rummy-input mt-1" /></label>
          <label className="text-sm">Play mode<select aria-label="Play mode" value={mode} onChange={event => setMode(event.target.value as GameMode)} className="rummy-input mt-1"><option value="bot">Vs computer</option><option value="local">Pass and play</option><option value="online">Online with friends</option></select></label>
          <label className="text-sm">Rummy variant<select aria-label="Rummy variant" value={variant} onChange={event => setVariant(event.target.value as Variant)} className="rummy-input mt-1">{Object.entries(VARIANTS).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Players<select aria-label="Players" value={seats} onChange={event => setSeats(Number(event.target.value))} className="rummy-input mt-1">{Array.from({ length: variant === 'gin' ? 1 : 3 }, (_, i) => <option value={i + 2} key={i}>{i + 2}</option>)}</select></label>
          {mode === 'bot' && <label className="text-sm">Computer level<select aria-label="Computer level" value={level} onChange={event => { rememberComputerLevel('rummy', event.target.value); setLevel(event.target.value as Level); }} className="rummy-input mt-1">{Object.entries(LEVELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
          <div className="self-end pb-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" aria-label="Joker Mode" checked={jokers} disabled={!ownsJokers} onChange={event => setJokers(event.target.checked)} />Joker Mode</label>{!ownsJokers && <Link to="/store" hash="rummy-jokers" className="mt-1 inline-block text-xs text-gold underline">Unlock for 500 Rummy+ points or 385 Cash</Link>}</div>
        </div><CardSetupArtwork tables={RUMMY_DESIGNS.filter(item => item.slot === 'table' && collection.data.owned.includes(item.id))} decks={RUMMY_DESIGNS.filter(item => item.slot === 'deck' && collection.data.owned.includes(item.id))} table={collection.data.equipped.table} deck={collection.data.equipped.deck} disabled={collection.busy || network.pending} onTable={id => { void collection.equip('table', id).then(ok => { if (ok) setAppearance(previous => ({...previous, tableImage: '', plainFelt: false})); }); }} onDeck={id => { void collection.equip('deck', id); }} preview={<CardArtwork card="KS" deck={rummyDeck(collection.data.equipped.deck)}/>}/>{collection.error && <p role="alert">{collection.error}</p>}<p className="setup-reward-note">{user ? 'Full-match wins unlock artwork automatically.' : <Link to="/auth" className="text-gold underline">Sign in before playing to earn points and artwork.</Link>}</p><div className="multiplayer-start-actions"><button className="btn-gold mt-6" disabled={network.pending || collection.busy || name.trim().length < 2} onClick={() => void create()}>{network.pending ? 'Setting the table…' : mode === 'online' ? 'Create online room' : 'Start game'}</button><MatchMakingButton game="rummy"/></div>
      </section>

    </div>}
    {joinOpen && <GamePanel title="Join a Rummy+ friend" close={() => setJoinOpen(false)}>      <section className="card-side-panel"><h2 className="font-display text-2xl text-gold">Join a friend</h2><label className="mt-4 block text-sm">Room code<input aria-label="Room code" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8))} maxLength={8} className="rummy-input mt-1 font-mono uppercase tracking-widest" placeholder="8-character code" /></label><button className="btn-ghost-gold mt-4" disabled={network.pending || Boolean(network.code && network.code !== joinCode) || joinCode.length !== 8 || name.trim().length < 2} onClick={async () => { if (await network.command({ operation: 'join', code: joinCode, name })) setJoinOpen(false); }}>Join room</button><p className="mt-4 text-xs text-muted-foreground">Guest play works without an account. Reopening this page in the same browser resumes your saved table. Online players see only their own hand.</p>{network.code && network.code !== joinCode && <p role="status" className="mt-3 text-gold">Leave your saved table before joining this invitation.</p>}{network.error && <p role="alert" className="mt-3 text-destructive">{network.error}</p>}</section></GamePanel>}
    <p className="game-footnote my-6 text-xs text-muted-foreground">Eligible signed-in match wins earn wallet points. Guest, practice, and pass-and-play games are unranked. Convert game points to Clubhouse Cash in the store.</p>
  </div></main></div></CardDeckProvider>;
}

function LeaveTableDialog({ pending, active, close, confirm }: { pending: boolean; active: boolean; close: () => void; confirm: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby="leave-title" onCancel={event => { if (pending) event.preventDefault(); else close(); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-background p-6 text-foreground backdrop:bg-black/70"><h2 id="leave-title" className="font-display text-2xl text-gold">Leave this table?</h2><p className="mt-3 text-sm">{active ? 'Leaving ends this game for everyone. No winner or rewards will be declared.' : 'You can join another table or start a new game.'}</p><div className="mt-5 flex gap-3"><button className="btn-gold" disabled={pending} onClick={() => void confirm()}>Confirm leave</button><button className="btn-ghost-gold" disabled={pending} onClick={close}>Stay</button></div></dialog>;
}

function GameTable({ room, pending, send, sound }: { sound: ReturnType<typeof useRummySound>; room: RoomView; pending: boolean; send: (move: Move) => Promise<boolean> }) {
  const [selected, setSelected] = useState<Card[]>([]);
  const [order, setOrder] = useState<Card[]>(room.hand);
  const [history, setHistory] = useState<Card[][]>([]);
  const [revealed, setRevealed] = useState('');
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<'melds' | 'tools' | 'round' | 'rules' | 'plays' | null>(null);
  const roundCall = useRummyAnnouncement(room, sound);
  useEffect(() => { if (roundCall.busy) setPanel(null); else if (room.roundResult) setPanel('round'); }, [room.round, room.phase, roundCall.busy]);
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
  function smartSort() { const result = smartRummySort(hand, room.variant); arrange(result.cards, `${result.melds.length} meld groups · ${result.nearMelds.length} promising pairs · ${result.dw} deadwood. Highest isolated cards are last.`); }
  async function act(move: Move) { const result = await send(move); if (result) { setSelected([]); setNotice(''); setPanel(null); } return result; }
  const card = selected.length === 1 ? selected[0] : undefined;
  const validMeld = isMeld(selected, room.variant);
  const meldHint = !ended && room.variant !== 'gin' && selected.length >= 3
    ? !yourTurn ? 'Wait for your turn to meld.' : room.phase === 'draw' ? 'Draw a card before melding.'
      : !validMeld ? 'Choose equal ranks or consecutive cards of one suit.' : 'Valid meld selected.'
    : '';
  const canDiscard = canAct && room.phase === 'play' && card && card !== room.drewDiscard && !room.mustUse;
  const knockDebt = room.variant === 'gin' && card ? bestArrangement(room.hand.filter(value => value !== card), 'gin').dw : Infinity;
  const pickupState = { variant: room.variant, opening: room.opening, turn: room.turn, discard: room.discard, melds: room.melds, hands: room.players.map((_, i) => i === room.mySeat ? room.hand : []) };
  const dropAction = (target: string, anchor: Card, group: Card[]) => rummyDropAction(room, target, anchor, group, canAct);
  async function drop(target: string, anchor: Card, group: Card[]) {
    const action = dropAction(target, anchor, group);
    if (!action) return false;
    if ('chooseMeld' in action) {
      setSelected([action.chooseMeld]); setPanel('melds'); setNotice('This card fits more than one meld. Choose the meld to extend.'); return true;
    }
    const ok = await act(action.move);
    if (ok && action.move.t === 'discard') setNotice(`Discarded ${compact(anchor)}.`);
    return ok;
  }
  return <CardDragTable cards={visible ? hand : []} selected={selected} dragKey={`${room.code}:${room.revision}:${visible}:${pending}`} fit onDrop={drop} onRejected={setNotice}><section className="rummy-table rummy-live-table p-4 sm:p-8 lg:px-12" aria-label="Rummy playing table">
    {roundCall.call && <RummyAnnouncement call={roundCall.call} dismiss={roundCall.dismiss}/>}
    <div className="table-round-bar"><span>Round {room.round} · Target {room.target}</span><strong role="status" className="text-gold">{room.status === 'abandoned' ? 'Table closed — game ended without a winner' : room.phase === 'gameOver' ? `${room.players[room.winner!]!.name} wins the match!` : room.phase === 'roundOver' ? 'Round over' : yourTurn ? 'Your turn' : `${room.players[room.turn]?.name}${room.players[room.turn]?.bot&&pending?' is thinking…':'’s turn'}`}</strong></div>
    <ul className="rummy-player-list" style={{ '--rummy-seats': room.players.length } as CSSProperties} aria-label="Players and scores">{room.players.map((player, i) => {
      const lastPlay = [...(room.activity ?? [])].reverse().find(play => play.seat === i);
      const lastText = lastPlay ? playDescription(lastPlay) : 'Waiting to play';
      const displayName = player.bot ? player.name.replace(/^Computer (\d+)$/, 'CPU $1') : player.name;
      return <li key={player.id} className="clubhouse-player" data-active={room.turn === i && !ended}>
        <div className="clubhouse-player-top"><PlayerMedallion name={player.name} bot={player.bot} seat={i}/><div><span className="player-name" title={player.name}>{displayName}{player.you && room.mode !== 'local' ? ' (you)' : ''}</span><span className="player-subtitle">{player.bot ? 'Computer' : 'Clubhouse player'}{room.dealer === i ? ' · dealer' : ''}</span></div></div>
        <div className="rummy-player-stats"><output className="rummy-card-count" aria-label={`${player.name}: ${player.count} cards remaining`}><strong>{player.count}</strong> cards</output><span className="rummy-player-score">{player.score} pts</span></div>
        <button className="rummy-player-play" title={lastText} aria-label={`${player.name}: ${lastText}. Open recent plays`} onClick={() => setPanel('plays')}>{lastText}</button>
      </li>;
    })}</ul>
    <p className="sr-only" role="status">{room.activity?.at(-1) && `${room.players[room.activity.at(-1)!.seat]?.name}: ${playDescription(room.activity.at(-1)!)}`}</p>
    {visible&&!panel&&<RummyCallOffer room={room} pending={pending} onMove={act}/>}
    <div className="table-panel-buttons"><CardDropZone id="rummy-melds" label="Meld / lay off" accepts={(anchor, group) => Boolean(dropAction('rummy-melds', anchor, group))}><button aria-label={`Melds & discard (${room.melds.length})`} title={room.variant === 'gin' ? 'Gin melds stay in your hand.' : 'Drag a selected set or run here to meld; drag one card here to lay off.'} onClick={() => setPanel('melds')}>Melds ({room.melds.length})</button></CardDropZone><button onClick={() => setPanel('plays')}>Recent plays</button><button aria-label="Hand tools" onClick={() => setPanel('tools')}>Tools</button><button aria-label="Rules & log" onClick={() => setPanel('rules')}>Rules</button>{room.roundResult && <button aria-label="Round result" onClick={() => setPanel('round')}>Result</button>}</div>
    <div className="rummy-pile-arena" aria-label="Stock and discard piles"><div className="rummy-pile-crest"><TableCrest symbol="♦" /></div><div className="rummy-pile"><button className="rummy-stock-card disabled:opacity-65" aria-label="Draw from stock" disabled={!canAct || room.phase !== 'draw' || ['first', 'dealer'].includes(room.opening ?? '')} onClick={() => void act({ t: 'draw', from: 'stock' })}><CardArtwork back /></button><p className="mt-1 text-xs">Stock · {room.stockCount}</p></div>
      <CardDropZone id="rummy-discard" label="Discard here" className={`rummy-pile rummy-discard-target ${canAct && room.phase === 'play' && !room.mustUse ? 'can-discard' : ''}`} accepts={(anchor, group) => Boolean(dropAction('rummy-discard', anchor, group))}><button aria-label="Take top discard" disabled={!canAct || room.phase !== 'draw' || !canTakeDiscard(pickupState)} onClick={() => void act({ t: 'draw', from: 'discard' })} className="rounded-lg disabled:opacity-70">{room.discard.length ? <Face card={room.discard.at(-1)!} /> : <span className="inline-block h-20 w-14 rounded-lg border border-white/30" />}</button><p className="mt-1 text-xs">{canAct && room.phase === 'play' ? 'Drop discard' : 'Discard'} · {room.discard.length}</p></CardDropZone>
      {canAct && ['first', 'dealer'].includes(room.opening ?? '') && <button className="btn-ghost-gold text-sm" disabled={pending} onClick={() => void act({ t: 'pass' })}>Pass opening upcard</button>}
    </div>
    {!visible ? <div role="region" className="my-6 rounded-2xl border border-gold/40 bg-black/30 p-8 text-center" aria-label="Pass and play privacy screen"><h2 className="font-display text-3xl text-gold">Pass the device to {room.players[room.turn]!.name}</h2><p className="my-3 text-sm">The next hand stays covered until its player is ready.</p><button className="btn-gold" onClick={() => setRevealed(turnKey)}>Reveal my hand</button></div> : <div className="game-hand-section min-w-0"><div className="rummy-hand-heading flex items-center justify-between gap-3"><h2 className="font-display text-2xl text-gold">{room.mode === 'local' ? `${room.players[room.mySeat ?? 0]!.name}’s hand` : 'Your hand'}</h2><div className="rummy-hand-quick-tools"><span>{analysis.optimal ? 'Lowest' : 'Suggested'} deadwood: {analysis.dw}</span><button disabled={pending || ended} onClick={smartSort} title="Group complete melds, then useful pairs and near-runs">Smart sort</button><button className="rummy-sound-toggle" onClick={sound.toggle} aria-label={sound.enabled ? 'Mute announcements' : 'Enable announcement sounds'} title={sound.enabled ? 'Announcement sounds on' : 'Announcement sounds off'}><FarkleAudioIcon muted={!sound.enabled}/></button></div></div>
      <RummyHand fit compact key={`${room.mySeat}:${room.round}`} cards={hand} onReorder={cards => arrange(cards, 'Hand reordered.')} selectedCards={selected} onToggleCard={card => setSelected(previous => previous.includes(card) ? previous.filter(value => value !== card) : [...previous, card])} />
      {room.mustUse && <p role="status" className="my-2 text-sm text-gold">Use {compact(room.mustUse)} in a meld or layoff before discarding.</p>}
      <div className="table-action-bar" aria-label="Turn actions"><button className="btn-gold" disabled={!canDiscard} onClick={() => card && void act({ t: 'discard', card })}>Discard selected</button>{room.variant === 'gin' ? <button className="btn-gold" disabled={!canDiscard || knockDebt > 10} onClick={() => card && void act({ t: 'discard', card, knock: true })}>{knockDebt === 0 ? 'Go Gin' : 'Knock'}</button> : <button className="btn-gold" disabled={!canAct || room.phase !== 'play' || selected.length < 3 || !validMeld} onClick={() => void act({ t: 'meld', cards: selected })}>Meld selected</button>}<button className="btn-ghost-gold" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection ({selected.length})</button></div><p className="mt-3 min-h-6 text-sm text-gold" role="status">{meldHint || notice}</p>
    </div>}
    {panel && <GamePanel title={panel === 'melds' ? 'Table melds & discard pile' : panel === 'tools' ? 'Hand tools' : panel === 'round' ? 'Round result' : panel === 'plays' ? 'Who played what' : 'Recent moves & rules'} close={() => setPanel(null)}>
      {panel === 'plays' ? <><p className="mb-4 text-sm">Round {room.round} · latest 40 actions. Only face-up cards are shown.</p><ol className="rummy-public-plays" reversed>{[...(room.activity ?? [])].reverse().map(play => <li key={play.id} data-seat={play.seat}><strong>{room.players[play.seat]?.name ?? `Seat ${play.seat + 1}`}</strong><span>{playDescription(play)}</span>{play.cards.length > 0 && <div className="rummy-play-cards">{play.cards.map(c => <span key={c} aria-label={cardLabel(c)}>{compact(c)}</span>)}</div>}</li>)}</ol>{!room.activity?.length && <p className="text-sm">New plays will appear here as the round continues.</p>}</> : panel === 'melds' ? <>    {room.variant === 'r500' && room.discard.length > 1 && <details open className="my-3 text-sm"><summary className="cursor-pointer text-gold">Choose from discard pile (use the chosen card this turn)</summary><div className="mt-2 flex max-w-full gap-2 overflow-x-auto p-2">{room.discard.map((discard, index) => <button key={discard} aria-label={`Take discard pile from ${cardLabel(discard)}`} disabled={!canAct || room.phase !== 'draw' || !canTakeDiscard(pickupState, index)} onClick={() => void act({ t: 'draw', from: 'discard', index })}><Face card={discard} /></button>)}</div></details>}
    {notice.startsWith('This card fits more than one meld.') && <p role="status" className="mb-3 text-sm text-gold">{notice}</p>}<div className="rummy-meld-area" aria-label="Table melds"><h2 className="mb-2 font-display text-xl text-gold">{room.variant === 'gin' ? 'Gin melds stay in your hand' : 'Table melds'}</h2>{room.melds.length ? <RummyTableMelds room={room} card={card} enabled={canAct&&room.phase==='play'} onMove={act}/> : <p className="text-sm text-foreground/75">{room.variant === 'gin' ? 'After drawing, select one card to discard. Knock with ten or fewer deadwood points, or go Gin.' : 'Select three or more matching cards, then choose Meld selected.'}</p>}</div>
</> : panel === 'tools' ? <>      <div className="hand-toolbar"><button className="btn-ghost-gold text-sm" onClick={smartSort}>Best sort</button><button className="btn-ghost-gold text-sm" onClick={() => arrange(sortHandBySuit(hand), 'Sorted by suit.')}>Sort by suit</button><button className="btn-ghost-gold text-sm" onClick={() => arrange(sortHandByRank(hand), 'Sorted by rank.')}>Sort by rank</button><button className="btn-ghost-gold text-sm" disabled={!history.length} onClick={() => { const last = history.at(-1)!; setOrder(last); setHistory(previous => previous.slice(0, -1)); setNotice('Arrangement restored.'); }}>Undo arrangement</button></div>
<p className="text-sm">Drag a card onto the discard pile to discard. To meld, select a set or run, then drag one of those cards onto Melds. Drag a single card onto Melds to lay off; if it fits several melds, choose one. Tap an exposed card corner to select it. Hold briefly to drag on a touch screen. With a keyboard, Enter selects; Space picks up a card, arrows move it, and Space drops it. The arrow buttons below your hand move the selected card.</p></> : panel === 'round' ? <>    {room.roundResult && <section className="my-4 rounded-2xl border border-gold/50 bg-black/30 p-4" aria-label="Round result"><h2 className="font-display text-2xl text-gold">{room.phase === 'gameOver' ? 'Match complete' : 'Round result'}</h2><p className="mt-2">{room.roundResult.note}</p><ul className="mt-2 flex flex-wrap gap-4 text-sm">{room.roundResult.points.map((points, i) => <li key={i}>{room.players[i]!.name}: {points >= 0 ? '+' : ''}{points}</li>)}</ul>{room.phase === 'roundOver' && room.owner && room.status === 'playing' && <button className="btn-gold mt-4" disabled={pending} onClick={() => void act({ t: 'next' })}>Next round</button>}{room.phase === 'roundOver' && !room.owner && <p className="mt-3 text-sm text-muted-foreground">Waiting for the host to start the next round.</p>}</section>}
    {room.revealedHands && <details className="my-4 text-sm"><summary className="cursor-pointer text-gold">Revealed hands</summary>{room.revealedHands.map((cards, i) => <p key={i} className="mt-2 break-words">{room.players[i]!.name}: {cards.map(compact).join(' · ') || 'Empty hand'}</p>)}</details>}
</> : <>    <details open className="mt-5 border-t border-white/15 pt-3 text-sm"><summary className="cursor-pointer text-gold">Recent moves and rules</summary><ol className="my-3 space-y-1 text-xs">{room.log.map((line, i) => <li key={i}>{line}</li>)}</ol><p className="text-xs text-foreground/75">{VARIANTS[room.variant].summary} A picked-up discard cannot be discarded straight back. Rummy 500 discard pickups must be used in a meld or layoff. Gin has a 25-point Gin/undercut bonus; the final two stock cards end a round without points. Classic and Rummy 500: Call Rummy claims another player’s top discard directly onto an existing table meld before the next draw. Layoff credit belongs to the caller; it does not use a turn. Pass call lets computers continue. Completed rounds and Gin have no Rummy calls. Colored player sections show who started each set or run; card captions show who contributed later layoffs. The host advances rounds. Leaving an active table ends the game. Large hands above 20 cards use a fast legal meld suggestion.</p></details></>}
    </GamePanel>}
  </section></CardDragTable>;
}
