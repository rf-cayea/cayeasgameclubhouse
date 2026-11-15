import {useWinnerCelebration} from '@/lib/winner-celebration';
import { GameEffectsButton } from '@/components/GameEffectsButton';
import { useGameCue } from '@/lib/game-cues';
import { ownsCardTable } from '@/lib/card-table-themes';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { CardArtwork } from './CardArtwork';
import { RewardCrates } from './DiceCrateRewards';
import { useClassicCardRooms } from '@/lib/classic-card-network';
import { classicPath, classicRoomCode, classicTitle, type ClassicKind, type ClassicOptions, type ClassicRoomView } from '@/lib/classic-card-protocol';
import { GameHeader, GamePanel } from './GameChrome';
import { notifyWallet, useClubhouse } from '@/lib/clubhouse';
import { CLASSIC_DECK, CLASSIC_VENUE, SPADES_VENUES, spadesDeck, spadesVenue } from '@/lib/spades-cosmetics';
import { ownsPlayingDeck, SHARED_DECKS, type PlayingDeck } from '@/lib/playing-decks';
import {
  SUITS, SUIT_NAMES, cardName, drawEight, eightsBot, eightsLegal, heartsBot, heartsLegal,
  passDirection, passHearts, playEight, playHeart, seatName, startEights, startHearts, wild,
  type Eights, type Hearts,
} from '@/lib/classic-cards';
import '@/styles/classic-card-table.css';

const SUIT_MARKS = { C: '♣', D: '♦', S: '♠', H: '♥' };

