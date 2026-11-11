import type { Level } from './rummy';
export type DominoVariant = 'draw' | 'block' | 'muggins';
export type DominoId = `${number}-${number}`;
export type DominoEnd = 'left' | 'right' | 'up' | 'down';
export const DOMINO_VARIANTS = {
  draw: { name: 'Draw', description: 'Draw until you can play. Empty your hand or win a blocked hand.' },
  block: { name: 'Block', description: 'No drawing. Pass when blocked and make every tile count.' },
  muggins: { name: 'Muggins', description: 'All Fives: score exposed ends that add to a multiple of five.' },
} as const;
export const DOMINO_SET: DominoId[] = Array.from({length:7},(_,a)=>Array.from({length:7-a},(_,i)=>`${a}-${a+i}` as DominoId)).flat();
export const isDomino = (value: unknown): value is DominoId => typeof value === 'string' && DOMINO_SET.includes(value as DominoId);
export const dominoPips = (id: DominoId): [number,number] => id.split('-').map(Number) as [number,number];
export const dominoValue = (id: DominoId) => dominoPips(id).reduce((sum,n)=>sum+n,0);
export const dominoLabel = (id: DominoId) => dominoPips(id).join(' | ');
export interface DominoPlayer { id: string; name: string; bot: boolean; level?: Level }
export interface PlacedDomino { id: DominoId; a: number; b: number; seat: number; arm?: 'up'|'down'; spinner?: boolean; placement?: number }
export interface DominoActivity { id: number; seat: number; kind: 'play'|'draw'|'pass'|'next'; round: number; tile?: DominoId; end?: DominoEnd; count?: number; points?: number }
export interface DominoResult { winner: number|null; reason: 'out'|'blocked'|'target'; pips: number[]; awards: number[]; note: string }
export interface DominoState {
  players: DominoPlayer[]; variant: DominoVariant; target: number; round: number; turn: number; starter: number;
  hands: DominoId[][]; stock: DominoId[]; board: PlacedDomino[]; scores: number[];
  phase: 'play'|'roundOver'|'finished'; winner: number|null; forcedOpening: DominoId|null;
  passes: number; result: DominoResult|null; activity: DominoActivity[]; sequence: number;
}
export type DominoMove = { t:'play';tile:DominoId;end:DominoEnd }|{t:'draw'}|{t:'pass'}|{t:'next'};
export interface DominoOption {tile:DominoId;end:DominoEnd;points:number}
export function parseDominoMove(input: unknown): DominoMove|null {
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const v=input as Record<string,unknown>,keys=Object.keys(v);
  if(v.t==='play'&&keys.length===3&&isDomino(v.tile)&&(typeof v.end==='string'&&['left','right','up','down'].includes(v.end)))return{t:'play',tile:v.tile,end:v.end as DominoEnd};
  if(keys.length===1&&(v.t==='draw'||v.t==='pass'||v.t==='next'))return{t:v.t};
  return null;
}
export function dominoMain(board:readonly PlacedDomino[]) {return board.filter(tile=>!tile.arm);}
export function dominoEnds(board: readonly PlacedDomino[]) {const main=dominoMain(board);return main.length?[main[0]!.a,main.at(-1)!.b] as const:null;}
export function dominoOpenEnds(board:readonly PlacedDomino[]):{end:DominoEnd;pips:number}[] {
  const main=dominoMain(board);if(!main.length)return [];
  const result:{end:DominoEnd;pips:number}[]=[{end:'left',pips:main[0]!.a},{end:'right',pips:main.at(-1)!.b}];
  const spinner=main.findIndex(tile=>tile.spinner);
  if(spinner>0&&spinner<main.length-1)for(const end of ['up','down'] as const){const arm=board.filter(tile=>tile.arm===end);result.push({end,pips:arm.at(-1)?.b??main[spinner]!.a});}
  return result;
}
export function exposedDominoTotal(board: readonly PlacedDomino[]) {
  const main=dominoMain(board);if(!main.length)return 0;
  let total=main.length===1?main[0]!.a+main[0]!.b:main[0]!.a*(main[0]!.a===main[0]!.b?2:1)+main.at(-1)!.b*(main.at(-1)!.a===main.at(-1)!.b?2:1);
  for(const end of ['up','down'] as const){const tip=board.filter(tile=>tile.arm===end).at(-1);if(tip)total+=tip.b*(tip.a===tip.b?2:1);}
  return total;
}
function place(board: readonly PlacedDomino[],tile:DominoId,end:DominoEnd,seat:number,variant:DominoVariant):PlacedDomino[]|null {
  const [a,b]=dominoPips(tile),ends=dominoEnds(board),main=dominoMain(board),branches=board.filter(t=>t.arm);
  const base={id:tile,seat,placement:board.length,...(variant==='muggins'&&a===b&&!board.some(t=>t.a===t.b)?{spinner:true}:{})};
  if(!ends)return end==='right'?[{...base,a,b}]:null;
  if(end==='up'||end==='down'){
    if(variant!=='muggins')return null;const open=dominoOpenEnds(board).find(item=>item.end===end);if(!open)return null;
    const next=a===open.pips?{...base,a,b,arm:end}:b===open.pips?{...base,a:b,b:a,arm:end}:null;
    return next?[...board,next]:null;
  }
  const next=end==='left'?(b===ends[0]?{...base,a,b}:a===ends[0]?{...base,a:b,b:a}:null):(a===ends[1]?{...base,a,b}:b===ends[1]?{...base,a:b,b:a}:null);
  return next?[...(end==='left'?[next,...main]:[...main,next]),...branches]:null;
}
export function dominoOptions(state: Pick<DominoState,'hands'|'board'|'forcedOpening'|'variant'|'phase'|'turn'>,seat=state.turn):DominoOption[] {
  if(state.phase!=='play'||seat!==state.turn)return[];
  return (state.hands[seat]??[]).flatMap(tile=>{
    if(state.forcedOpening&&tile!==state.forcedOpening)return[];
    return (state.board.length?dominoOpenEnds(state.board).map(item=>item.end):['right'] as const).flatMap(end=>{
      const next=place(state.board,tile,end,seat,state.variant);if(!next)return[];
      const total=exposedDominoTotal(next),points=state.variant==='muggins'&&total%5===0?total:0;
      return[{tile,end,points}];
    });
  });
}
export function canDrawDomino(state:DominoState,seat=state.turn) {return state.phase==='play'&&seat===state.turn&&state.variant!=='block'&&state.stock.length>0&&dominoOptions(state,seat).length===0;}
export function canPassDomino(state:DominoState,seat=state.turn) {return state.phase==='play'&&seat===state.turn&&dominoOptions(state,seat).length===0&&(state.variant==='block'||state.stock.length===0);}
function shuffled(random:()=>number) {
  const tiles=[...DOMINO_SET];
  for(let i=tiles.length-1;i>0;i--){const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw new Error('Invalid tile randomness.');const j=Math.floor(value*(i+1));[tiles[i],tiles[j]]=[tiles[j]!,tiles[i]!];}
  return tiles;
}
function deal(state:DominoState,random:()=>number) {
  const tiles=shuffled(random);state.hands=[tiles.slice(0,7),tiles.slice(7,14)];state.stock=tiles.slice(14);state.board=[];state.passes=0;state.result=null;state.forcedOpening=null;state.phase='play';
  {
    const ranked=state.hands.flatMap((hand,seat)=>hand.map(tile=>({tile,seat}))).sort((a,b)=>{
      const [x,y]=dominoPips(a.tile),[u,v]=dominoPips(b.tile);return Number(u===v)-Number(x===y)||dominoValue(b.tile)-dominoValue(a.tile)||Math.max(u,v)-Math.max(x,y)||b.tile.localeCompare(a.tile);
    });
    state.starter=ranked[0]!.seat;state.forcedOpening=ranked[0]!.tile;
  }
  state.turn=state.starter;return state;
}
export function newDominoGame(players:DominoPlayer[],variant:DominoVariant,target=100,random:()=>number=Math.random):DominoState {
  if(players.length!==2||players.some(p=>!p.id||!p.name||p.bot&&!['easy','normal','hard'].includes(p.level??'normal'))||players[0]!.id===players[1]!.id||!Object.hasOwn(DOMINO_VARIANTS,variant)||![100,150,200].includes(target))throw new Error('Choose two players and valid Dominoes settings.');
  return deal({players:players.map(p=>({...p})),variant,target,round:1,turn:0,starter:0,hands:[],stock:[],board:[],scores:[0,0],phase:'play',winner:null,forcedOpening:null,passes:0,result:null,activity:[],sequence:0},random);
}
function record(state:DominoState,seat:number,kind:DominoActivity['kind'],details:Partial<DominoActivity>={}) {
  state.sequence++;state.activity=[...state.activity,{id:state.sequence,seat,kind,round:state.round,...details}].slice(-40);
}
function finishHand(state:DominoState,winner:number|null,reason:DominoResult['reason']) {
  const pips=state.hands.map(hand=>hand.reduce((n,t)=>n+dominoValue(t),0)),awards=[0,0];
  if(winner!==null&&reason!=='target'){
    const raw=reason==='out'?pips[1-winner]!:pips[1-winner]!-pips[winner]!;
    awards[winner]=state.variant==='muggins'?Math.round(raw/5)*5:raw;state.scores[winner]!+=awards[winner]!;
  }
  state.winner=state.scores.findIndex(score=>score>=state.target);if(state.winner===-1)state.winner=null;
  state.phase=state.winner===null?'roundOver':'finished';
  const name=winner===null?'Neither player':state.players[winner]!.name;
  state.result={winner,reason,pips,awards,note:reason==='target'?`${name} reached the match target.`:reason==='out'?`${name} played the last tile.`:winner===null?'Blocked hand: equal pip totals. No points awarded.':`${name} wins the blocked hand with fewer pips.`};
  state.starter=winner??1-state.starter;return state;
}
export function applyDominoMove(original:DominoState,seat:number,input:DominoMove,random:()=>number=Math.random):DominoState|null {
  const move=parseDominoMove(input);if(!move||!Number.isInteger(seat)||seat<0||seat>1)return null;
  if(move.t==='next'){
    if(original.phase!=='roundOver')return null;
    const next=structuredClone(original);next.round++;deal(next,random);record(next,seat,'next');return next;
  }
  if(original.phase!=='play'||seat!==original.turn)return null;
  const state=structuredClone(original);
  if(move.t==='play'){
    const legal=dominoOptions(state,seat).find(option=>option.tile===move.tile&&option.end===move.end);if(!legal)return null;
    state.board=place(state.board,move.tile,move.end,seat,state.variant)!;state.hands[seat]=state.hands[seat]!.filter(tile=>tile!==move.tile);state.forcedOpening=null;state.passes=0;state.scores[seat]!+=legal.points;
    record(state,seat,'play',{tile:move.tile,end:move.end,points:legal.points});
    if(state.scores[seat]!>=state.target)return finishHand(state,seat,'target');
    if(!state.hands[seat]!.length)return finishHand(state,seat,'out');
    state.turn=1-seat;return state;
  }
  if(move.t==='draw'){
    if(!canDrawDomino(state,seat))return null;let count=0;
    while(state.stock.length&&!dominoOptions(state,seat).length){state.hands[seat]!.push(state.stock.pop()!);count++;}
    record(state,seat,'draw',{count});return state;
  }
  if(!canPassDomino(state,seat))return null;
  state.passes++;record(state,seat,'pass');
  if(state.passes===2){const totals=state.hands.map(hand=>hand.reduce((sum,tile)=>sum+dominoValue(tile),0));return finishHand(state,totals[0]===totals[1]?null:totals[0]!<totals[1]!?0:1,'blocked');}
  state.turn=1-seat;return state;
}
/** Decisions use the bot's own hand, played tiles and public counts, never the other hand. */
export function dominoBotMove(state:DominoState,seat=state.turn,level:Level='normal',random:()=>number=Math.random):DominoMove|null {
  if(state.phase!=='play'||state.turn!==seat||!state.players[seat]?.bot)return null;
  const options=dominoOptions(state,seat);
  if(!options.length)return canDrawDomino(state,seat)?{t:'draw'}:canPassDomino(state,seat)?{t:'pass'}:null;
  if(level==='easy'){const n=Math.max(0,Math.min(options.length-1,Math.floor(random()*options.length)));const best=options[n]!;return{t:'play',tile:best.tile,end:best.end};}
  const hand=state.hands[seat]!,known=new Set([...hand,...state.board.map(tile=>tile.id)]),unknown=DOMINO_SET.filter(tile=>!known.has(tile));
  const weight=(option:DominoOption)=>{
    if(hand.length===1||state.scores[seat]!+option.points>=state.target)return 100000+option.points;
    const next=place(state.board,option.tile,option.end,seat,state.variant)!,ends=dominoEnds(next)!,remaining=hand.filter(tile=>tile!==option.tile);
    const cover=remaining.reduce((sum,tile)=>sum+dominoPips(tile).filter(pip=>ends.includes(pip)).length,0);
    let value=option.points*4+dominoValue(option.tile)*1.3+Number(dominoPips(option.tile)[0]===dominoPips(option.tile)[1])*2+cover*2;
    if(level==='hard'){
      const replies=unknown.flatMap(tile=>dominoOpenEnds(next).map(item=>item.end).flatMap(end=>{const board=place(next,tile,end,1-seat,state.variant);if(!board)return[];const total=exposedDominoTotal(board);return[state.variant==='muggins'&&total%5===0?total:0];}));
      const risk=replies.length?replies.reduce((s,n)=>s+n,0)/replies.length:0;
      value+=cover*2.5-risk*3-(remaining.some(tile=>dominoPips(tile).includes(ends[0]))?0:4)-(remaining.some(tile=>dominoPips(tile).includes(ends[1]))?0:4);
    }
    return value;
  };
  const best=[...options].sort((a,b)=>weight(b)-weight(a)||a.tile.localeCompare(b.tile)||a.end.localeCompare(b.end))[0]!;
  return{t:'play',tile:best.tile,end:best.end};
}
