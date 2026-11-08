import { allowsHighAce, bestArrangement, cardValue, isJoker, isMeld, isSet, newGame, rankOf, suitOf, type Card, type Level, type Meld, type Move, type PublicPlay, type State, type Variant } from './rummy';

const points = (cards: Card[], variant: Variant) => cards.reduce((total, card) => total + cardValue(card, variant), 0);
const pick = <T,>(values: T[], count: number): T[][] => count === 0 ? [[]] : values.flatMap((value, i) => pick(values.slice(i + 1), count - 1).map(rest => [value, ...rest]));

/** Enumerate legal melds without a 32-bit hand mask; Rummy 500 can hold large piles. */
export function legalMelds(hand: Card[], variant: Variant): Card[][] {
  const result = new Map<string, Card[]>();
  const wild = hand.filter(isJoker);
  const add = (cards: Card[]) => {
    const key = [...cards].sort().join(',');
    if (!result.has(key) && isMeld(cards, variant)) result.set(key, cards);
  };
  for (let rank = 1; rank <= 13; rank++) {
    const natural = hand.filter(card => !isJoker(card) && rankOf(card) === rank);
    for (let n = 0; n <= wild.length; n++) for (const jokers of pick(wild, n)) {
      for (const size of [3, 4]) if (size - n > 0) for (const cards of pick(natural, size - n)) add([...cards, ...jokers]);
    }
  }
  for (const suit of 'SHDC') {
    const natural = new Map(hand.filter(card => !isJoker(card) && suitOf(card) === suit).map(card => [rankOf(card), card]));
    if (allowsHighAce(variant) && natural.has(1)) natural.set(14, natural.get(1)!);
    const max = allowsHighAce(variant) ? 14 : 13;
    for (let length = 3; length <= 13; length++) for (let start = 1; start <= max - length + 1; start++) {
      const available: Card[] = [];
      for (let rank = start; rank < start + length; rank++) if (natural.has(rank)) available.push(natural.get(rank)!);
      const missing = length - available.length;
      for (let n = missing; n <= wild.length; n++) {
        const omit = n - missing;
        if (omit < 0 || omit >= available.length) continue;
        for (const excluded of pick(available, omit)) for (const jokers of pick(wild, n)) add([...available.filter(card => !excluded.includes(card)), ...jokers]);
      }
    }
  }
  return [...result.values()].sort((a, b) => points(b, variant) - points(a, variant) || b.length - a.length || a.join(',').localeCompare(b.join(',')));
}

/** Exact on ordinary hands; large R500 piles get a bounded, legal suggestion. */
export function analyseHand(hand: Card[], variant: Variant) {
  if (hand.length <= 20) return { ...bestArrangement(hand, variant), optimal: true };
  let remaining = [...hand];
  const melds: Card[][] = [];
  for (const meld of legalMelds(hand, variant)) if (meld.every(card => remaining.includes(card))) {
    melds.push(meld);
    remaining = remaining.filter(card => !meld.includes(card));
  }
  return { melds, deadwood: remaining, dw: points(remaining, variant), optimal: false };
}

export function canLayOff(card: Card, meld: Meld, variant: Variant) {
  return isMeld([...meld.cards.map(value => value.c), card], variant);
}

export function canTakeDiscard(state: Pick<State, 'discard' | 'variant' | 'opening' | 'hands' | 'turn' | 'melds'>, index = state.discard.length - 1) {
  if (!Number.isInteger(index) || index < 0 || index >= state.discard.length) return false;
  if (state.variant !== 'r500') return index === state.discard.length - 1 && state.opening !== 'stock';
  const card = state.discard[index]!;
  const hand = [...state.hands[state.turn]!, ...state.discard.slice(index)];
  return state.melds.some(meld => canLayOff(card, meld, state.variant)) || legalMelds(hand, state.variant).some(meld => meld.includes(card));
}

