import { useEffect, useId, useState, useRef, type CSSProperties } from 'react';
import { MonasteryArtwork } from './MonasteryArtwork';
import { MONASTERY_PROJECTS } from '@/lib/gems-levels';
import { MONASTERY_TASKS, monasteryView, type MonasteryProgress } from '@/lib/monastery';
import { activeMonastery, MONASTERY_SITES, siteRepairs, THREE_JEWELS, type MonasterySite } from '@/lib/monastery-story';
import { BuddhistInspiration } from './BuddhistInspiration';
import { QUOTE_SOURCE_FILES, QUOTE_LICENSE_URL } from '@/lib/buddhist-quotes';

export function MonasteryScene({ site, restored, compact = false }: { site: MonasterySite; restored: number; compact?: boolean }) {
  const pose = Math.min(1, Math.max(0, restored));
  const mask = `monastery-repair-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`, steps = site.end - site.start, rows = steps / 5, cleared = Math.round(pose * steps);
  const panel = (after: boolean) => ({ backgroundPosition: `${after ? 100 : 0}% ${site.row * 100 / 3}%` } as CSSProperties);
  return <div className={`monastery-scene ${compact ? 'monastery-scene-compact' : ''}`} role="img" aria-label={`${site.name}, ${site.tradition}, ${pose === 0 ? 'before restoration' : pose === 1 ? 'fully restored preview' : 'restoration in progress'}`}>
    <div className="monastery-art-fallback" aria-hidden="true"><MonasteryArtwork completed={Math.round(pose * 150)}/></div>
    <svg className="monastery-region-masks" aria-hidden="true" width="0" height="0"><defs><clipPath id={mask} clipPathUnits="objectBoundingBox">{Array.from({ length: cleared }, (_, index) => <rect key={index} x={(index % 5) / 5} y={1 - (Math.floor(index / 5) + 1) / rows} width={.2} height={1 / rows}/>)}</clipPath></defs></svg>
    <div className="monastery-atlas" style={panel(false)}/><div className="monastery-atlas monastery-atlas-restored" style={{ ...panel(true), opacity: 1, clipPath: pose < 1 ? `url(#${mask})` : undefined }}/>
  </div>;
}