export function ClassicCardTable({ kind }: { kind: ClassicKind }) {
  const hearts = kind === 'hearts';
  const title = classicTitle(kind);
  const shortTitle = hearts ? 'Hearts' : 'Crazy 8’s';
  const { wallet, user, ready } = useClubhouse();
  const [tableId, setTableId] = useState('');
  const venues = [CLASSIC_VENUE, ...SPADES_VENUES].filter(venue => ownsCardTable(wallet?.owned ?? [], venue.id));
  const venue = spadesVenue(venues.find(item => item.id === tableId)?.id);
  const surface = tableId ? { '--classic-table': `linear-gradient(#101b1b4f, #101b1b8c), ${venue.surface}`, '--classic-table-size': `cover, ${venue.backgroundSize ?? 'cover'}`, '--classic-table-rail': venue.rail } as CSSProperties : undefined;
  const [deckId, setDeckId] = useState(CLASSIC_DECK.id);
  const [jokers, setJokers] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [online, setOnline] = useState(() => new URLSearchParams(window.location.search).has('room'));
  const [crates, setCrates] = useState(false);
  const [rules, setRules] = useState(false);
  const decks = [CLASSIC_DECK, ...SHARED_DECKS.filter(deck => ownsPlayingDeck(wallet?.owned ?? [], deck.id))];
  const deck = spadesDeck(decks.find(item => item.id === deckId)?.id);
  const [matchDeck, setMatchDeck] = useState<PlayingDeck>(CLASSIC_DECK);

  return <div className={`game-viewport classic-cards ${hearts ? 'classic-cards-hearts' : ''}`} style={surface}>
    <GameHeader title={title}><GameEffectsButton/>
      <button onClick={() => setCrates(true)}>Rewards</button>
      <button onClick={() => setRules(true)}>Rules</button>
      {online && <button onClick={() => setOnline(false)}>Game setup</button>}
      {playing && <button onClick={() => setPlaying(false)}>Leave table</button>}
    </GameHeader>
    <main className={`classic-cards-main ${playing || online ? 'classic-cards-main-play' : ''}`}>
      {online ? ready ? <OnlineLobby key={user?.id ?? 'guest'} kind={kind} userId={user?.id ?? null} deck={deck} jokers={jokers}/> : <p role="status">Opening the lobby…</p>
      : playing ? hearts ? <HeartsTable deck={matchDeck} jokers={jokers}/> : <EightsTable deck={matchDeck}/> :
        <section className="classic-cards-setup clubhouse-setup">
          <div className="classic-cards-intro">
            <h2>{title}</h2>
            <p>{hearts ? 'Follow suit, dodge the Queen of Spades, and finish with the lowest score.' : 'Match rank or suit, change the suit with a wild, and be the first to empty your hand.'}</p>
            <p className="text-sm">Play solo against three computers or join an online table.</p>
          </div>
          <div className="classic-cards-preview"><Face card={hearts ? 'QS' : '8H'} deck={deck}/><Face card={hearts && !jokers ? 'AH' : 'X2'} deck={deck}/><Face deck={deck}/></div>
          <div className="classic-cards-options">
            <label>Playing deck<select value={deck.id} onChange={event => setDeckId(event.target.value)}>{decks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Table surface<select value={tableId} onChange={event => setTableId(event.target.value)}><option value="">Game default</option>{venues.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <Link to="/store" search={{ category: 'tables' }}>Browse shared card tables</Link>
            <Link to="/store" search={{ category: 'decks' }}>Browse shared decks</Link>
            {hearts && <label>Rules<select value={jokers ? 'jokers' : 'classic'} onChange={event => setJokers(event.target.value === 'jokers')}><option value="jokers">Clubhouse Jokers · 54 cards</option><option value="classic">Classic Hearts · 52 cards</option></select></label>}
          </div>
          <div className="classic-cards-actions">
            <button className="btn-gold" onClick={() => { setMatchDeck(deck); setPlaying(true); }}>Deal me in</button>
            <button className="btn-ghost-gold" onClick={() => setOnline(true)}>Online lobby</button>
          </div>
        </section>}
    </main>
    {crates && <GamePanel title="Card-deck crates and achievements" close={() => setCrates(false)}>
      <p>Verified {shortTitle} wins earn {hearts ? 'Spades' : 'Rummy+'} points and count toward shared card-deck crates.</p>
      <RewardCrates collection="cards"/>
      <Link className="btn-ghost-gold mt-3 inline-block" to="/rewards" search={{ game: hearts ? 'hearts' : 'crazy-eights' }} hash="achievements">View {shortTitle} milestones</Link>
    </GamePanel>}
    {rules && <GamePanel title={`${shortTitle} rules`} close={() => setRules(false)}>
      {hearts ? <ul className="classic-cards-rules">
        <li>Pass three cards left, right, and across on successive hands. Keep your cards on every fourth hand.</li>
        <li>The 2 of Clubs opens. Follow the led suit if possible. On the first trick, discard a penalty card only if you have no other legal card. Lead hearts after one has been played, or when your hand contains only hearts.</li>
        <li>The highest card in the led suit takes the trick. Each heart costs 1 point and the Queen of Spades costs 13. Take all 26 points to shoot the moon and give each opponent 26 points instead.</li>
        <li>The match ends at the end of the first hand when someone reaches 100 points. The lowest score wins, with ties shared.</li>
        <li>In Clubhouse Jokers, the black joker is the lowest club and the red joker is the lowest diamond. The 2 of Diamonds and 2 of Spades go to the first trick winner as a face-up kitty worth zero points.</li>
      </ul> : <ul className="classic-cards-rules">
        <li>Start with five cards. On your turn, match the active suit or the top card’s rank.</li>
        <li>All eights and both jokers are wild. Play one at any time and choose the active suit.</li>
        <li>If you cannot play, draw one card. Play it if it matches, otherwise your turn passes. The discard pile is shuffled back into the stock when needed, leaving the top card in play.</li>
        <li>The first player to empty their hand wins. If all four players pass consecutively with no cards available to draw, the smallest hand wins, with ties shared.</li>
      </ul>}
    </GamePanel>}
  </div>;
}

function Face({ card, deck }: { card?: string; deck: PlayingDeck }) {
  return <span className="classic-card-face"><CardArtwork card={card} deck={deck}/></span>;
}

function Hand({ cards, deck, legal, selected = [], onCard }: {
  cards: string[]; deck: PlayingDeck; legal: string[]; selected?: string[]; onCard: (card: string) => void;
}) {
  return <section className="classic-cards-hand" aria-label="Your hand">
    <h3>Your hand <span>{cards.length} cards</span></h3>
    <div className="classic-cards-hand-grid">{cards.map(card =>
      <button key={card} type="button" disabled={!legal.includes(card)} aria-label={cardName(card)}
        aria-pressed={selected.length ? selected.includes(card) : undefined} onClick={() => onCard(card)}>
        <Face card={card} deck={deck}/>
      </button>)}</div>
  </section>;
}

function Seats({ hands, turn, taken, totals }: { hands: string[][]; turn: number; taken?: number[]; totals?: number[] }) {
  return <ul className="classic-cards-seats" aria-label="Players">
    {hands.map((hand, seat) => <li key={seat} className={seat === turn ? 'classic-cards-current' : undefined} aria-current={seat === turn ? 'true' : undefined}>
      <strong>{seatName(seat)}</strong><span>{hand.length} cards</span>
      {totals && <span>{totals[seat]} total · {taken?.[seat]} taken</span>}
    </li>)}
  </ul>;
}

function winnersText(winners: number[]) {
  if (winners.length > 1) return `Tie · ${winners.map(seatName).join(', ')}`;
  return winners[0] === 0 ? 'You win!' : `${seatName(winners[0]!)} wins.`;
}

function EightsTable({ deck }: { deck: PlayingDeck }) {
  const [game, setGame] = useState<Eights>(startEights);
  const [pending, setPending] = useState<string>();
  useEffect(() => {
    if (game.winners.length || game.turn === 0) return;
    const timer = window.setTimeout(() => setGame(eightsBot), 1100);
    return () => window.clearTimeout(timer);
  }, [game]);
  const legal = game.turn === 0 && !game.winners.length ? game.hands[0]!.filter(card => eightsLegal(game, card)) : [];
  useWinnerCelebration({game:'Crazy 8’s',scope:'local',finished:game.winners.length>0,names:game.winners.map(seatName),persist:false});
  const top = game.pile.at(-1)!;
  useGameCue('eights',`${top}:${game.stock.length}:${game.turn}:${game.winners.length}`,game.winners.length?'win':'card');
  return <section className="classic-cards-board" aria-label="Crazy 8’s table">
    <Seats hands={game.hands} turn={game.winners.length ? -1 : game.turn}/>
    <div className="classic-cards-center">
      <div><Face deck={deck}/><p>Stock · {game.stock.length}</p></div>
      <div><Face card={top} deck={deck}/><p>Active suit · {SUIT_MARKS[game.active]} {SUIT_NAMES[game.active]}</p></div>
    </div>
    <p role="status" className="classic-cards-status">{game.message} <strong>{game.winners.length ? winnersText(game.winners) : game.turn === 0 ? 'Your turn.' : `${seatName(game.turn)} is playing.`}</strong></p>
    {game.winners.length ? <button className="btn-gold" onClick={() => setGame(startEights())}>Play again</button> :
      <button className="btn-gold" disabled={game.turn !== 0 || Boolean(legal.length) || game.drew} onClick={() => setGame(drawEight)}>
        {game.stock.length || game.pile.length > 1 ? 'Draw a card' : 'Pass turn'}
      </button>}
    <Hand cards={game.hands[0]!} deck={deck} legal={legal} onCard={card => wild(card) ? setPending(card) : setGame(previous => playEight(previous, card, previous.active))}/>
    {pending && <GamePanel title={`Choose a suit for your ${cardName(pending)}`} close={() => setPending(undefined)} closeLabel="Cancel">
      <div className="classic-cards-suits">{SUITS.map(suit => <button key={suit} className="btn-gold" onClick={() => { setGame(previous => playEight(previous, pending, suit)); setPending(undefined); }}>{SUIT_MARKS[suit]} {SUIT_NAMES[suit]}</button>)}</div>
    </GamePanel>}
  </section>;
}

function HeartsTable({ deck, jokers }: { deck: PlayingDeck; jokers: boolean }) {
  const [game, setGame] = useState<Hearts>(() => startHearts(jokers));
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (game.phase !== 'play' || (game.turn === 0 && game.trick.length < 4)) return;
    const timer = window.setTimeout(() => setGame(heartsBot), game.trick.length === 4 ? 1600 : 1000);
    return () => window.clearTimeout(timer);
  }, [game]);
  useGameCue('hearts',JSON.stringify([game.round,game.phase,game.trick,game.turn]),
    game.phase==='match'||game.phase==='round'?'win':game.trick.length===4?'match':'card');
  const hand = game.hands[0]!;
  const passing = game.phase === 'pass';
  const legal = passing ? hand : game.turn === 0 ? heartsLegal(game) : [];
  const winners = game.totals.flatMap((score, seat) => score === Math.min(...game.totals) ? [seat] : []);
  useWinnerCelebration({game:'Hearts',scope:'local',finished:game.phase==='match',names:winners.map(seatName),persist:false});
  return <section className="classic-cards-board" aria-label="Hearts table">
    <p className="classic-cards-round">Hand {game.round + 1} · {jokers ? 'Clubhouse Jokers' : 'Classic Hearts'} · Lowest score wins at 100</p>
    <Seats hands={game.hands} turn={game.phase === 'play' && game.trick.length < 4 ? game.turn : -1} taken={game.taken} totals={game.totals}/>
    <div className="classic-cards-center classic-cards-trick" aria-label={game.trick.length ? 'Current trick' : 'Last trick'}>
      {(game.trick.length ? game.trick : game.lastTrick).map(({ seat, card }) => <div key={seat}><Face card={card} deck={deck}/><p>{seatName(seat)}</p></div>)}
      {!game.trick.length && !game.lastTrick.length && <p>{passing ? `Pass three cards ${passDirection(game.round)}.` : 'The 2 of Clubs opens.'}</p>}
    </div>
    {game.kitty.length > 0 && <p className="classic-cards-round">First-trick kitty · 2♦ and 2♠</p>}
    <p role="status" className="classic-cards-status">
      {passing ? `Select three cards to pass ${passDirection(game.round)}. ${selected.length} of 3 selected.` : game.message}{' '}
      {game.phase === 'play' && game.trick.length < 4 && <strong>{game.turn === 0 ? 'Your turn.' : `${seatName(game.turn)} is playing.`}</strong>}
      {game.phase === 'match' && <strong>{winnersText(winners)}</strong>}
    </p>
    {passing && <button className="btn-gold" disabled={selected.length !== 3} onClick={() => { setGame(previous => passHearts(previous, selected)); setSelected([]); }}>Pass selected cards</button>}
    {game.phase === 'round' && <button className="btn-gold" onClick={() => setGame(startHearts(jokers, game.round + 1, game.totals))}>Deal next hand</button>}
    {game.phase === 'match' && <button className="btn-gold" onClick={() => setGame(startHearts(jokers))}>Play again</button>}
    <Hand cards={hand} deck={deck} legal={legal} selected={selected} onCard={card => {
      if (!passing) { setGame(previous => playHeart(previous, card)); return; }
      setSelected(previous => previous.includes(card) ? previous.filter(value => value !== card) : previous.length < 3 ? [...previous, card] : previous);
    }}/>
  </section>;
}

