import { createFileRoute, Link } from "@tanstack/react-router";
import { useReducer } from "react";
import { HubNav } from "@/components/HubNav";
import { applyAction, initPlay, MAX_MAGIC_PER_WIN, type Action, type PlayState } from "@/lib/engine";
import { COLS, FREE_SHUFFLES, FREE_UNDOS, isBlocked, ROWS, THEMES, themeFor, TOTAL_LEVELS, TRAY_SIZE } from "@/lib/game";

export const Route = createFileRoute("/games/faith-3")({
  head: () => ({ meta: [{ title: "Faith 3 Tile Match — Local practice | Cayea's Game Clubhouse" }] }),
  component: Faith3Page,
});

interface PracticeState { level: number; play: PlayState; notice: string }
type PracticeEvent = { t: "start"; level: number } | { t: "next" } | { t: "move"; action: Action };
const newPractice = (level: number): PracticeState => ({ level, play: initPlay(level), notice: "Choose an uncovered tile to begin." });

function practiceReducer(state: PracticeState, event: PracticeEvent): PracticeState {
  if (event.t === "next") return state.level < TOTAL_LEVELS ? newPractice(state.level + 1) : state;
  if (event.t === "start") return Number.isInteger(event.level) && event.level >= 1 && event.level <= TOTAL_LEVELS ? newPractice(event.level) : state;
  const { action } = event;
  const { play, level } = state;
  // Queued inputs must use the latest state, including the remaining assists.
  if (action.t === "undo" && (play.status === "won" || play.undoUsed >= FREE_UNDOS)) return state;
  if (action.t === "shuffle" && (play.shuffleCount >= FREE_SHUFFLES || play.board.length < 2)) return state;
  if (action.t === "magic" && play.magicUsed >= MAX_MAGIC_PER_WIN) return state;
  const next = applyAction(level, play, action);
  if (!next) return state;
  const notice = next.status === "won" ? "Level cleared! This was local practice; no points were awarded."
    : next.status === "lost" ? "The tray is full. Undo your last move if an undo remains, or restart this level."
      : action.t === "undo" ? "Last tile pick undone."
        : action.t === "shuffle" ? "Board tiles shuffled. Look for a new match."
          : action.t === "magic" ? "Magic cleared a matching triple."
            : next.matches > play.matches ? "Three matching tiles cleared!"
              : `Tile added to the tray. ${TRAY_SIZE - next.tray.length} slots remain.`;
  return { ...state, play: next, notice };
}