const SECTIONS = [['repairs','Repairs'],['restoration','Before & after'],['story','Story & Three Jewels']] as const;
type Section = typeof SECTIONS[number][0];
export function MonasteryJournal({progress,loading,busy,error,notice,onRetry,onRepair,onPlay}: {
  progress:MonasteryProgress;loading:boolean;busy:boolean;error:string;notice:string;
  onRetry:()=>void;onRepair:(taskId:string)=>void;onPlay:()=>void;
}) {
  const active=activeMonastery(progress),[selected,setSelected]=useState<string>(active.id),[section,setSection]=useState<Section>('repairs');
  const [view,setView]=useState<'current'|'before'|'after'|'compare'>('current'),[split,setSplit]=useState(50),[jewel,setJewel]=useState(0),pane=useRef<HTMLDivElement>(null);
  const [repairMoment,setRepairMoment]=useState(0),lastRepair=useRef({count:progress.completedTasks,loading});
  useEffect(()=>{const previous=lastRepair.current;lastRepair.current={count:progress.completedTasks,loading};if(!loading&&!previous.loading&&progress.completedTasks>previous.count)setRepairMoment(progress.completedTasks);},[progress.completedTasks,loading]);
  useEffect(()=>{if(!repairMoment)return;const timer=setTimeout(()=>setRepairMoment(0),3000);return()=>clearTimeout(timer);},[repairMoment]);
  useEffect(()=>{setSelected(active.id);setView('current');},[active.id]);
  useEffect(()=>{pane.current?.scrollTo({top:0});},[section,selected]);
  const site=MONASTERY_SITES.find(item=>item.id===selected)??active,done=siteRepairs(site,progress.completedTasks),total=site.end-site.start,restoration=monasteryView(progress),task=restoration.nextTask,here=site.id===active.id,beat=done===total?2:done>0?1:0;
  return <section className="gems-monastery-view community-menu-shell">
    <header className="community-toolbar"><span><b data-testid="monastery-stars">{loading?'—':progress.stars}</b> ★ <small>{progress.completedTasks}/50 repairs</small></span><button className="gems-primary" onClick={onPlay}>Play for more stars →</button></header>
    <div className="community-selectors"><label>Monastery<select aria-label="Choose monastery" value={selected} onChange={e=>{setSelected(e.target.value);setView('current');}}>{MONASTERY_SITES.map(place=><option key={place.id} value={place.id}>{place.name} · {place.tradition}</option>)}</select></label><label>Section<select aria-label="Monastery section" value={section} onChange={e=>setSection(e.target.value as Section)}>{SECTIONS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></div>
    {error&&<p className="community-message" role="alert">{error} <button onClick={onRetry}>Retry sync</button></p>}{notice&&!error&&<p className="community-message" role="status">{notice}</p>}
    <div className="gems-community-pane" ref={pane} tabIndex={0} aria-label={SECTIONS.find(([id])=>id===section)?.[1]}>
      <div className="community-location"><h2>{site.name}</h2><span>{site.tradition} · levels {site.row*50+1}–{(site.row+1)*50}</span></div>
      {repairMoment&&['repairs','restoration'].includes(section)?<div className="monastery-repair-animation" data-testid="repair-animation" key={repairMoment}><MonasteryScene site={site} restored={done/total} compact/><p role="status">Repair saved. Your monastery is coming back to life.</p></div>:null}
      {section==='repairs'&&<><section className="monastery-task-card"><p className="gems-eyebrow">{restoration.reopened ? 'THE JOURNEY IS COMPLETE' : 'NEXT REPAIR'}</p>
      {here && task ? <><h3>{task.title}</h3><p>{MONASTERY_PROJECTS[task.project]!.name} · repair {task.step + 1} of 5 · {task.kind}</p><button className="gems-primary" disabled={busy || loading || progress.stars < task.cost} onClick={() => onRepair(task.id)} aria-label={`Complete ${task.title} for ${task.cost} restoration ${task.cost === 1 ? 'star' : 'stars'}`}>{busy ? 'Saving repair…' : `Complete for ★ ${task.cost}`}</button><p>{progress.stars >= task.cost ? 'Your stars are spent only when this repair is saved.' : `Clear ${task.cost - progress.stars} more new ${task.cost - progress.stars === 1 ? 'level' : 'levels'} to afford this repair.`}</p><ol className="monastery-task-steps">{MONASTERY_TASKS.filter(item => item.project === task.project).map(item => { const index = MONASTERY_TASKS.indexOf(item); return <li key={item.id} data-done={index < progress.completedTasks} aria-current={item.id === task.id ? 'step' : undefined}><span>{index < progress.completedTasks ? '✓' : item.step + 1}</span>{item.title}<b>★ {item.cost}</b></li>; })}</ol></>
        : <><h3>{done === total ? 'Restored with care.' : 'A new chapter is waiting.'}</h3><p>{restoration.reopened ? 'All fifty repairs are complete. Each monastery is ready for its community again.' : done === total ? 'Your completed repairs stay saved as the journey continues.' : 'Complete the earlier monastery’s repairs to begin work here. You can explore this tradition’s story and restored preview now.'}</p>{!restoration.reopened && <button className="gems-secondary" onClick={() => setSelected(active.id)}>Go to your next repair →</button>}</>}
    </section><div className="community-shortcuts"><button className="gems-secondary" onClick={()=>setSection('restoration')}>Before & after →</button><button className="gems-secondary" onClick={()=>setSection('story')}>Story & Three Jewels →</button></div></>}
      {section==='restoration'&&<><div className="monastery-view-controls" aria-label="Restoration views">{(['current', 'before', 'after', 'compare'] as const).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{mode === 'current' ? 'Your progress' : mode === 'before' ? 'Before' : mode === 'after' ? 'Restored preview' : 'Before & after'}</button>)}</div>
    <div className="gems-restoration-canvas" data-monastery={site.id}>
      {view === 'compare' ? <div className="monastery-comparison"><MonasteryScene site={site} restored={0}/><div className="monastery-comparison-after" style={{ clipPath: `inset(0 0 0 ${split}%)` }}><MonasteryScene site={site} restored={1}/></div><div className="monastery-comparison-divider" style={{ left: `${split}%` }}/><span className="monastery-before-label">Before</span><span className="monastery-after-label">Restored</span><input type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} aria-label={`Before and after comparison for ${site.name}`}/></div>
        : <MonasteryScene key={`${site.id}:${view}`} site={site} restored={view === 'before' ? 0 : view === 'after' ? 1 : done / total}/>}
      <div className="gems-art-caption"><span>{view === 'after' || view === 'compare' ? 'RESTORED VIEW IS A PREVIEW' : view === 'before' ? 'BEFORE RESTORATION' : 'YOUR SAVED RESTORATION'}</span><strong>{view === 'after' ? 100 : view === 'before' ? 0 : Math.round(done / total * 100)}%</strong></div>
    </div>
    </>}
      {section==='story'&&<><section className="monastery-story-card"><p className="gems-eyebrow">ANIKA’S RESTORATION JOURNAL · CHAPTER {site.row + 1}</p><h3>{beat === 0 ? 'A community asks for help.' : beat === 1 ? 'Practice finds a place again.' : 'The welcome returns.'}</h3><p>{site.story[beat]}</p><dl><dt>Architecture</dt><dd>{site.architecture}</dd><dt>The Buddha image</dt><dd>{site.statue}</dd></dl><p>{site.context}</p></section><BuddhistInspiration index={site.row*2+beat}/><section className="monastery-jewels"><p className="gems-eyebrow">THE ACTUAL THREE JEWELS OF BUDDHISM</p><h3>Buddha. Dharma. Sangha.</h3><div className="monastery-jewel-choices" aria-label="Learn about the Three Jewels">{THREE_JEWELS.map((item, index) => <button key={item.name} aria-pressed={jewel === index} aria-controls="jewel-panel" onClick={() => setJewel(index)}>{item.name}<small>{item.subtitle}</small></button>)}</div><p id="jewel-panel">{THREE_JEWELS[jewel]!.text}</p><p className="monastery-context-note">Anika and these four monasteries are fictional. The traditions, Three Jewels, and architectural inspirations are real; customs vary within each tradition. These are four tradition-inspired chapters, not four equally separate branches of Buddhism.</p><details className="monastery-sources"><summary>Scripture references and public-domain sources</summary><p>All displayed quotations are verbatim English excerpts translated by Bhikkhu Sujato and released under CC0. Sutta is the Pali counterpart of Sanskrit sutra. The game’s storyline is original fiction.</p><ul>{QUOTE_SOURCE_FILES.map((url, i) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{['Dhammapada 1–20', 'Dhammapada 179–196', 'Mettā Sutta · Sutta Nipāta 1.8'][i]} · source translation</a></li>)}</ul><a href={QUOTE_LICENSE_URL} target="_blank" rel="noreferrer">SuttaCentral translation policy: CC0 public-domain dedication</a></details></section>
<p className="monastery-context-note">The monasteries welcome the fourfold community: monks, nuns, lay women, and lay men supporting one another through generosity, learning, and practice.</p></>}
    </div>
  </section>;
}
