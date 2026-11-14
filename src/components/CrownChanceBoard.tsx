import { HotDiceCallout } from '@/components/HotDiceCallout';
import { PokerDieFace } from '@/components/PokerDice';
import { chanceCanBank, chanceHands, CHANCE_HIGH_HANDS, CHANCE_LIMITS, CHANCE_TARGETS, type ChanceActivity, type ChanceHand, type CrownChanceMove, type CrownChanceState } from '@/lib/crown-chance';
import type { PokerDiceSet } from '@/lib/poker-dice-sets';

const rank = ['9', '10', 'J', 'Q', 'K', 'A'];
const rankName = ['9', '10', 'Jack', 'Queen', 'King', 'Ace'];
export const formatChancePoints = (points: number) => points.toLocaleString();
const scoreGuide = [
  [['Single 9 / Ace', '50 / 100'], ['Pair / Ace Pair', '200 / 250'],
    ['2 Pair / 3 Pair', '450 / 900'], ['Three of a Kind', '500–750'],
    ['Low / High Straight', '1,200 / 1,400']],
  Object.values(CHANCE_HIGH_HANDS).map(({ name, points }) => [name, formatChancePoints(points)]),
];

export function chanceHandRanks(dice: number[], mask: number) {
  return dice.filter((_, index) => mask & (1 << index)).sort((a, b) => a - b).map(value => rank[value - 1]).join(' ');
}

export function ChanceScoringGuide({ selected }: { selected?: ChanceHand }) {
  return <section className="fk-score-reference chance-score-guide" aria-label="Roll scoring guide">
    <h2>Roll scoring</h2>
    <div className="fk-reference-columns">
      {scoreGuide.map((column, index) => <dl key={index}>
        {column.map(([label, score]) => <div key={label}><dt>{label}</dt><dd>{score}</dd></div>)}
      </dl>)}
    </div>
    {selected && <p className="chance-guide-selection"><span>{selected.name}</span><strong>+{formatChancePoints(selected.points)}</strong></p>}
  </section>;
}

export function ChanceHandOptions({ hands, dice, mask, onPick, disabled = false }: {
  hands: ChanceHand[]; dice: number[]; mask: number; onPick: (mask: number) => void; disabled?: boolean;
}) {
  return <div className="fk-plays chance-hand-options">
    {hands.map(hand => <button key={hand.mask} type="button" disabled={disabled} data-selected={mask === hand.mask}
      aria-pressed={mask === hand.mask} onClick={() => onPick(hand.mask)}>
      <span>{hand.name}<small>{chanceHandRanks(dice, hand.mask)}</small></span>
      <b>+{formatChancePoints(hand.points)}</b>
    </button>)}
    {!hands.length && <p>Roll the dice to see your scoring hands.</p>}
  </div>;
}

function ClaimedDice({ state, design, through }: { state: CrownChanceState; design: PokerDiceSet; through?: number }) {
  const activity = (state.activity ?? []).filter(event => through === undefined || event.id <= through);
  const groups = [];
  for (let index = activity.length - 1; index >= 0; index--) {
    const event = activity[index]!;
    if (event.kind === 'bank' || event.kind === 'roll' && (event.hot || event.lost !== undefined)) break;
    if (event.kind === 'claim') groups.unshift(event);
  }
  const shownDice = groups.flatMap(group => group.dice);
  const earlierDice = through !== undefined ? [] : state.dice.filter((value, index) => {
    if (!state.claimed[index]) return false;
    const shown = shownDice.indexOf(value);
    if (shown === -1) return true;
    shownDice.splice(shown, 1);
    return false;
  });
  const rows = earlierDice.length ? [{ id: 0, dice: earlierDice, hand: 'Earlier claims', points: 0 }, ...groups] : groups;
  return <section className="chance-kept" aria-label="Claimed dice">
    <h3>Claimed dice</h3>
    <div className="chance-kept-rows">
      {Array.from({ length: 6 }, (_, index) => {
        const row = rows[5 - index];
        return <div className="chance-kept-row" data-filled={Boolean(row)} key={row?.id ?? `empty-${index}`}>
          <div className="chance-kept-dice" aria-hidden="true">
            {Array.from({ length: index + 1 }, (_, die) =>
              <span key={die}>{row?.dice[die] !== undefined && <PokerDieFace value={row.dice[die]!} held design={design}/>}</span>)}
          </div>
          {row && <span className="chance-claim-label"><span>{row.hand}</span>{row.points > 0 && <b>+{formatChancePoints(row.points)}</b>}</span>}
        </div>;
      })}
    </div>
  </section>;
}