function OnlineLobby({ kind, userId, deck, jokers }: { kind: ClassicKind; userId: string | null; deck: PlayingDeck; jokers: boolean }) {
  const network = useClassicCardRooms(kind, userId);
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => (new URLSearchParams(window.location.search).get('room') ?? '').toUpperCase().slice(0, 8));
  const [listed, setListed] = useState(true);
  const [capacity, setCapacity] = useState<ClassicOptions['capacity']>(4);
  const [variant, setVariant] = useState(jokers);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { room } = network;
  const playable = network.connected && !network.pending && !network.retry;
  const playerName = userId ? 'Member' : name.trim();
  const canEnter = playable && playerName.length >= 2;
  const title = kind === 'hearts' ? 'Hearts' : 'Crazy 8’s';
  const create = (solo: boolean) => network.send({ operation: 'create', name: playerName, options: { capacity: solo ? 1 : capacity, listed: !solo && listed, jokers: variant } });
  const join = (tableCode: string) => network.send({ operation: 'join', code: tableCode, name: playerName });
  const invite = room && new URL(`${classicPath(kind)}?room=${room.code}`, window.location.origin).href;
  const leave = async () => {
    if (room && await network.send({ operation: 'leave', code: room.code })) setLeaving(false);
  };
  return <>
    {(network.error || network.connection) && <p role="alert" className="classic-cards-notice">{network.error || network.connection}</p>}
    {network.retry && <button className="btn-gold mb-3" disabled={network.pending} onClick={() => void network.send(network.retry!, network.retry!)}>Retry last action</button>}
    {room?.game ? <OnlineMatch key={room.code} room={room} deck={deck} playable={playable} send={network.send}/> : room ?
      <section className="classic-cards-board" aria-label="Table lobby">
        <h2>{title} table · {room.code}</h2>
        <p>{room.options.listed ? 'Public lobby' : 'Private table'} · {room.players.length}/{room.options.capacity} seats
          {kind === 'hearts' && (room.options.jokers ? ' · Clubhouse Jokers' : ' · Classic Hearts')}</p>
        <div className="classic-cards-options">
          <label>Invite link<input readOnly value={invite || ''} onFocus={event => event.target.select()}/></label>
          <button className="btn-ghost-gold" onClick={async () => {
            try { await navigator.clipboard.writeText(invite || ''); setCopied(true); }
            catch { setCopied(false); }
          }}>{copied ? 'Link copied' : 'Copy invite link'}</button>
        </div>
        <ul className="classic-cards-seats" aria-label="Seated players">{room.players.map(player => <li key={player.seat}>
          <strong>{player.name}{player.seat === room.seat ? ' (you)' : ''}</strong><span>{player.ready ? 'Ready' : 'Waiting'}</span>
        </li>)}</ul>
        <p className="classic-cards-status">Start with at least two people. Computers fill the remaining seats.</p>
        {room.host ? <button className="btn-gold" disabled={!playable || room.players.length < 2 || room.players.some(player => !player.ready)}
          onClick={() => void network.send({ operation: 'start', code: room.code, revision: room.revision })}>Start game</button>
          : <button className="btn-gold" disabled={!playable} onClick={() => void network.send({
            operation: 'ready', code: room.code, revision: room.revision, ready: !room.players.find(player => player.seat === room.seat)?.ready,
          })}>{room.players.find(player => player.seat === room.seat)?.ready ? 'Unready' : 'Ready'}</button>}
      </section> : network.code ? <p role="status">Reopening table {network.code}…</p> :
      <section className="classic-cards-setup clubhouse-setup" aria-label={`${title} online lobby`}>
        <div className="classic-cards-intro"><h2>Online lobby</h2><p>Join a public table or share a private table link with friends.</p></div>
        {!userId && <div className="classic-cards-options"><label>Player name<input autoComplete="nickname" maxLength={24} value={name} onChange={event => setName(event.target.value)} placeholder="Your table name"/></label></div>}
        <div className="classic-cards-lobby-grid">
          <section>
            <h3>Create a table</h3>
            <div className="classic-cards-options">
              <label>Visibility<select value={listed ? 'public' : 'private'} onChange={event => setListed(event.target.value === 'public')}><option value="public">Public lobby</option><option value="private">Private invite link</option></select></label>
              <label>Human seats<select value={capacity} onChange={event => setCapacity(Number(event.target.value) as ClassicOptions['capacity'])}><option>4</option><option>3</option><option>2</option></select></label>
              {kind === 'hearts' && <label>Rules<select value={variant ? 'jokers' : 'classic'} onChange={event => setVariant(event.target.value === 'jokers')}><option value="jokers">Clubhouse Jokers</option><option value="classic">Classic Hearts</option></select></label>}
            </div>
            <button className="btn-gold" disabled={!canEnter} onClick={() => void create(false)}>Create table</button>
            {userId && <button className="btn-ghost-gold mt-3" disabled={!canEnter} onClick={() => void create(true)}>Play solo for rewards</button>}
          </section>
          <section>
            <h3>Join by code</h3>
            <form className="classic-cards-options" onSubmit={event => { event.preventDefault(); if (canEnter && classicRoomCode(code)) void join(code); }}>
              <label>Table code<input value={code} onChange={event => setCode(event.target.value.trim().toUpperCase())} maxLength={8} autoComplete="off" spellCheck={false}/></label>
              <button className="btn-gold" disabled={!canEnter || !classicRoomCode(code)}>Join table</button>
            </form>
          </section>
        </div>
        <section className="classic-cards-public" aria-label="Public tables">
          <h3>Open public tables</h3>
          {network.tables.length ? <ul>{network.tables.map(table => <li key={table.code}>
            <div><strong>{table.host}</strong><p>{table.code} · {table.humans}/{table.capacity} seats{kind === 'hearts' && (table.jokers ? ' · Jokers' : ' · Classic')}</p></div>
            <button className="btn-ghost-gold" disabled={!canEnter} onClick={() => void join(table.code)}>Join {table.host}’s table</button>
          </li>)}</ul> : <p>{network.connected ? 'No open tables yet.' : 'Connecting to the lobby…'}</p>}
        </section>
      </section>}
    {room && <div className="classic-cards-actions mt-3"><button className="btn-ghost-gold" disabled={!playable} onClick={() => setLeaving(true)}>Leave table</button></div>}
    {leaving && room && <GamePanel title="Leave this table?" close={() => setLeaving(false)} closeLabel="Stay at table">
      {room.game && <p>A computer fills your seat if other players stay.</p>}
      <button className="btn-gold mt-3" disabled={!playable} onClick={() => void leave()}>Leave table</button>
    </GamePanel>}
  </>;
}

