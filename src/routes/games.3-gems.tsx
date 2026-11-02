import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { HubNav } from '@/components/HubNav';
import { GemArtwork, GemCrate, GemsBoosterIcon, GemsWheel, GEM_SPECIAL_NAMES } from '@/components/GemsArtwork';
import { MonasteryArtwork } from '@/components/MonasteryArtwork';
import { legalGemSwaps, type GemCell, type GemsAction, type GemsFrame, type GemsOutcome } from '@/lib/gems-engine';
import { BOOSTERS, GEM_COLORS, GEMS_CHAPTERS, GEMS_LEVEL_COUNT, GEMS_NAME, GEMS_SIZE, MONASTERY_PROJECTS, gemsClearReward, gemsLevel, monasteryRestoration, type Booster, type Inventory } from '@/lib/gems-levels';
import { enterGemsLevel, GEMS_SAVE_KEY, playGemsJourney, readGemsJourney, type GemsJourney } from '@/lib/gems-progress';

export const Route = createFileRoute('/games/3-gems')({
  head: () => ({ meta: [{ title: `${GEMS_NAME} — Restore the Monastery | Cayea’s Game Clubhouse` }, { name: 'description', content: 'An elegant match-three journey through 150 levels. Create special gems, clear obstacles, earn boosters, and restore a Buddhist monastery.' }] }),
  component: ThreeGemsPage,
});
const KINDS = Object.keys(BOOSTERS) as Booster[];
const sleepFrame = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function storedJourney() { try { return readGemsJourney(localStorage.getItem(GEMS_SAVE_KEY)); } catch { return readGemsJourney(null); } }
type Change = { journey: GemsJourney; outcome?: GemsOutcome };

function useGemsJourney() {
  const [journey, setJourney] = useState(storedJourney), [busy, setBusy] = useState(false), [frame, setFrame] = useState<GemsFrame | null>(null);
  const [notice, setNotice] = useState('Match with intention. A quiet monastery is waiting to come back to life.'), [saved, setSaved] = useState(true);
  const current = useRef(journey), pending = useRef(false), token = useRef(0), persistent = useRef(true), locking = useRef(true), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try { if (!localStorage.getItem(GEMS_SAVE_KEY)) localStorage.setItem(GEMS_SAVE_KEY, JSON.stringify(current.current)); }
    catch { persistent.current = false; setSaved(false); }
    const receive = (event: StorageEvent) => {
      if (event.key !== GEMS_SAVE_KEY) return;
      const latest = readGemsJourney(event.newValue);
      if (latest.revision <= current.current.revision) return;
      ++token.current; current.current = latest; setJourney(latest); setFrame(null);
      setNotice('Your garden was updated in another tab. The latest progress is here.');
    };
    window.addEventListener('storage', receive);
    return () => { mounted.current = false; ++token.current; window.removeEventListener('storage', receive); };
  }, []);
  async function change(operation: (latest: GemsJourney) => Change | null) {
    if (pending.current) return;
    pending.current = true; setBusy(true); const animation = ++token.current, expectedRevision = current.current.revision;
    let outcome: GemsOutcome | undefined;
    const commit = () => {
      let latest = current.current;
      if (persistent.current) try { latest = readGemsJourney(localStorage.getItem(GEMS_SAVE_KEY)); } catch { persistent.current = false; setSaved(false); }
      if (latest.revision !== expectedRevision) {
        current.current = latest; setJourney(latest); setNotice('Progress changed in another tab. Please try your move again.'); return;
      }
      const next = operation(latest);
      if (!next) { setNotice('That swap makes no match. No move or booster was used.'); return; }
      if (persistent.current) try { localStorage.setItem(GEMS_SAVE_KEY, JSON.stringify(next.journey)); } catch { persistent.current = false; setSaved(false); }
      current.current = next.journey; setJourney(next.journey); outcome = next.outcome;
      setNotice(outcome?.message ?? `Level ${next.journey.play.level} · ${GEMS_CHAPTERS[gemsLevel(next.journey.play.level).chapter]!.lesson}`);
    };
    try {
      let started = false;
      const run = () => { started = true; commit(); };
      try {
        if (locking.current && navigator.locks?.request) await navigator.locks.request(GEMS_SAVE_KEY, run); else run();
      } catch (cause) {
        // Some private/embedded browser contexts expose Web Locks but deny
        // requests. Use the revision-checked save path in those contexts.
        // Never retry an operation that already ran inside the lock.
        if (started || !(cause instanceof DOMException) || !['SecurityError', 'NotAllowedError', 'NotSupportedError'].includes(cause.name)) throw cause;
        locking.current = false; run();
      }
      if (outcome && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) for (const step of outcome.frames) {
        if (!mounted.current || animation !== token.current) break;
        setFrame(step); await sleepFrame(step.cells.length ? 130 : 90);
      }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'The garden could not update. Please try again.'); }
    finally { if (mounted.current) { setFrame(null); setBusy(false); } pending.current = false; }
  }
  return { journey, busy, frame, notice, saved, change, setNotice };
}