type BoardProps = {
  state: CrownChanceState; frame?: ChanceActivity; design: PokerDiceSet; mask: number; hands: ChanceHand[]; choices: ChanceHand[]; selected?: ChanceHand;
  canPlay: boolean; locked: boolean; mySeat?: number; connection?: string; record?: string; reward?: string;
  onToggle: (index: number) => void; onPick: (mask: number) => void; onAllHands: () => void; onMoves: () => void;
  onMove: (move: CrownChanceMove) => void; onLeave: () => void;
};

export function CrownChanceBoard({
  state, frame, design, mask, hands, choices, selected, canPlay, locked, mySeat, connection, record, reward,
  onToggle, onPick, onAllHands, onMoves, onMove, onLeave,
}: BoardProps) {
  const finished = state.phase === 'finished' && !frame;
  const player = state.players[frame?.seat ?? state.turn]!;
  const last = frame ?? state.activity?.at(-1);
  const bust = last?.kind === 'roll' && last.lost !== undefined ? last : undefined;
  const hotClaim = frame?.kind === 'claim' && frame.hot;
  const hot = frame ? hotClaim : state.claimed.every(Boolean);
  const frameRoll = frame && (state.activity ?? []).slice().reverse().find(event =>
    event.id <= frame.id && event.seat === frame.seat && event.kind === 'roll');
  const visibleDice = frameRoll?.kind === 'roll' ? frameRoll.dice : state.dice;
  const visibleClaimed = frame ? visibleDice.map((_, index) => hotClaim ||
    (frameRoll?.kind === 'roll' && !frameRoll.rolled[index])) : state.claimed;
  const turnEvents = frame ? (state.activity ?? []).filter(event => event.id <= frame.id).reverse() : [];
  let replayPoints = frame?.kind === 'bank' ? frame.points : 0;
  for (const event of frame?.kind === 'bank' ? [] : turnEvents) {
    if (event.id !== frame?.id && (event.kind === 'bank' || event.kind === 'roll' && event.lost !== undefined)) break;
    if (event.kind === 'claim') replayPoints += event.points;
  }
  const rolled = state.dice.some(Boolean);
  const canSelect = canPlay && !finished && rolled && !hot;
  const rollHands = frame?.kind === 'roll' && !bust
    ? chanceHands({ ...state, phase: 'play', dice: visibleDice, claimed: visibleClaimed }) : [];
  const playableMask = (canSelect ? hands : rollHands).reduce((available, hand) => available | hand.mask, 0);
  const nextMask = canSelect ? hands.reduce((available, hand) =>
    (hand.mask & mask) === mask ? available | hand.mask : available, 0) : 0;
  const remaining = hot ? 6 : state.claimed.filter(claimed => !claimed).length;
  const opened = state.scores[state.turn]!.points > 0;
  const target = state.challenge === 'attack' ? '10-turn Score Attack' : `${formatChancePoints(CHANCE_TARGETS[state.length])} point target`;
  const limit = state.challenge ? CHANCE_LIMITS[state.challenge] : 0;
  const turnTitle = finished
    ? state.challenge === 'attack' ? 'Score Attack complete' : state.challenge ? state.winners.length ? 'Target reached' : 'Turn limit reached' : `${state.players[state.winners[0]!]!.name} wins`
    : frame && player.bot ? `${player.name}’s turn` : state.players.length === 1 || mySeat === (frame?.seat ?? state.turn) ? 'Your turn' : `${player.name}’s turn`;
  const notice = last?.kind === 'bank'
    ? `${state.players[last.seat]?.name} banked ${formatChancePoints(last.points)} points.${state.notice.includes('Tied leaders') ? ' Tied leaders take another turn each.' : ''}`
    : state.notice;
  const guidance = !opened && !state.qualified
    ? 'First bank requires a pair or better.'
    : !opened && state.pending < state.minimum
      ? `${formatChancePoints(state.minimum - state.pending)} more points to open.`
      : hot ? 'All six dice are available again.'
        : state.available && state.pending ? 'Bank your turn points or risk another roll.' : '';

  return <section className="chance-board" aria-label="Crown & Chance playing table">
    <header className="chance-round">
      <span>{target}{state.finalRound && ' · Final round'}{limit > 0 && ` · ${state.scores[0]!.turns}/${limit} turns`}</span>
      <strong role="status">{turnTitle}</strong>
      {connection && <span className="fd-connection" data-healthy={connection !== 'Offline'}>{connection}</span>}
    </header>

    <div className="chance-scoreboard">
      <div className="chance-scores chance-player-scores" aria-label="Banked player scores">
        {state.players.map((seat, index) => <article key={seat.id} data-turn={!finished && index === state.turn}>
          <span>{seat.bot ? 'Computer' : mySeat === index || state.players.length === 1 ? 'You' : `Player ${index + 1}`}</span>
          <strong title={seat.name}>{seat.name}</strong>
          <b>{formatChancePoints(state.scores[index]!.points)}</b>
          <small>{state.scores[index]!.turns} turns · {state.scores[index]!.busts} busts</small>
          <small>{state.scores[index]!.hot} Hot Dice · best bank {formatChancePoints(state.scores[index]!.best)}</small>
          <button type="button" className="fk-score-record-link" aria-label={`Score record for ${seat.name}`} onClick={onMoves}>Record</button>
        </article>)}
      </div>
      <ChanceScoringGuide selected={selected}/>
    </div>

    <section className="chance-arena" data-bust={Boolean(bust)} aria-label="Turn dice layout">
      <ClaimedDice state={state} design={design} through={frame?.id}/>
      <div className="chance-turn-total">
        <span>{bust ? 'Turn points lost' : 'This turn · at risk'}</span>
        <strong>{formatChancePoints(bust?.lost ?? (frame ? replayPoints : state.pending))}</strong>
        {hot && !hotClaim && <b className="fk-final">Hot Dice</b>}
      </div>
      <div className="chance-feedback" role="status" aria-live="polite">
        {bust ? <div className="fk-farkle-callout" key={bust.id}>
          <strong>Bust</strong><span>{state.players[bust.seat]?.name} lost {formatChancePoints(bust.lost!)} unbanked points.</span>
        </div> : hotClaim ? <HotDiceCallout key={frame.id} player={player.name}/> : frame?.kind === 'roll' ? <>
          <strong>{player.name} rolled</strong><span>{frame.dice.filter((_, index) => frame.rolled[index]).map(value => rank[value - 1]).join(' · ')}</span>
        </> : frame?.kind === 'claim' ? <strong>{player.name} claimed {frame.hand} · +{formatChancePoints(frame.points)}</strong> : <>
          <strong>{selected ? `${selected.name} · +${formatChancePoints(selected.points)}`
            : mask ? nextMask ? 'Add a glowing die to complete your hand.' : 'This selection doesn’t score.'
              : hot ? 'Hot Dice!' : notice}</strong>
          {guidance && !finished && <span>{guidance}</span>}
        </>}
      </div>
    </section>

    {!finished && <>
      <section className="chance-smart fk-smart" aria-label="Scoring hints">
        <header>
          <h2>{choices.length ? `${choices.length} scoring ${choices.length === 1 ? 'hand' : 'hands'}` : 'Scoring hints'}</h2>
          {choices.length > 4 && <button type="button" onClick={onAllHands}>All hands</button>}
          <button type="button" disabled={!canSelect || !hands.length} onClick={() => hands[0] && onPick(hands[0].mask)}>Hint</button>
        </header>
        {choices.length ? <ChanceHandOptions hands={choices.slice(0, 4)} dice={state.dice} mask={mask} onPick={onPick} disabled={!canSelect}/>
          : <p>{hot ? 'Bank or roll all six dice again.' : locked ? 'Checking the latest move…' : !canPlay ? `Waiting for ${player.name}.` : 'Roll, then tap glowing dice or pick a scoring hand.'}</p>}
      </section>

      <div className="chance-dock">
        <div className="chance-dice chance-live-dice" aria-label="Six poker dice">
          {visibleDice.map((value, index) => {
            const bit = 1 << index;
            const claimed = visibleClaimed[index] ?? false;
            const picked = Boolean(mask & bit);
            const scores = Boolean(playableMask & bit);
            const completes = Boolean((frame?.kind === 'roll' ? playableMask : nextMask) & bit);
            const label = claimed ? 'Claimed' : picked ? 'Selected' : completes ? 'Can score' : value ? 'In play' : 'Ready';
            return <button key={index} type="button" aria-pressed={picked} data-claimed={claimed}
              data-scores={scores} data-completes={completes} disabled={!canSelect || !value || claimed}
              aria-label={`Die ${index + 1}: ${value ? rankName[value - 1] : 'ready'}${value ? `, ${label.toLowerCase()}` : ''}`}
              onClick={() => onToggle(index)}>
              <span className="chance-die-face" key={last?.kind === 'roll' && last.rolled[index] && (Boolean(frame) || !bust) ? last.id : 'settled'}
                data-roll={last?.kind === 'roll' && last.rolled[index] && (Boolean(frame) || !bust)}>
                <PokerDieFace value={value || index + 1} ghost={!value} held={claimed || picked} design={design}/>
              </span>
              <span className="chance-die-label">{label}</span>
            </button>;
          })}
        </div>
        <div className="chance-play-actions">
          <button type="button" className="fk-bank" disabled={!canPlay || !chanceCanBank(state)} onClick={() => onMove({ t: 'bank' })}>Bank {formatChancePoints(state.pending)}</button>
          <button type="button" className="fd-primary" disabled={!canPlay || !selected} onClick={() => selected && onMove({ t: 'claim', mask: selected.mask })}>
            {selected ? `Claim +${formatChancePoints(selected.points)}` : 'Claim hand'}
          </button>
          <button type="button" className="fd-primary" disabled={!canPlay || !state.available} onClick={() => onMove({ t: 'roll' })}>
            {hot ? 'Roll 6 · Hot Dice' : `Roll ${remaining} dice`}
          </button>
        </div>
      </div>
    </>}

    <footer className="chance-board-footer">
      {record && <p>{record}</p>}
      {reward && <p role="status">{reward}</p>}
      <button type="button" className="btn-ghost-gold" disabled={locked} onClick={onLeave}>{finished ? 'Play again' : 'Leave game'}</button>
    </footer>
  </section>;
}

