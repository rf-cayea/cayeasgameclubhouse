import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useReducer } from "react";
import { RummyHand } from "@/components/RummyHand";
import { bestArrangement, JOKER_PERK, newGame, sortHandByRank, sortHandBySuit, VARIANTS, type Card, type State, type Variant } from "@/lib/rummy";
import { useClubhouse } from "@/lib/clubhouse";
import { JOKER_MODE } from "@/lib/store";


interface HandTable { game: State; history: Card[][]; notice: string; dealId: number }
type TableAction = { t: "deal"; game: State } | { t: "arrange"; cards: Card[]; notice: string } | { t: "undo" };

function deal(variant: Variant, jokers = false) {
  return newGame(variant, [
    { id: "practice-you", name: "You", bot: false },
    { id: "practice-opponent", name: "Opponent", bot: true },
  ], Math.random, 1, jokers);
}

function tableReducer(state: HandTable, action: TableAction): HandTable {
  if (action.t === "deal") return { game: action.game, history: [], notice: "New hand dealt. Arrange your cards any way you like.", dealId: state.dealId + 1 };
  const hand = state.game.hands[0]!;
  if (action.t === "undo") {
    const previous = state.history.at(-1);
    return previous ? { ...state, game: { ...state.game, hands: [previous, ...state.game.hands.slice(1)] }, history: state.history.slice(0, -1), notice: "Previous hand arrangement restored." } : state;
  }
  // Reordering never creates, removes, or plays a card, including stale drag results.
  if (action.cards.length !== hand.length || new Set(action.cards).size !== hand.length || action.cards.some(card => !hand.includes(card))) return state;
  if (action.cards.every((card, index) => card === hand[index])) return { ...state, notice: action.notice };
  return { ...state, game: { ...state.game, hands: [[...action.cards], ...state.game.hands.slice(1)] }, history: [...state.history.slice(-19), hand], notice: action.notice };
}

const compactCard = (card: Card) => card.startsWith("X") ? `Joker ${card[1]}` : `${card[0] === "T" ? "10" : card[0]}${({ S: "♠", H: "♥", D: "♦", C: "♣" } as Record<string, string>)[card[1]!]}`;

export function RummyPractice() {
  const [{ game, history, notice, dealId }, dispatch] = useReducer(tableReducer, undefined, () => ({
    game: deal("classic"), history: [], notice: "Drag cards to organize your hand, or try Best sort.", dealId: 0,
  }));
  const { wallet } = useClubhouse();
  const ownsJokers = wallet?.owned.includes(JOKER_PERK) ?? false;
  const hand = game.hands[0]!;
  const handKey = [...hand].sort().join(",");
  const analysis = useMemo(() => bestArrangement(handKey ? handKey.split(",") : [], game.variant), [handKey, game.variant]);
  useEffect(() => {
    if (game.jokers && !ownsJokers) dispatch({ t: "deal", game: deal(game.variant) });
  }, [ownsJokers, game.jokers, game.variant]);

  const arrange = (cards: Card[], message: string) => dispatch({ t: "arrange", cards, notice: message });
  return <div>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="mt-1 font-display text-3xl text-gold">Hand practice</h2><p className="mt-2 text-muted-foreground">Arrange a hand without starting a match.</p></div>
      <span className="chip">Hand practice</span>
    </div>
    <section className="my-5 rounded-xl border border-border bg-background/65 p-4" aria-label="Table settings">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><label htmlFor="rummy-variant" className="block text-sm text-muted-foreground">Rummy variant</label><select id="rummy-variant" value={game.variant} onChange={event => dispatch({ t: "deal", game: deal(event.target.value as Variant, Boolean(game.jokers && ownsJokers)) })} className="mt-1 rounded-xl border border-border bg-background px-3 py-2 text-foreground">{(Object.keys(VARIANTS) as Variant[]).map(variant => <option key={variant} value={variant}>{VARIANTS[variant].name}</option>)}</select></div>
        <button className="btn-ghost-gold" onClick={() => dispatch({ t: "deal", game: deal(game.variant, Boolean(game.jokers && ownsJokers)) })}>Deal a new hand</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(game.jokers && ownsJokers)} disabled={!ownsJokers} onChange={event => dispatch({ t: "deal", game: deal(game.variant, event.target.checked && ownsJokers) })} />Joker Mode</label>
        {!ownsJokers && <Link to="/store" className="text-gold underline">Unlock for {JOKER_MODE.price} Rummy+ points</Link>}
      </div>
    </section>

    <section className="rummy-table mt-6 px-4 py-8 sm:px-8" aria-labelledby="hand-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="hand-heading" className="font-display text-3xl text-gold">Your hand</h2><span className="text-sm text-muted-foreground">{hand.length} cards · {VARIANTS[game.variant].name}</span></div>
      <div className="hand-toolbar" aria-label="Hand sorting controls">
        <button className="btn-gold" onClick={() => arrange([...analysis.melds.flat(), ...analysis.deadwood], `Best sort applied: ${analysis.melds.length} ${analysis.melds.length === 1 ? "meld" : "melds"}, ${analysis.dw} deadwood points.`)}>Best sort</button>
        <button className="btn-ghost-gold" onClick={() => arrange(sortHandBySuit(hand), "Hand sorted by suit, then rank.")}>Sort by suit</button>
        <button className="btn-ghost-gold" onClick={() => arrange(sortHandByRank(hand), "Hand sorted by rank, then suit.")}>Sort by rank</button>
        <button className="btn-ghost-gold" disabled={history.length === 0} onClick={() => dispatch({ t: "undo" })}>Undo arrangement</button>
      </div>
      <RummyHand key={dealId} cards={hand} onReorder={cards => arrange(cards, "Hand reordered. Your cards are unchanged.")} />
      <p role="status" aria-live="polite" className="mt-3 min-h-7 text-sm text-gold">{notice}</p>
    </section>

    <section className="mt-5 rounded-xl border border-border bg-background/65 p-4" aria-labelledby="meld-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="meld-heading" className="font-display text-2xl text-gold">Meld suggestions</h2><p className="chip" data-testid="deadwood">Lowest deadwood: {analysis.dw} points</p></div>
      <p className="mt-2 text-sm text-muted-foreground">Best sort groups compatible sets and runs without using a card twice, then places the remaining cards at the end. It arranges your hand; it does not play a meld.</p>
      {analysis.melds.length ? <ol className="mt-4 flex flex-wrap gap-3" aria-label="Suggested melds">{analysis.melds.map((meld, index) => <li key={meld.join(",")} className="rounded-xl border border-border bg-background px-4 py-3"><span className="block text-xs text-muted-foreground">Meld {index + 1}</span><span className="text-lg tracking-wider text-gold">{meld.map(compactCard).join("  ")}</span></li>)}</ol> : <p className="mt-4 text-sm text-muted-foreground">No complete meld in this hand yet. Try grouping matching ranks or neighboring cards of one suit.</p>}
      {analysis.deadwood.length > 0 && <p className="mt-4 text-sm text-muted-foreground">Unmatched cards: <span className="text-foreground">{analysis.deadwood.map(compactCard).join(" · ")}</span></p>}
    </section>
    <p className="mt-6 text-sm text-muted-foreground">Hand practice does not change an active game or earn points.</p>
  </div>;
}