function ThreeGemsPage() {
  const { journey, busy, frame, notice, saved, change, setNotice } = useGemsJourney();
  const [view, setView] = useState<'play' | 'journey' | 'monastery' | 'rules'>('play');
  const [selected, setSelected] = useState<number | null>(null), [booster, setBooster] = useState<Booster | null>(null), [hint, setHint] = useState<number[]>([]);
  const [dismissed, setDismissed] = useState(false), [startRequest, setStartRequest] = useState<{ level: number; revision: number } | null>(null);
  const [focus, setFocus] = useState(0);
  const cells = useRef<(HTMLButtonElement | null)[]>([]), pointer = useRef<{ index: number; x: number; y: number; id: number } | null>(null), suppressClick = useRef(0);
  const play = journey.play, level = gemsLevel(play.level), chapter = GEMS_CHAPTERS[level.chapter]!;
  const completed = Object.keys(journey.stars).length, restoration = monasteryRestoration(completed), totalStars = Object.values(journey.stars).reduce((a, b) => a + b, 0);
  const board = frame?.board ?? play.board, hits = frame?.cells ?? [];
  const actionable = !busy && play.status === 'play';
  useEffect(() => {
    setSelected(null); setBooster(null); setHint([]); setStartRequest(null);
  }, [journey.revision]);
  useEffect(() => { setDismissed(false); }, [play.level, journey.attempts]);
  async function act(action: GemsAction) {
    if (!actionable) return;
    setSelected(null); setHint([]); setBooster(null);
    await change(latest => playGemsJourney(latest, action));
  }
  function pick(i: number) {
    if (!actionable) return;
    if (booster && booster !== 'shuffle') { void act({ type: 'booster', kind: booster, target: i }); return; }
    if (!board[i]!.gem || board[i]!.chain) { setNotice(board[i]!.chain ? 'This gem is chained. Match it in place or use a special to release it.' : 'Clear beside a crate or strike it with a special.'); return; }
    if (selected === i) { setSelected(null); return; }
    if (selected !== null && Math.abs(selected % 8 - i % 8) + Math.abs(Math.floor(selected / 8) - Math.floor(i / 8)) === 1) { void act({ type: 'swap', a: selected, b: i }); return; }
    setSelected(i); setHint([]);
  }
  function requestLevel(next: number) {
    if (busy) return;
    if (play.status === 'play' && play.turns > 0) { setStartRequest({ level: next, revision: journey.revision }); return; }
    void startLevel(next);
  }
  async function startLevel(next: number) {
    setStartRequest(null); setDismissed(false); setSelected(null); setBooster(null); setHint([]);
    await change(latest => { const nextJourney = enterGemsLevel(latest, next); return nextJourney ? { journey: nextJourney } : null; });
    setView('play');
  }
  function giveHint() {
    if (!actionable) return;
    const pair = legalGemSwaps(play)[0];
    if (pair) { setHint(pair); setSelected(null); setBooster(null); setNotice(`Try swapping row ${Math.floor(pair[0] / 8) + 1}, column ${pair[0] % 8 + 1} with row ${Math.floor(pair[1] / 8) + 1}, column ${pair[1] % 8 + 1}. Hints are free.`); }
  }
  return <div className="gems-scene"><HubNav/><main className="gems-shell">
    <header className="gems-heading" data-playing={view === 'play' && play.turns > 0}><div><Link to="/" className="gems-back">← THE CLUBHOUSE</Link><p className="gems-eyebrow">A LITTLE MATCH. A MEANINGFUL JOURNEY.</p><h1><span>3 Gems</span>{' '}<em>of Buddhism</em></h1><p className="gems-intro">Bring a forgotten temple back to life.</p></div><button className="gems-temple-preview" onClick={() => setView('monastery')} aria-label="Visit your monastery"><MonasteryArtwork completed={completed} compact/><span><span className="gems-eyebrow">{restoration.reopened ? 'THE MONASTERY IS OPEN' : 'YOUR MONASTERY'}</span><strong>{completed} / 150 levels restored <span aria-hidden="true">→</span></strong></span></button></header>
    <nav className="gems-tabs" aria-label="Gem game sections">{(['play', 'journey', 'monastery', 'rules'] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab === 'play' ? 'The garden' : tab === 'journey' ? '150 levels' : tab === 'monastery' ? 'The monastery' : 'How to play'}</button>)}</nav>
    {view === 'monastery' ? <section className="gems-monastery-view"><div className="gems-section-heading"><div><p className="gems-eyebrow">RESTORATION JOURNAL · {restoration.stage} / 10 PROJECTS</p><h2>{restoration.reopened ? 'Welcome home.' : 'A sanctuary, slowly reborn.'}</h2><p>{restoration.reopened ? 'Every courtyard is restored. The halls are lit. The monastery is open to the community again.' : 'Each first level clear restores a little more. Finish fifteen levels to complete each project.'}</p></div><button className="gems-primary" onClick={() => setView('play')}>Return to level {play.level} →</button></div><div className="gems-restoration-canvas"><MonasteryArtwork completed={completed}/><div className="gems-art-caption"><span>{restoration.reopened ? 'RESTORED WITH CARE' : 'THE WORK OF MANY SMALL STEPS'}</span><strong>{Math.round(completed / 150 * 100)}%</strong></div></div><div className="gems-project-list">{MONASTERY_PROJECTS.map((project, i) => {
      const done = Math.max(0, Math.min(15, completed - i * 15)), active = done > 0 || completed === i * 15;
      return <article key={project.name} className="gems-project" data-done={done === 15} data-active={active}><span className="gems-project-symbol" aria-hidden="true">{done === 15 ? '✓' : project.symbol}</span><div><p className="gems-eyebrow">PROJECT {String(i + 1).padStart(2, '0')} · LEVELS {i * 15 + 1}–{(i + 1) * 15}</p><h3>{project.name}</h3><p>{project.task}</p><progress max={15} value={done} aria-label={`${project.name} restoration`}/><span className="gems-project-status">{done === 15 ? i === 9 ? 'Monastery reopened' : 'Restored' : `${done} / 15 levels complete`}</span></div></article>;
    })}</div></section> : view === 'journey' ? <section><div className="gems-section-heading"><div><p className="gems-eyebrow">TEN CHAPTERS. ONE NEW BEGINNING.</p><h2>Your path to the monastery</h2><p>{completed} levels complete · {totalStars} / 450 stars</p></div><button className="gems-primary" onClick={() => setView('play')}>Resume level {play.level} →</button></div><div className="gems-chapters">{GEMS_CHAPTERS.map((part, chapterIndex) => <section key={part.name} className="gems-chapter"><div className="gems-chapter-heading"><span>{String(chapterIndex + 1).padStart(2, '0')}</span><div><p className="gems-eyebrow">RESTORE {MONASTERY_PROJECTS[chapterIndex]!.name.toUpperCase()}</p><h3>{part.name}</h3></div></div><div className="gems-level-grid">{Array.from({ length: 15 }, (_, n) => chapterIndex * 15 + n + 1).map(id => <button key={id} disabled={id > journey.unlocked || busy} className={id === play.level ? 'gems-level-current' : ''} data-complete={Boolean(journey.stars[String(id)])} onClick={() => requestLevel(id)} aria-label={`Level ${id}${id > journey.unlocked ? ' · locked' : journey.stars[String(id)] ? ` · ${journey.stars[String(id)]} stars` : ' · unlocked'}`}><span>{id > journey.unlocked ? <span className="gems-level-lock" aria-hidden="true">♧</span> : id}</span><small>{journey.stars[String(id)] ? '★'.repeat(journey.stars[String(id)]!) : id > journey.unlocked ? id : '•'}</small></button>)}</div></section>)}</div></section> : view === 'rules' ? <GemsGuide/> : <div className="gems-play-layout">
      <section className="gems-board-panel" aria-label="Match-three game"><div className="gems-board-heading"><div><p className="gems-eyebrow">CHAPTER {String(level.chapter + 1).padStart(2, '0')} · {chapter.name}</p><h2>Level {play.level}<span>{level.checkpoint ? 'Sanctuary challenge' : level.name.split(' · ')[1]}</span></h2></div><div className="gems-moves" data-low={play.movesLeft <= 5}><strong data-testid="gems-moves">{play.movesLeft}</strong><span>MOVES LEFT</span></div></div>
        <div className="gems-objectives" aria-label="Level objectives">{level.collect.map(goal => <div key={goal.color} className="gems-objective" data-done={play.collected[goal.color]! >= goal.count}><GemArtwork color={goal.color}/><span><small>{GEM_COLORS[goal.color]!.name}</small><strong>{Math.min(goal.count, play.collected[goal.color]!)} <i>/ {goal.count}</i></strong></span>{play.collected[goal.color]! >= goal.count && <b aria-label="Complete">✓</b>}</div>)}{level.frost > 0 && <div className="gems-objective" data-done={play.board.every(c => !c.frost)}><span className="gems-objective-symbol">❆</span><span><small>Lotus seals</small><strong>{play.frostCleared} <i>/ {level.frost * level.frostLayers}</i></strong></span></div>}{level.crates > 0 && <div className="gems-objective" data-done={play.cratesCleared >= level.crates}><span className="gems-objective-symbol">▧</span><span><small>Crates</small><strong>{play.cratesCleared} <i>/ {level.crates}</i></strong></span></div>}{level.chains > 0 && <div className="gems-objective" data-done={play.chainsCleared >= level.chains}><span className="gems-objective-symbol">⛓</span><span><small>Chains</small><strong>{play.chainsCleared} <i>/ {level.chains}</i></strong></span></div>}</div>
        <div className="gems-board-wrap"><div className="gems-board" role="grid" aria-label="Gem garden" aria-rowcount={8} aria-colcount={8} aria-busy={busy} aria-describedby="gem-controls">{board.map((cell, i) => <button key={i} ref={node => { cells.current[i] = node; }} className={`gems-cell ${selected === i ? 'gems-cell-selected' : ''} ${hint.includes(i) ? 'gems-cell-hint' : ''} ${hits.includes(i) ? 'gems-cell-clear' : ''} ${cell.frost ? 'gems-cell-sealed' : ''} ${booster ? 'gems-cell-target' : ''}`} role="gridcell" tabIndex={i === focus ? 0 : -1} aria-selected={selected === i} aria-label={cellLabel(cell, i)} aria-rowindex={Math.floor(i / 8) + 1} aria-colindex={i % 8 + 1} aria-disabled={!actionable} disabled={play.status !== 'play'} data-index={i} data-color={cell.gem?.color ?? 'crate'} data-special={cell.gem?.special ?? ''} data-layers={cell.frost} onFocus={() => setFocus(i)} onClick={event => { if (event.detail && performance.now() < suppressClick.current) { suppressClick.current = 0; return; } pick(i); }}
          onPointerDown={event => { if (!actionable || event.button !== 0) return; pointer.current = { index: i, x: event.clientX, y: event.clientY, id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerCancel={() => { pointer.current = null; }}
          onPointerUp={event => { const start = pointer.current; pointer.current = null; if (!start || start.id !== event.pointerId || !actionable) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.max(Math.abs(dx), Math.abs(dy)) < 18 || booster) return; suppressClick.current = performance.now() + 300; const next = Math.abs(dx) > Math.abs(dy) ? start.index + (dx > 0 ? 1 : -1) : start.index + (dy > 0 ? 8 : -8); if (next >= 0 && next < 64 && Math.abs(start.index % 8 - next % 8) + Math.abs(Math.floor(start.index / 8) - Math.floor(next / 8)) === 1) void act({ type: 'swap', a: start.index, b: next }); }}
          onKeyDown={event => { const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 } as Record<string, number>)[event.key]; if (offset === undefined) { if (event.key === 'Escape') { setSelected(null); setBooster(null); } return; } event.preventDefault(); const next = i + offset; if (next < 0 || next >= 64 || Math.abs(i % 8 - next % 8) + Math.abs(Math.floor(i / 8) - Math.floor(next / 8)) !== 1) return; if (event.shiftKey && !booster) void act({ type: 'swap', a: i, b: next }); else { setFocus(next); cells.current[next]?.focus(); } }}>
          <span className="gems-cell-glint" aria-hidden="true"/>{cell.crate ? <GemCrate layers={cell.crate}/> : <span className="gems-gem-inner" key={cell.gem?.id}><GemArtwork gem={cell.gem}/></span>}{cell.chain && <span className="gems-chain" aria-hidden="true"/>}{cell.frost > 0 && <span className="gems-layer-dots" aria-hidden="true">{'•'.repeat(cell.frost)}</span>}
        </button>)}</div><div className="gems-board-flourish" aria-hidden="true">❧ <span>play with presence</span> ❧</div></div>
        <div className="gems-boosters" aria-label="Your boosters">{KINDS.map(kind => <button key={kind} disabled={!actionable || journey.inventory[kind] < 1} aria-pressed={booster === kind} aria-label={`${BOOSTERS[kind].name} · ${journey.inventory[kind]} available`} onClick={() => { if (kind === 'shuffle') { void act({ type: 'booster', kind }); return; } setBooster(booster === kind ? null : kind); setSelected(null); setHint([]); setNotice(booster === kind ? 'Booster put away. Nothing was spent.' : `${BOOSTERS[kind].description} Tap a garden tile to choose the target.`); }}><span className="gems-booster-icon"><GemsBoosterIcon kind={kind}/><b>{journey.inventory[kind]}</b></span><span>{BOOSTERS[kind].name}</span></button>)}</div>
        <div className="gems-board-actions"><button disabled={!actionable} onClick={giveHint}>✧ Free hint</button><span><strong>{play.score.toLocaleString()}</strong> points</span><button disabled={busy} onClick={() => requestLevel(play.level)}>↻ Restart</button></div>
        <p id="gem-controls" className="gems-controls">Tap two neighboring gems or swipe to swap. Keyboard: arrows to move, Enter to select, Shift + arrow to swap.</p>
        <p className="gems-notice" role="status" aria-live="polite">{booster ? `${BOOSTERS[booster].name} selected · tap a tile, or tap the booster again to cancel.` : frame?.label ?? notice}</p>
      </section>
      <aside className="gems-sidebar"><section className="gems-story-card"><p className="gems-eyebrow">{restoration.reopened ? 'OUR DOORS ARE OPEN' : 'YOU ARE RESTORING'}</p><span className="gems-story-symbol" aria-hidden="true">{restoration.project.symbol.startsWith('☸') ? <GemsWheel/> : restoration.project.symbol}</span><h2>{restoration.reopened ? 'The Monastery' : restoration.project.name}</h2><p>{restoration.reopened ? 'A place for learning, reflection, and community. Restored by you.' : restoration.project.task}</p><div className="gems-project-meter"><span>{restoration.reopened ? '150 / 150' : `${restoration.inProject} / 15`} levels</span><progress max={15} value={restoration.inProject} aria-label="Current restoration project"/></div><button onClick={() => setView('monastery')}>Visit the monastery ↗</button></section><section className="gems-reward-card"><p className="gems-eyebrow">{journey.stars[String(play.level)] ? 'A CHANCE TO SHINE' : 'YOUR FIRST-CLEAR GIFT'}</p><h3>{journey.stars[String(play.level)] ? 'More stars await' : play.level % 5 === 0 ? 'A little extra help' : 'A gift for the journey'}</h3>{journey.stars[String(play.level)] ? <p>Replay to improve your stars. First-clear gifts are collected once per level.</p> : <RewardItems inventory={gemsClearReward(play.level)}/>}<p className="gems-reward-note">Every fifth level: two row hammers + two column hammers. Milestones add blessings and fresh breezes.</p></section><section className="gems-wisdom-card"><span aria-hidden="true"><GemsWheel/></span><p>“{chapter.lesson}”</p><span>ONE MINDFUL MATCH AT A TIME</span></section></aside>
    </div>}
    <div className="gems-save-note"><span>◈ {saved ? 'Progress & boosters saved on this device' : 'Progress kept for this visit'}</span><span>{totalStars} stars · {restoration.stage} restorations</span></div>
    {!busy && play.status !== 'play' && !dismissed && view === 'play' && <GemsDialog title={play.status === 'won' ? completed === 150 && play.level === 150 ? 'The monastery is open.' : 'A little more life returns.' : 'A moment to begin again.'} dismiss={() => setDismissed(true)}><span className="gems-result-symbol" aria-hidden="true">{play.status === 'won' ? '✿' : '❧'}</span>{play.status === 'won' ? <><p className="gems-result-stars" aria-label={`${journey.stars[String(play.level)]} stars`}>{'★'.repeat(journey.stars[String(play.level)] ?? 1)}</p><p>Level {play.level} complete · {play.score.toLocaleString()} points</p>{journey.reward ? <div className="gems-result-gift"><p className="gems-eyebrow">FIRST-CLEAR GIFT · ADDED TO YOUR BOOSTERS</p><RewardItems inventory={journey.reward.items}/><p>{completed % 15 === 0 ? `${MONASTERY_PROJECTS[Math.min(9, completed / 15 - 1)]!.name} ${completed === 150 ? 'complete. Welcome back to the monastery!' : 'restored!'}` : `${restoration.inProject} / 15 steps toward ${restoration.project.name}.`}</p></div> : <p>Your best stars are saved. This level’s first-clear gift was already collected.</p>}<div className="gems-dialog-actions">{play.level < GEMS_LEVEL_COUNT ? <button className="gems-primary" onClick={() => void startLevel(play.level + 1)}>Continue to level {play.level + 1} →</button> : <button className="gems-primary" onClick={() => { setDismissed(true); setView('monastery'); }}>Visit the reopened monastery →</button>}<button className="gems-secondary" onClick={() => setDismissed(true)}>Admire the garden</button></div></> : <><p>The moves are finished, but the path is still here. Try a different approach; retries are free.</p><p className="gems-dialog-note">Unused boosters stay in your collection. Boosters already used stay spent.</p><div className="gems-dialog-actions"><button className="gems-primary" onClick={() => void startLevel(play.level)}>Try level {play.level} again</button><button className="gems-secondary" onClick={() => setDismissed(true)}>Review the garden</button></div></>}</GemsDialog>}
    {startRequest !== null && startRequest.revision === journey.revision && <GemsDialog title={startRequest.level === play.level ? 'Begin this level again?' : `Go to level ${startRequest.level}?`} dismiss={() => setStartRequest(null)}><p>This attempt will end. Your restored monastery and earned rewards stay saved. Boosters already used stay spent.</p><div className="gems-dialog-actions"><button className="gems-primary" onClick={() => void startLevel(startRequest.level)}>Start level {startRequest.level}</button><button className="gems-secondary" onClick={() => setStartRequest(null)}>Keep playing</button></div></GemsDialog>}
  </main></div>;
}