function eventLabel(event: ChanceActivity) {
  if (event.kind === 'bank') return { move: 'Banked', detail: `+${formatChancePoints(event.points)} · ${formatChancePoints(event.total)} total` };
  if (event.kind === 'claim') return { move: event.hand, detail: `+${formatChancePoints(event.points)}${event.hot ? ' · Hot Dice' : ''}` };
  return event.lost !== undefined
    ? { move: 'Bust', detail: `${formatChancePoints(event.lost)} unbanked points lost` }
    : { move: event.hot ? 'Hot Dice roll' : 'Roll', detail: '' };
}

export function ChanceMoveHistory({ state }: { state?: CrownChanceState | null }) {
  const activity = state?.activity ?? [];
  if (!activity.length) return <p>Rolls, claims, banks, and busts will appear here as you play.</p>;
  return <ol className="fk-history chance-history" reversed>
    {activity.slice().reverse().map(event => {
      const { move, detail } = eventLabel(event);
      const dice = event.kind === 'roll' ? event.dice.filter((_, index) => event.rolled[index]) : event.kind === 'claim' ? event.dice : [];
      return <li key={event.id} data-bust={event.kind === 'roll' && event.lost !== undefined}>
        <strong>{state?.players[event.seat]?.name} · {move}</strong>
        <span>{dice.map(value => rank[value - 1]).join(' · ')}{dice.length > 0 && detail && ' · '}{detail}</span>
      </li>;
    })}
  </ol>;
}