function finishRound(state: State, out: number | null, gains: number[], note: string): State {
  state.scores = state.scores.map((score, i) => score + gains[i]!);
  const high = Math.max(...state.scores);
  const leaders = state.scores.flatMap((score, i) => score === high ? [i] : []);
  state.winner = high >= state.target && leaders.length === 1 ? leaders[0]! : null;
  state.phase = state.winner === null ? 'roundOver' : 'gameOver';
  state.roundResult = { winner: out, points: gains, note };
  state.log.push(note);
  return state;
}

function scoreOut(state: State, out: number | null, exhausted = false) {
  const gains = state.players.map(() => 0);
  if (state.variant === 'r500') {
    state.hands.forEach((hand, i) => { gains[i] = state.laid[i]! - points(hand, state.variant); });
  } else if (out !== null) {
    gains[out] = state.hands.reduce((sum, hand, i) => sum + (i === out ? 0 : points(hand, state.variant)), 0);
  }
  return finishRound(state, out, gains, exhausted ? 'Stock exhausted. Round scored.' : `${state.players[out!]?.name ?? 'Round'} went out.`);
}

/** Best opponent defence: choose melds and sequence of legal layoffs jointly. */
export function ginDefence(hand: Card[], knockMelds: Card[][]): number {
  const masks = legalMelds(hand, 'gin').map(meld => meld.reduce((mask, card) => mask | (1 << hand.indexOf(card)), 0));
  const totals = new Set<number>([0]);
  for (const mask of masks) for (const used of [...totals]) if (!(mask & used)) totals.add(mask | used);
  const cache = new Map<string, number>();
  const lay = (mask: number, groups: Card[][]): number => {
    const key = `${mask}:${groups.map(group => [...group].sort().join('.')).join('|')}`;
    if (cache.has(key)) return cache.get(key)!;
    let best = hand.reduce((sum, card, i) => sum + (mask & (1 << i) ? cardValue(card, 'gin') : 0), 0);
    for (let i = 0; i < hand.length; i++) if (mask & (1 << i)) {
      for (let g = 0; g < groups.length; g++) if (isMeld([...groups[g]!, hand[i]!], 'gin')) {
        best = Math.min(best, lay(mask ^ (1 << i), groups.map((group, n) => n === g ? [...group, hand[i]!] : group)));
      }
    }
    cache.set(key, best);
    return best;
  };
  let best = points(hand, 'gin');
  for (const melded of totals) best = Math.min(best, lay(((1 << hand.length) - 1) ^ melded, knockMelds));
  return best;
}

function scoreKnock(state: State, actor: number) {
  const arrangement = bestArrangement(state.hands[actor]!, 'gin');
  const opponent = 1 - actor;
  const defence = arrangement.dw === 0 ? bestArrangement(state.hands[opponent]!, 'gin').dw : ginDefence(state.hands[opponent]!, arrangement.melds);
  const gains = [0, 0];
  const winner = arrangement.dw === 0 || arrangement.dw < defence ? actor : opponent;
  gains[winner] = arrangement.dw === 0 ? 25 + defence : winner === actor ? defence - arrangement.dw : 25 + arrangement.dw - defence;
  return finishRound(state, winner, gains, `${state.players[actor]!.name} ${arrangement.dw === 0 ? 'went Gin' : 'knocked'} (${arrangement.dw} deadwood). ${state.players[winner]!.name} scores ${gains[winner]}${winner !== actor ? ' with an undercut' : ''}.`);
}

export function parseMove(value: unknown): Move | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const move = value as Record<string, unknown>;
  const keys = Object.keys(move);
  if ((move.t === 'next' || move.t === 'pass') && keys.length === 1) return { t: move.t };
  if (move.t === 'draw' && move.from === 'stock' && keys.length === 2) return { t: 'draw', from: 'stock' };
  if (move.t === 'draw' && move.from === 'discard' && keys.every(key => ['t', 'from', 'index'].includes(key)) &&
    (move.index === undefined || Number.isInteger(move.index))) return { t: 'draw', from: 'discard', ...(move.index === undefined ? {} : { index: Number(move.index) }) };
  if (move.t === 'meld' && keys.length === 2 && Array.isArray(move.cards) && move.cards.length >= 3 && move.cards.length <= 13 && move.cards.every(card => typeof card === 'string')) return { t: 'meld', cards: move.cards as Card[] };
  if (move.t === 'layoff' && keys.length === 3 && typeof move.card === 'string' && Number.isInteger(move.meld)) return { t: 'layoff', card: move.card, meld: Number(move.meld) };
  if (move.t === 'discard' && keys.every(key => ['t', 'card', 'knock'].includes(key)) && typeof move.card === 'string' && (move.knock === undefined || typeof move.knock === 'boolean')) return { t: 'discard', card: move.card, ...(move.knock === undefined ? {} : { knock: move.knock as boolean }) };
  return null;
}