function cellLabel(cell: GemCell, i: number) {
  const name = cell.crate ? `Crate, ${cell.crate} ${cell.crate === 1 ? 'layer' : 'layers'}` : cell.gem?.special === 'orb' ? 'Wisdom orb' : `${GEM_COLORS[cell.gem?.color ?? 0]?.name ?? 'Gem'}${cell.gem?.special ? ` ${GEM_SPECIAL_NAMES[cell.gem.special]}` : ''}`;
  return `Row ${Math.floor(i / GEMS_SIZE) + 1}, column ${i % GEMS_SIZE + 1}: ${name}${cell.chain ? ', chained' : ''}${cell.frost ? `, ${cell.frost} lotus seal ${cell.frost === 1 ? 'layer' : 'layers'}` : ''}`;
}
function RewardItems({ inventory }: { inventory: Inventory }) {
  return <ul className="gems-reward-items">{KINDS.filter(kind => inventory[kind] > 0).map(kind => <li key={kind}><span aria-hidden="true"><GemsBoosterIcon kind={kind}/></span><span><b>{inventory[kind]} ×</b> {BOOSTERS[kind].name}{inventory[kind] > 1 ? 's' : ''}</span></li>)}</ul>;
}
function GemsDialog({ title, children, dismiss }: { title: string; children: ReactNode; dismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), label = 'gems-dialog-title';
  useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="gems-dialog" aria-labelledby={label} onCancel={event => { event.preventDefault(); dismiss(); }}><button className="gems-dialog-close" aria-label="Close dialog" onClick={dismiss}>×</button><p className="gems-eyebrow">3 GEMS OF BUDDHISM</p><h2 id={label}>{title}</h2>{children}</dialog>;
}

