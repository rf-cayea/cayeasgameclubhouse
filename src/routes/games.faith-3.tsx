import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useClubhouse } from "@/lib/clubhouse";
import { usePuzzleRewards } from "@/lib/puzzle-rewards";
import { puzzleLevelPoints } from "@/lib/economy-protocol";
import { equippedFaithSkin } from "@/lib/faith-skins";
import { FaithSkinPicker } from "@/components/FaithSkinPicker";
import { FaithTileArtwork } from "@/components/FaithTileArtwork";
import { FAITH_PALETTES, faithMotif } from "@/lib/faith-art";
import { applyAction, initPlay, MAX_MAGIC_PER_WIN, type Action, type PlayState } from "@/lib/engine";
import { FREE_SHUFFLES, FREE_UNDOS, generateLevel, isBlocked, isCovered, levelConfig, THEMES, themeFor, TOTAL_LEVELS, TRAY_SIZE } from "@/lib/game";

export const Route = createFileRoute("/games/faith-3")({
  head: () => ({ meta: [{ title: "Faith 3 Tile Match — Earn points | Cayea's Game Clubhouse" }] }),
  component: Faith3Page,
});

interface PracticeState { level: number; play: PlayState; notice: string }
type PracticeEvent = { t: "replace"; state: PracticeState } | { t: "start"; level: number } | { t: "next" } | { t: "move"; action: Action };
const newPractice = (level: number): PracticeState => ({ level, play: initPlay(level), notice: level === 1 ? "Choose an uncovered tile to begin." : level < 11 ? "Clear upper tiles to uncover the layers below." : "Plan around the obstacles. Tap Help for this level." });

function practiceReducer(state: PracticeState, event: PracticeEvent): PracticeState {
  if (event.t === "replace") return event.state;
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
  const notice = next.status === "won" ? "Level cleared!"
    : next.status === "lost" ? "The tray is full. Undo your last move if an undo remains, or restart this level."
      : next.board.length > 0 && next.board.every(tile => isBlocked(tile, next.board)) ? "No free tiles remain. Use Shuffle to release the locks, Magic clear, or Undo to try another route."
      : action.t === "undo" ? "Last tile pick undone."
        : action.t === "shuffle" ? "Tiles shuffled. Ice, seals, and veils have been cleared."
          : action.t === "magic" ? "Magic cleared a matching triple."
            : action.t === "pick" && next.board.length === play.board.length ? "Face revealed. Tap the tile again to collect it."
            : next.matches > play.matches ? "Three matching tiles cleared! Any earned seals have opened."
              : `Tile added to the tray. ${next.trayCapacity - next.tray.length} slots remain.`;
  return { ...state, play: next, notice };
}