/** Immutable, server-replayable rules. A rejected move never changes state. */
export function applyMove(original: State, actor: number, input: Move, random = Math.random): State | null {
  const move = parseMove(input);
  if (!move || !Number.isInteger(actor) || actor < 0 || actor >= original.players.length) return null;
  if (move.t === 'next') {
    if (original.phase !== 'roundOver') return null;
    const state = newGame(original.variant, original.players, random, original.gameNo, Boolean(original.jokers));
    state.dealer = (original.dealer + 1) % state.players.length;
    state.turn = (state.dealer + 1) % state.players.length;
    state.round = original.round + 1;
    state.scores = [...original.scores];
    state.target = original.target;
    state.log = [...original.log.slice(-25), `Round ${state.round} started.`];
    return state;
  }
  if (original.turn !== actor || !['draw', 'play'].includes(original.phase)) return null;
  const state = structuredClone(original);
  const hand = state.hands[actor]!;
  const log = (message: string) => { state.log = [...state.log.slice(-39), `${state.players[actor]!.name} ${message}`]; };
  const record = (kind: PublicPlay['kind'], cards: Card[] = [], meld?: number) => {
    const activity = state.activity ?? [];
    state.activity = [...activity.slice(-39), { id: (activity.at(-1)?.id ?? 0) + 1, seat: actor, kind, cards: [...cards], ...(meld === undefined ? {} : { meld }) }];
  };
  if (move.t === 'pass') {
    if (state.variant !== 'gin' || state.phase !== 'draw' || !['first', 'dealer'].includes(state.opening ?? '')) return null;
    state.opening = state.opening === 'first' ? 'dealer' : 'stock';
    state.turn = (actor + 1) % 2;
    log('passed the opening upcard.');
    record('pass');
    return state;
  }
  if (move.t === 'draw') {
    if (state.phase !== 'draw') return null;
    if (move.from === 'discard') {
      const index = move.index ?? state.discard.length - 1;
      if (!canTakeDiscard(state, index)) return null;
      const cards = state.discard.splice(index);
      state.drewDiscard = cards[0]!;
      state.mustUse = state.variant === 'r500' ? cards[0]! : null;
      hand.push(...cards);
      log(`picked up ${cards.length === 1 ? 'the discard' : `${cards.length} discards`}.`);
      record('pickup', cards);
    } else {
      if (state.variant === 'gin' && ['first', 'dealer'].includes(state.opening ?? '')) return null;
      if (state.variant === 'gin' && state.deck.length <= 2) return finishRound(state, null, [0, 0], 'Only two stock cards remain. No points this round.');
      if (state.deck.length === 0 && state.variant === 'classic' && state.discard.length > 1) {
        const top = state.discard.pop()!;
        const rest = state.discard;
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j]!, rest[i]!]; }
        state.deck = rest;
        state.discard = [top];
      }
      if (!state.deck.length) return scoreOut(state, null, true);
      hand.push(state.deck.pop()!);
      state.drewDiscard = null;
      state.mustUse = null;
      log('drew from the stock.');
      record('stock');
    }
    state.opening = null;
    state.phase = 'play';
    return state;
  }
  if (state.phase !== 'play') return null;
  if (move.t === 'meld') {
    if (state.variant === 'gin' || !isMeld(move.cards, state.variant) || !move.cards.every(card => hand.includes(card))) return null;
    state.hands[actor] = hand.filter(card => !move.cards.includes(card));
    state.melds.push({ cards: move.cards.map(c => ({ c, by: actor })) });
    state.laid[actor]! += points(move.cards, state.variant);
    if (state.mustUse && move.cards.includes(state.mustUse)) state.mustUse = null;
    log(`melded ${move.cards.length} cards.`);
    record('meld', move.cards, state.melds.length - 1);
  } else if (move.t === 'layoff') {
    const meld = state.melds[move.meld];
    if (state.variant === 'gin' || !hand.includes(move.card) || !meld || !canLayOff(move.card, meld, state.variant)) return null;
    state.hands[actor] = hand.filter(card => card !== move.card);
    meld.cards.push({ c: move.card, by: actor });
    state.laid[actor]! += cardValue(move.card, state.variant);
    if (state.mustUse === move.card) state.mustUse = null;
    log('laid off one card.');
    record('layoff', [move.card], move.meld);
  } else if (move.t === 'discard') {
    if (!hand.includes(move.card) || state.drewDiscard === move.card || state.mustUse) return null;
    const remaining = hand.filter(card => card !== move.card);
    if (move.knock && (state.variant !== 'gin' || bestArrangement(remaining, 'gin').dw > 10)) return null;
    state.hands[actor] = remaining;
    state.discard.push(move.card);
    state.drewDiscard = null;
    state.turns = (state.turns ?? 0) + 1;
    log('discarded a card.');
    record('discard', [move.card]);
    if (state.variant === 'gin' && move.knock) return scoreKnock(state, actor);
    if (remaining.length === 0) return scoreOut(state, actor);
    if (state.turns >= 500) return state.variant === 'r500' ? scoreOut(state, null, true) : finishRound(state, null, state.players.map(() => 0), 'Round ended after 500 turns without a winner.');
    state.turn = (actor + 1) % state.players.length;
    state.phase = 'draw';
    return state;
  } else return null;
  return state.hands[actor]!.length === 0 && !state.mustUse ? scoreOut(state, actor) : state;
}