function OnlineMatch({ room, deck, playable, send }: {
  room: ClassicRoomView; deck: PlayingDeck; playable: boolean;
  send: ReturnType<typeof useClassicCardRooms>['send'];
}) {
  const [pending, setPending] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const game = room.game!;
  useEffect(() => {
    if (room.rewardMatchId) notifyWallet();
  }, [room.rewardMatchId]);
  const playerName = (seat: number) => seat === room.seat ? 'You' : room.players.find(player => player.seat === seat)?.name ?? `Computer ${seat + 1}`;
  const base = { code: room.code, revision: room.revision };
  const isHearts = game.kind === 'hearts';
  useGameCue(room.code, game.kind==='hearts'
    ? JSON.stringify([game.round,game.phase,game.trick,game.turn,room.counts])
    : JSON.stringify([game.top,game.stockCount,game.turn,game.winners]),
    game.kind==='hearts' ? game.phase==='match'||game.phase==='round'?'win':game.trick.length===4?'match':'card'
      : game.winners.length?'win':'card');
  const ended = isHearts ? game.phase === 'match' : game.winners.length > 0;
  const active = isHearts ? game.phase === 'play' : !ended;
  const winners = isHearts ? game.totals.flatMap((score, seat) => score === Math.min(...game.totals) ? [seat] : []) : game.winners;
  useWinnerCelebration({game:game.kind==='hearts'?'Hearts':'Crazy 8’s',scope:room.code,persist:false,finished:ended,names:winners.map(seat=>room.players.find(player=>player.seat===seat)?.name??`Player ${seat+1}`)});
  return <section className="classic-cards-board" aria-label="Online card table">
    <p className="classic-cards-round">Table {room.code}{isHearts && ` · Hand ${game.round + 1} · ${game.jokers ? 'Clubhouse Jokers' : 'Classic Hearts'}`}</p>
    <ul className="classic-cards-seats" aria-label="Players">{room.counts.map((count, seat) =>
      <li key={seat} className={active && game.turn === seat ? 'classic-cards-current' : undefined} aria-current={active && game.turn === seat ? 'true' : undefined}>
        <strong>{playerName(seat)}</strong><span>{count} cards</span>{isHearts && <span>{game.totals[seat]} total · {game.taken[seat]} taken</span>}
      </li>)}</ul>
    {isHearts ? <div className="classic-cards-center classic-cards-trick" aria-label={game.trick.length ? 'Current trick' : 'Last trick'}>
      {(game.trick.length ? game.trick : game.lastTrick).map(({ seat, card }) => <div key={seat}><Face card={card} deck={deck}/><p>{playerName(seat)}</p></div>)}
      {game.kitty.length > 0 && !game.trick.length && <p>First-trick kitty · 2♦ and 2♠</p>}
    </div> : <div className="classic-cards-center"><div><Face deck={deck}/><p>Stock · {game.stockCount}</p></div><div><Face card={game.top} deck={deck}/><p>Active suit · {SUIT_MARKS[game.active]} {SUIT_NAMES[game.active]}</p></div></div>}
    {isHearts && game.trick.length > 0 && game.lastTrick.length > 0 && <details className="classic-cards-round">
      <summary>Previous trick</summary>
      <ul>{game.lastTrick.map(({ seat, card }) => <li key={seat}>{playerName(seat)} · {cardName(card)}</li>)}</ul>
    </details>}
    <p className="classic-cards-status" role="status">
      {isHearts && game.phase === 'pass'
        ? room.waitingForPass ? `Select three cards to pass ${passDirection(game.round)}. ${selected.length} of 3 selected.` : 'Waiting for the other players to pass.'
        : game.message}{' '}
      {active && <strong>{game.turn === room.seat ? 'Your turn.' : `${playerName(game.turn)} is playing.`}</strong>}
      {ended && <strong>{winners.length > 1 ? `Tie · ${winners.map(playerName).join(', ')}` : winners[0] === room.seat ? 'You win!' : `${playerName(winners[0]!)} wins.`}</strong>}
    </p>
    {room.rewardMatchId && <p className="classic-cards-round">Verified win · Card-deck crate and milestone progress saved.</p>}
    {ended && (room.host ? <button className="btn-gold" disabled={!playable} onClick={() => void send({ ...base, operation: 'rematch' })}>{room.options.capacity === 1 ? 'Play again' : 'Return to table lobby'}</button> : <p>Waiting for the host to reopen the lobby.</p>)}
    {isHearts && room.waitingForPass && <button className="btn-gold" disabled={!playable || selected.length !== 3}
      onClick={async () => { if (await send({ ...base, operation: 'pass', cards: selected, round: game.round })) setSelected([]); }}>Pass selected cards</button>}
    {isHearts && game.phase === 'round' && <button className="btn-gold" disabled={!playable} onClick={() => void send({ ...base, operation: 'next' })}>Deal next hand</button>}
    {!isHearts && !ended && <button className="btn-gold" disabled={!playable || !game.canDraw} onClick={() => void send({ ...base, operation: 'draw' })}>Draw or pass</button>}
    <Hand cards={room.hand} deck={deck} legal={playable ? room.legal : []} selected={room.waitingForPass ? selected : []} onCard={card => {
      if (room.waitingForPass) setSelected(previous => previous.includes(card) ? previous.filter(value => value !== card) : previous.length < 3 ? [...previous, card] : previous);
      else if (!isHearts && wild(card)) setPending(card);
      else void send({ ...base, operation: 'play', card });
    }}/>
    {pending && <GamePanel title={`Choose a suit for your ${cardName(pending)}`} close={() => setPending(undefined)} closeLabel="Cancel">
      <div className="classic-cards-suits">{SUITS.map(suit => <button key={suit} className="btn-gold" disabled={!playable || !room.legal.includes(pending)}
        onClick={() => { void send({ ...base, operation: 'play', card: pending, suit }); setPending(undefined); }}>{SUIT_MARKS[suit]} {SUIT_NAMES[suit]}</button>)}</div>
    </GamePanel>}
  </section>;
}
