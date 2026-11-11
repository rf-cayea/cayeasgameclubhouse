/** Server-owned states are replayed publicly, using the same clock for every viewer. */
export const COMPUTER_STEP_MS=1200;
export interface ComputerStates<State> {id:string;startedAt:number;states:State[]}
export interface ComputerPlayback<View> {id:string;startedAt:number;stepMs:number;frames:View[]}
export function computerFrame<View>(room:View & {playback?:ComputerPlayback<View>},now:number):{room:View;pacing:boolean;nextIn:number} {
 const play=room.playback;if(!play||play.frames.length<2||!Number.isFinite(play.startedAt)||play.stepMs<250)return {room,pacing:false,nextIn:0};
 const elapsed=Math.max(0,now-play.startedAt),index=Math.floor(elapsed/play.stepMs);
 if(index>=play.frames.length-1)return {room,pacing:false,nextIn:0};
 return {room:play.frames[index]!,pacing:true,nextIn:play.stepMs-elapsed%play.stepMs};
}