/** Bots inspect their own hand and public piles only; no opponent/deck peeking. */
export function botMove(state: State, actor: number, level: Level = 'normal', random = Math.random): Move | null {
  if (actor !== state.turn || !['draw', 'play'].includes(state.phase)) return null;
  const hand = state.hands[actor]!;
  if (state.phase === 'draw') {
    const current = analyseHand(hand, state.variant).dw;
    const indices = state.variant === 'r500' ? state.discard.map((_, i) => i).reverse() : [state.discard.length - 1];
    for (const index of indices) if (canTakeDiscard(state, index)) {
      const next = [...hand, ...state.discard.slice(index)];
      if (level !== 'easy' && analyseHand(next, state.variant).dw <= current) return { t: 'draw', from: 'discard', index };
    }
    if (state.variant === 'gin' && ['first', 'dealer'].includes(state.opening ?? '')) return { t: 'pass' };
    return { t: 'draw', from: 'stock' };
  }
  if (state.variant !== 'gin') {
    const candidates = legalMelds(hand, state.variant);
    const optimal = level === 'hard' && !state.mustUse ? analyseHand(hand, state.variant).melds : [];
    const meld = optimal[0] ?? candidates.find(cards => !state.mustUse || cards.includes(state.mustUse));
    if (meld) return { t: 'meld', cards: meld };
    for (const card of hand) for (let i = 0; i < state.melds.length; i++) if ((!state.mustUse || state.mustUse === card) && canLayOff(card, state.melds[i]!, state.variant)) return { t: 'layoff', card, meld: i };
  }
  const eligible = hand.filter(card => card !== state.drewDiscard);
  if (!eligible.length || state.mustUse) return null;
  const rated = eligible.map(card => ({ card, debt: analyseHand(hand.filter(c => c !== card), state.variant).dw }));
  rated.sort((a, b) => a.debt - b.debt || cardValue(b.card, state.variant) - cardValue(a.card, state.variant) || a.card.localeCompare(b.card));
  const chosen = level === 'easy' ? rated[Math.floor(random() * rated.length)]! : rated[0]!;
  return { t: 'discard', card: chosen.card, ...(state.variant === 'gin' && chosen.debt <= 10 && (level === 'hard' || chosen.debt === 0 || random() < .5) ? { knock: true } : {}) };
}
