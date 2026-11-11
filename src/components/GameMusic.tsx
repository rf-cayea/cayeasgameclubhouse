import {useEffect,useRef,useState} from 'react';

const TRACKS=['windowlight','quiet-current','soft-landing','last-lantern'];
const CROSSFADE=1.5;
const VOLUME=.42;
type Status='off'|'loading'|'playing'|'paused'|'error';

function startPlaylist(context:AudioContext,buffers:AudioBuffer[]){
  const master=context.createGain();
  master.gain.value=VOLUME;
  master.connect(context.destination);

  function schedule(index:number,start:number){
    const source=context.createBufferSource(),fade=context.createGain();
    const buffer=buffers[index]!;
    source.buffer=buffer;
    source.connect(fade).connect(master);
    const end=start+buffer.duration;
    fade.gain.setValueAtTime(0,start);
    fade.gain.linearRampToValueAtTime(1,start+CROSSFADE);
    fade.gain.setValueAtTime(1,end-CROSSFADE);
    fade.gain.linearRampToValueAtTime(0,end);
    source.start(start);
    return {source,fade,end};
  }

  function continueAfter(current:ReturnType<typeof schedule>,index:number){
    const next=schedule(index,current.end-CROSSFADE);
    current.source.onended=()=>{
      current.source.disconnect();
      current.fade.disconnect();
      if(context.state!=='closed')continueAfter(next,(index+1)%buffers.length);
    };
  }

  continueAfter(schedule(0,context.currentTime+.05),1);
}

export function GameMusic(){
  const [status,setStatus]=useState<Status>('off');
  const player=useRef<{context:AudioContext;requests:AbortController}|null>(null);
  const busy=useRef(false);

  useEffect(()=>()=> {
    const active=player.current;
    player.current=null;
    active?.requests.abort();
    if(active&&active.context.state!=='closed')void active.context.close();
  },[]);

  async function toggle(){
    if(busy.current)return;
    busy.current=true;
    let active=player.current;
    try{
      if(active){
        if(status==='playing'){
          await active.context.suspend();
          if(player.current===active)setStatus('paused');
        }else{
          await active.context.resume();
          if(player.current===active)setStatus('playing');
        }
        return;
      }
      active={context:new AudioContext(),requests:new AbortController()};
      player.current=active;
      setStatus('loading');
      const {context,requests}=active;
      await context.resume();
      const buffers=await Promise.all(TRACKS.map(async slug=>{
        const response=await fetch(`/game-music/${slug}.mp3`,{signal:requests.signal});
        if(!response.ok)throw new Error('Music could not load.');
        return context.decodeAudioData(await response.arrayBuffer());
      }));
      if(player.current!==active)return;
      startPlaylist(context,buffers);
      setStatus('playing');
    }catch{
      if(player.current===active){
        active?.requests.abort();
        if(active&&active.context.state!=='closed')void active.context.close();
        player.current=null;
        setStatus('error');
      }
    }finally{busy.current=false;}
  }

  const label=status==='loading'?'Loading background music':status==='error'?'Music unavailable. Retry':
    status==='playing'?'Pause background music':'Play background music';
  return <button type="button" aria-label={label} aria-pressed={status==='playing'} title={label}
    disabled={status==='loading'} onClick={()=>void toggle()}>
    <span aria-hidden="true">{status==='loading'?'…':status==='playing'?'♫':'♪'}</span>
  </button>;
}