const GUIDE = [
  { title: 'Three jewels. One new beginning.', text: 'The Three Jewels of Buddhism are Buddha, Dharma, and Sangha: awakening, teaching, and community. This little garden is inspired by their spirit of care. Complete 150 levels to restore ten parts of the monastery and reopen its doors.', symbol: '☸︎' },
  { title: 'Make room for a mindful match.', text: 'Swap neighboring gems horizontally or vertically. A line of three clears; gems fall and new matches cascade. A swap without a match is returned and costs no move. Tap two neighbors, swipe, or use Shift + an arrow key. Hints and automatic dead-board reshuffles are free.', symbol: '❧' },
  { title: 'Every garden has its obstacles.', text: 'Collect the gem colors shown above the board. Match beside crates to damage them, or hit them directly with a special. Match on lotus seals to peel away one layer per clear. Chained gems cannot move until matched in place or hit by a special. Finish every goal before the moves run out.', symbol: '❆' },
  { title: 'A special kind of possibility.', text: 'Four in a line creates a line gem, clearing a horizontal row or vertical column. Five in a straight line creates a wisdom orb. A T or L makes a 3 × 3 lotus burst. A 2 × 2 square makes a guiding lantern that seeks out a goal. Match colored specials to activate them; swap two specials to combine.', symbol: '✦' },
  { title: 'Some things are better together.', text: 'Two lines clear a cross. A line and burst clear three rows and three columns. Two bursts make a larger blast. An orb and a normal gem clear that color; an orb and a special transform that color into specials and activate them. Two orbs strike the whole board. A lantern carries another special to a goal.', symbol: '✧' },
  { title: 'Your patience brings its own gifts.', text: 'Begin with two row hammers, two column hammers, a lotus blessing, and a fresh breeze. Boosters never spend a move. Each first clear earns supplies; every fifth level gives two of each hammer. Ten-level and chapter milestones add extra boosters. Replays can improve stars but cannot repeat a gift. Progress saves on this device.', symbol: '✿' },
];
function GemsGuide() {
  const [step, setStep] = useState(0), lesson = GUIDE[step]!;
  return <section className="gems-guide"><div className="gems-section-heading"><div><p className="gems-eyebrow">A GUIDE TO THE GARDEN</p><h2>A little wisdom before you begin.</h2></div></div><div className="gems-guide-card"><span className="gems-guide-symbol" aria-hidden="true">{lesson.symbol.startsWith('☸') ? <GemsWheel/> : lesson.symbol}</span><p className="gems-eyebrow">{String(step + 1).padStart(2, '0')} / 06</p><h3>{lesson.title}</h3><p>{lesson.text}</p>{step >= 3 && step <= 4 && <div className="gems-guide-specials">{(['row', 'column', 'burst', 'orb', 'lantern'] as const).map((special, i) => <div key={special}><GemArtwork gem={{ id: i, color: special === 'orb' ? -1 : i, special }}/><span>{GEM_SPECIAL_NAMES[special]}</span></div>)}</div>}<div className="gems-guide-controls"><button className="gems-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>← Previous</button><div className="gems-guide-dots">{GUIDE.map((_, i) => <button key={i} className={i === step ? 'active' : ''} aria-label={`Lesson ${i + 1}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}/>)}</div><button className="gems-primary" disabled={step === GUIDE.length - 1} onClick={() => setStep(step + 1)}>Next →</button></div></div></section>;
}
