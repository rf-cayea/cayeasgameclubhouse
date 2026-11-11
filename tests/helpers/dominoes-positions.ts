/** Deterministic, server-owned positions for the local physical-table browser QA. */
import {newDominoGame,applyDominoMove,dominoBotMove,type DominoState} from '../../src/lib/dominoes';
import {rng} from '../../src/lib/game';
const players=[{id:'a',name:'Player',bot:true},{id:'b',name:'Computer',bot:true}],found:Record<string,DominoState>={};
for(const variant of ['draw','block','muggins'] as const)for(let seed=1;seed<80;seed++){
 const random=rng(seed);let state=newDominoGame(players,variant,200,random);
 for(let count=0;count<2000&&state.phase!=='finished';count++){
  state=applyDominoMove(state,state.turn,state.phase==='roundOver'?{t:'next'}:dominoBotMove(state,state.turn,'easy',random)!,random)!;
  if(state.turn===0&&state.phase==='play'){
   if(state.board.length>=(variant==='block'?10:18)&&!found[variant])found[variant]=structuredClone(state);
   if(variant==='muggins'&&state.board.some(t=>t.arm==='up')&&state.board.some(t=>t.arm==='down')&&!found.spinner)found.spinner=structuredClone(state);
  }
 }
 if(found[variant]&&(variant!=='muggins'||found.spinner))break;
}
if(Object.keys(found).length!==4)throw new Error('Missing physical table fixtures');
process.stdout.write(JSON.stringify(found));