function Faith3Page() {
  const [{ level, play, notice }, dispatch] = useReducer(practiceReducer, 1, newPractice);
  const theme = THEMES[themeFor(level)];
  const canUndo = play.status !== "won" && play.history.length > 0 && play.undoUsed < FREE_UNDOS;
  const startLevel = (nextLevel: number) => dispatch({ t: "start", level: nextLevel });
  const act = (action: Action) => dispatch({ t: "move", action });

  return (
    <>
      <HubNav />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-4 sm:py-10">
        <Link to="/" className="text-sm text-gold underline">← Back to the hub</Link>
        <h1 className="mt-3 font-display text-4xl text-gold sm:text-5xl">Faith 3 Tile Match</h1>
        <p className="mt-3 rounded-xl border border-border bg-secondary px-4 py-3 text-sm" role="status">Local practice · progress and points are not saved</p>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-gold">Level {level} · {theme.name}</h2>
            <p className="text-sm text-muted-foreground">{play.board.length} tiles left · {play.matches} triples matched</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="practice-level" className="text-sm">Level</label>
            <select id="practice-level" value={level} onChange={(event) => startLevel(Number(event.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-foreground">
              {Array.from({ length: TOTAL_LEVELS }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
            </select>
            <button className="btn-ghost-gold text-sm" onClick={() => startLevel(level)}>Restart level</button>
            <button className="btn-gold text-sm" disabled={level === TOTAL_LEVELS} onClick={() => dispatch({ t: "next" })}>Next level</button>
          </div>
        </div>

        <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${play.status === "lost" ? "border-destructive text-destructive" : "border-border text-gold"}`} role="status" aria-live="polite">{notice}</p>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-2xl border border-border bg-background/70 p-2 sm:p-4" aria-label="Tile board">
            <div className="relative mx-auto w-full max-w-[540px]" style={{ aspectRatio: `${COLS * 2 + .6} / ${ROWS * 2 + .6}` }}>
              {play.board.map((tile) => {
                const blocked = isBlocked(tile, play.board);
                const symbol = theme.tiles[tile.type] ?? "?";
                return (
                  <button key={tile.id} type="button" disabled={blocked || play.status !== "play"}
                    aria-label={`Pick ${symbol} tile ${tile.id}`}
                    title={blocked ? "This tile is covered by another tile." : `Pick ${symbol}`}
                    onClick={() => act({ t: "pick", id: tile.id })}
                    className="absolute flex items-center justify-center rounded-lg border-2 border-[#b59b65] bg-[#f4e9cc] text-[clamp(1.25rem,4vw,2.5rem)] leading-none shadow-[0_3px_0_#8a7046] transition-colors hover:bg-[#fff7e5] disabled:cursor-not-allowed disabled:opacity-100 disabled:brightness-[.7] focus-visible:z-50"
                    style={{
                      left: `${(tile.x + tile.z * .1 + .3) / (COLS * 2 + .6) * 100}%`,
                      top: `${(tile.y - tile.z * .1 + .5) / (ROWS * 2 + .6) * 100}%`,
                      width: `${1.88 / (COLS * 2 + .6) * 100}%`,
                      height: `${1.88 / (ROWS * 2 + .6) * 100}%`,
                      zIndex: 10 + tile.z * 100,
                    }}>
                    <span aria-hidden="true">{symbol}</span>
                  </button>
                );
              })}
              {play.status === "won" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"><span className="text-5xl" aria-hidden="true">✨</span><p className="font-display text-3xl text-gold">Level cleared</p><p className="max-w-xs text-sm text-muted-foreground">Try another level or restart to play this layout again.</p></div>}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="card-hub !p-4" aria-label="Your tray">
              <h2 className="font-display text-xl text-gold">Your tray</h2>
              <p className="mt-1 text-sm text-muted-foreground">{play.tray.length} of {TRAY_SIZE} slots filled</p>
              <ol className="mt-3 grid grid-cols-7 gap-1" aria-label="Tray slots">
                {Array.from({ length: TRAY_SIZE }, (_, index) => {
                  const tile = play.tray[index];
                  const symbol = tile ? theme.tiles[tile.type] ?? "?" : "";
                  return <li key={index} aria-label={`Slot ${index + 1}: ${symbol || "empty"}`}
                    className={`flex aspect-[.8] items-center justify-center rounded-md border text-xl ${tile ? "border-[#b59b65] bg-[#f4e9cc]" : "border-border bg-background"}`}><span aria-hidden="true">{symbol || "·"}</span></li>;
                })}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Collect three of the same symbol to clear them. Filling all seven slots ends the round.</p>
            </section>

            <section className="card-hub !p-4">
              <h2 className="font-display text-xl text-gold">Practice assistance</h2>
              <p className="mt-1 text-sm text-muted-foreground">Free for this local round.</p>
              <div className="mt-3 grid gap-2">
                <button className="btn-ghost-gold text-sm" disabled={!canUndo} onClick={() => act({ t: "undo" })}>Undo · {Math.max(0, FREE_UNDOS - play.undoUsed)} left</button>
                <button className="btn-ghost-gold text-sm" disabled={play.status !== "play" || play.shuffleCount >= FREE_SHUFFLES || play.board.length < 2} onClick={() => act({ t: "shuffle" })}>Shuffle · {Math.max(0, FREE_SHUFFLES - play.shuffleCount)} left</button>
                <button className="btn-ghost-gold text-sm" disabled={play.status !== "play" || play.magicUsed >= MAX_MAGIC_PER_WIN} onClick={() => act({ t: "magic" })}>Magic clear · {Math.max(0, MAX_MAGIC_PER_WIN - play.magicUsed)} left</button>
              </div>
            </section>

            <section className="card-hub !p-4">
              <h2 className="font-display text-xl text-gold">How to play</h2>
              <p className="mt-2 text-sm text-muted-foreground">Pick tiles that are not covered by higher tiles. Dimmed tiles cannot be picked yet. Match three identical symbols in your tray and clear the board.</p>
              <p className="mt-3 text-xs text-muted-foreground">This version uses the supplied procedural layout generator. Original mahjong layouts and server-verified rewards are not included.</p>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