function Faith3Page() {
  const { user, wallet, ready, applyWallet } = useClubhouse();
  const skin = equippedFaithSkin(wallet);
  const [practice, dispatch] = useReducer(practiceReducer, 1, newPractice);
  const { level, play, notice } = practice;
  const currentPractice = useRef(practice); currentPractice.current = practice;
  const rewards = usePuzzleRewards(user?.id ?? null, "faith-3");
  useEffect(() => {
    if (rewards.run) dispatch({ t: "start", level: rewards.run.level });
  }, [rewards.run?.runId]);
  useEffect(() => {
    if (play.status === "won" && rewards.run?.level === level) void rewards.complete();
  }, [play.status, rewards.run?.runId, level]);
  const rewardLine = rewards.receipt ? rewards.receipt.alreadyCredited ? "First-clear points already collected. Replay for practice." : `+${rewards.receipt.amount} Faith 3 points saved. Your profile has your rewards and badges.` : rewards.submitting ? "Verifying your clear and saving points…" : rewards.starting ? "Opening your member reward run…" : rewards.error ? `${rewards.error} ${play.status === "won" ? "Retry reward sync before starting another level." : "This board is practice until a reward run opens."}` : user && rewards.run ? `Member run · first clear earns ${puzzleLevelPoints("faith-3", level)} Faith 3 points` : "Guest practice · sign in to save progress and earn points";
  const [panel, setPanel] = useState<"tiles" | "help" | null>(null);
  const [collectionChoice, setCollectionChoice] = useState<number | null>(null);
  const collection = collectionChoice ?? themeFor(level);
  const theme = THEMES[collection];
  const challenge = levelConfig(level);
  const frozen = play.board.filter(tile => tile.frost).length;
  const sealed = play.board.filter(tile => tile.seal).length;
  const veiled = play.board.filter(tile => tile.veiled).length;
  // Bounds use the original layout so picking tiles never shifts the board.
  const bounds = useMemo(() => {
    const initial = generateLevel(level);
    const xs = initial.map(tile => tile.x + tile.z * .1), ys = initial.map(tile => tile.y - tile.z * .1);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x + 2.48, height: Math.max(...ys) - y + 2.48 };
  }, [level]);
  const waitingForReward = Boolean(user && play.status === "won" && rewards.run && !rewards.receipt);
  const canUndo = play.status !== "won" && play.history.length > 0 && play.undoUsed < FREE_UNDOS;
  const startLevel = (nextLevel: number) => { if (rewards.starting || rewards.submitting || waitingForReward) return; if (user) void rewards.start(nextLevel); else dispatch({ t: "start", level: nextLevel }); };
  const act = (action: Action) => {
    if (rewards.starting || rewards.submitting || !ready) return;
    const previous = currentPractice.current, next = practiceReducer(previous, { t: "move", action });
    if (next === previous) return;
    currentPractice.current = next; rewards.record(action); dispatch({ t: "replace", state: next });
  };

  return (
    <div className="faith-scene" style={{ "--faith-accent": FAITH_PALETTES[collection] } as CSSProperties}>
      <header className="faith-play-header">
        <Link to="/" className="faith-hub-link" aria-label="Back to the Clubhouse">← <span>Clubhouse</span></Link>
        <h1>Faith 3 <em>Tile Match</em></h1>
        <div><button aria-label="Tiles & settings" onClick={() => setPanel("tiles")}>Tiles</button><button aria-label="How to play" onClick={() => setPanel("help")}>Help</button></div>
      </header>
      <main className="faith-shell">
        <div className="faith-controls">
          <div className="faith-level-summary">
            <h2>Level {level} · {theme.name}</h2>
            <p>{play.board.length} tiles left · {play.matches} triples matched</p>
          </div>
          <div className="faith-round-controls">
            <label htmlFor="practice-level"><span className="sr-only">Level</span><select aria-label="Level" id="practice-level" value={level} disabled={rewards.starting || rewards.submitting || waitingForReward} onChange={(event) => startLevel(Number(event.target.value))}>
              {Array.from({ length: TOTAL_LEVELS }, (_, index) => <option key={index + 1} value={index + 1} disabled={Boolean(user && rewards.run && index + 1 > rewards.run.progress.unlocked)}>{index + 1}</option>)}
            </select></label>
            <button className="btn-ghost-gold" aria-label="Restart level" disabled={rewards.starting || rewards.submitting || waitingForReward} onClick={() => startLevel(level)}>Restart</button>
            <button className="btn-gold" aria-label="Next level" disabled={level === TOTAL_LEVELS || rewards.starting || rewards.submitting || waitingForReward} onClick={() => startLevel(level + 1)}>Next</button>
          </div>
        </div>

        <div className="faith-game-layout">
          <section className="faith-board-panel" aria-label="Tile board">
            <div className="faith-board-caption" aria-hidden="true"><span>✦</span>{theme.art}<span>✦</span></div>
            <div className="faith-board-space" style={{ "--faith-board-ratio": bounds.width / (bounds.height * 1.5) } as CSSProperties}>
            <div className="faith-board">
              {play.board.map((tile) => {
                const blocked = isBlocked(tile, play.board);
                const symbol = tile.veiled ? 'Hidden' : faithMotif(collection, tile.type);
                const reason = tile.frost ? `Frozen: collect ${tile.frost} nearby ${tile.frost === 1 ? 'tile' : 'tiles'} to melt the ice.`
                  : tile.seal ? `Sealed: match ${Math.max(0, tile.seal - play.matches)} more ${tile.seal - play.matches === 1 ? 'triple' : 'triples'} to open it.`
                    : isCovered(tile, play.board) ? 'This tile is covered by another tile.'
                      : tile.veiled ? 'Tap to reveal this face, then tap again to collect it.' : `Pick ${symbol}`;
                return (
                  <button key={tile.id} type="button" disabled={blocked || play.status !== "play" || rewards.starting || rewards.submitting || !ready}
                    aria-label={`Pick ${symbol} tile ${tile.id}`}
                    title={reason} data-frost={tile.frost || undefined} data-seal={tile.seal || undefined} data-veiled={tile.veiled || undefined}
                    onClick={() => act({ t: "pick", id: tile.id })}
                    className="faith-tile"
                    style={{
                      left: `${(tile.x + tile.z * .1 - bounds.x + .3) / bounds.width * 100}%`,
                      top: `${(tile.y - tile.z * .1 - bounds.y + .3) / bounds.height * 100}%`,
                      width: `${1.88 / bounds.width * 100}%`,
                      height: `${1.88 / bounds.height * 100}%`,
                      zIndex: 10 + tile.z * 100,
                    }}>
                    {tile.veiled ? <svg className="faith-veiled-face" viewBox="0 0 100 150" aria-hidden="true"><rect x="3" y="3" width="94" height="144" rx="8"/><path d="M50 12L87 75L50 138L13 75ZM50 29L77 75L50 121L23 75ZM9 14H30M70 14H91M9 136H30M70 136H91"/><circle cx="50" cy="75" r="19"/><path d="M50 54V96M29 75H71M35 60L65 90M35 90L65 60"/></svg> : <FaithTileArtwork skin={skin} collection={collection} type={tile.type} />}
                    {Boolean(tile.frost) && <span className="faith-frost-overlay" aria-hidden="true"><b>❄ {tile.frost}</b></span>}
                    {Boolean(tile.seal) && <span className="faith-wax-seal" aria-hidden="true">◈<small>{Math.max(0, tile.seal! - play.matches)}</small></span>}
                    {tile.veiled && <span className="faith-veil-label" aria-hidden="true">REVEAL</span>}
                  </button>
                );
              })}
              {play.status === "won" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"><span className="text-5xl" aria-hidden="true">✨</span><p className="font-display text-3xl text-gold">Level cleared</p><p className="max-w-xs text-sm text-muted-foreground">Try another level or restart to play this layout again.</p></div>}
            </div>
            </div>
          </section>

          <aside className="faith-sidebar">
            <section className="faith-tray-panel" aria-label="Your tray">
              <div className="faith-tray-heading"><h2>Your tray</h2><p>{play.tray.length} of {play.trayCapacity} slots filled</p></div>
              <ol className="faith-tray-slots" aria-label="Tray slots">
                {Array.from({ length: TRAY_SIZE }, (_, index) => {
                  const tile = play.tray[index];
                  const symbol = tile ? faithMotif(collection, tile.type) : "";
                  const locked = index >= play.trayCapacity;
                  return <li key={index} aria-label={`Slot ${index + 1}: ${locked ? "locked for this challenge" : symbol || "empty"}`}
                    className={`faith-tray-slot ${tile ? "faith-tray-filled" : ""} ${locked ? "faith-tray-locked" : ""}`}>{tile ? <FaithTileArtwork skin={skin} collection={collection} type={tile.type} /> : <span aria-hidden="true">{locked ? "◈" : "·"}</span>}</li>;
                })}
              </ol>
            </section>

            <section className="faith-assists" aria-label="Practice assistance">
              <button className="btn-ghost-gold" disabled={!canUndo} onClick={() => act({ t: "undo" })}>Undo · {Math.max(0, FREE_UNDOS - play.undoUsed)} left</button>
              <button className="btn-ghost-gold" disabled={play.status !== "play" || play.shuffleCount >= FREE_SHUFFLES || play.board.length < 2} onClick={() => act({ t: "shuffle" })}>Shuffle · {Math.max(0, FREE_SHUFFLES - play.shuffleCount)} left</button>
              <button className="btn-ghost-gold" disabled={play.status !== "play" || play.magicUsed >= MAX_MAGIC_PER_WIN} onClick={() => act({ t: "magic" })}>Magic clear · {Math.max(0, MAX_MAGIC_PER_WIN - play.magicUsed)} left</button>
            </section>

            <section className="faith-challenge-bar" aria-label="Level challenge">
              <div><span className="faith-difficulty">{challenge.difficulty}</span><span>{challenge.layers} {challenge.layers === 1 ? 'layer' : 'layers'} · {play.trayCapacity} open tray slots</span></div>
              <div className="faith-obstacle-counts"><span data-count="frost">❄ {frozen} frozen</span><span data-count="seal">◈ {sealed} sealed</span><span data-count="veil">◇ {veiled} veiled</span></div>
            </section>
            <p className={`faith-notice ${play.status === "lost" ? "faith-notice-lost" : ""}`} role="status" aria-live="polite">{notice}</p>
            <p className="faith-practice-note" role="status">{rewardLine}{rewards.error && play.status === "won" && <button className="underline ml-2" onClick={rewards.retry}>Retry reward sync</button>}{!user && <Link className="underline ml-2" to="/auth">Sign in</Link>}{user && <Link className="underline ml-2" to="/profile">My rewards</Link>}</p>
          </aside>
        </div>
      </main>
      {panel && <FaithPanel title={panel === "tiles" ? "Tiles & settings" : "How to play"} close={() => setPanel(null)}>
        {panel === "tiles" ? <>
          <div className="faith-panel-settings">
            <label className="faith-select-label" htmlFor="faith-collection">Tile collection<select aria-label="Tile collection" id="faith-collection" value={collectionChoice ?? "auto"} onChange={event => setCollectionChoice(event.target.value === "auto" ? null : Number(event.target.value))}><option value="auto">Follow the level</option>{THEMES.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>
            <FaithSkinPicker userId={user?.id ?? null} wallet={wallet} ready={ready} onEquipped={applyWallet} />
          </div>
          <section className="faith-collection-card" aria-label="Current tile collection"><p className="faith-eyebrow">{theme.name} · TEN ILLUSTRATIONS</p><h3>{theme.art}</h3><div className="faith-collection-preview">{Array.from({length: 10}, (_, type) => <div key={type} title={faithMotif(collection, type)}><FaithTileArtwork skin={skin} collection={collection} type={type} labelled /></div>)}</div><p>Changing your collection or skin keeps your current round.</p></section>
        </> : <>
          <p>Pick uncovered tiles and collect three identical artworks in your tray to clear them. Dimmed tiles are blocked. Filling all {play.trayCapacity} open slots without a triple ends this round.</p>
          <section className="faith-obstacle-guide" aria-label="Obstacle guide">
            <h3>This level’s challenge · {challenge.difficulty}</h3>
            <p>{challenge.layers} {challenge.layers === 1 ? 'layer' : 'layers'} · {play.trayCapacity} open tray slots</p>
            {challenge.frostRatio > 0 && <p><b>❄ Frost</b>Collect nearby tiles to melt one ice layer per tile. Frozen faces cannot be picked.</p>}
            {challenge.sealRatio > 0 && <p><b>◈ Wax seals</b>Each seal shows how many more triples you need. Match them to unlock the face.</p>}
            {challenge.veilRatio > 0 && <p><b>◇ Veils</b>Tap an uncovered hidden face to reveal it. Tap again to collect it.</p>}
            {play.trayCapacity < TRAY_SIZE && <p><b>Limited tray</b>Only {play.trayCapacity} slots are open. Prioritize pairs and leave room to finish a triple.</p>}
            {level < 11 && <p>Learn to spot triples and uncover lower layers. Frost begins at level 11, seals at 31, and veils at 61.</p>}
          </section>
          <h3>Practice assistance</h3><p>Undo takes back your last pick. Shuffle rearranges tiles and clears remaining ice, seals, and veils. Magic clear removes a full triple, including blocked tiles. These assists are free for this round. Member reward runs use the same limited supplies.</p>
          <p>Signed-in members earn points once per verified first clear, unlocking the next level. Guest practice stays free. Replays do not repeat wallet rewards. View milestones, badges and point conversion on your profile.</p>
        </>}
      </FaithPanel>}
    </div>
  );
}

function FaithPanel({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="faith-panel" aria-labelledby="faith-panel-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id="faith-panel-title">{title}</h2><button className="btn-ghost-gold" onClick={close} autoFocus>Back to game</button></header>
    <div className="faith-panel-content">{children}</div>
  </dialog>;
}
