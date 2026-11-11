import { useState } from 'react';
import { CardArtwork } from './CardArtwork';
import { cardLabel } from '@/lib/hand-order';
import { canLayOff, rummyCallOptions } from '@/lib/rummy-engine';
import { isSet, rankOf, suitOf, type Card, type Move } from '@/lib/rummy';
import type { RoomView } from '@/lib/rummy-protocol';

export function RummyTableMelds({room,card,enabled,onMove}:{room:RoomView;card?:Card;enabled:boolean;onMove:(move:Move)=>Promise<boolean>}) {
  return <div className="rummy-player-melds">{room.players.map((player,seat)=>{
    const groups=room.melds.flatMap((meld,index)=>meld.cards[0]?.by===seat?[{meld,index}]:[]);
    if(!groups.length)return null;
    return <section className="rummy-meld-owner" data-owner={seat} key={player.id} aria-label={`${player.name}'s melds`}><h3>{player.name}{seat===room.mySeat?' (you)':''}<small>{groups.length} {groups.length===1?'meld':'melds'}</small></h3>{groups.map(({meld,index})=>{
      const cards=meld.cards.map(item=>item.c),set=isSet(cards),high=cards.some(c=>rankOf(c)===13)&&!cards.some(c=>rankOf(c)===2),rank=(c:Card)=>rankOf(c)===1&&high?14:rankOf(c)||20;
      const ordered=[...meld.cards].sort((a,b)=>set?suitOf(a.c).localeCompare(suitOf(b.c)):rank(a.c)-rank(b.c));
      return <article className="rummy-owned-meld" data-owner={seat} key={index}><h4>{set?'Set':'Run'} #{index+1} <span>Started by {player.name}</span></h4><div className="rummy-meld-cards">{ordered.map(({c,by})=><figure key={c} data-played-by={by} aria-label={`${cardLabel(c)} played by ${room.players[by]?.name}`}><span className="card-face-small"><CardArtwork card={c}/></span><figcaption>{room.players[by]?.name}{by!==seat?' · layoff':''}</figcaption></figure>)}</div><button className="rummy-meld-layoff" disabled={!enabled||!card||!canLayOff(card,meld,room.variant)} onClick={()=>card&&void onMove({t:'layoff',card,meld:index})}>Lay off on {set?'set':'run'} #{index+1}</button></article>;
    })}</section>;
  })}</div>;
}

export function RummyCallOffer({room,pending,onMove}:{room:RoomView;pending:boolean;onMove:(move:Move)=>Promise<boolean>}) {
  const [chosen,setChosen]=useState(-1),options=room.mySeat===null?[]:rummyCallOptions({...room,phase:room.phase??'roundOver'},room.mySeat);
  if(room.status!=='playing'||!options.length||!room.rummyClaim)return null;
  const target=options.includes(chosen)?chosen:options[0]!,claim=room.rummyClaim;
  return <section className="rummy-call-offer" aria-label="Rummy call available"><strong>Call Rummy!</strong><p>{room.players[claim.discarder]?.name} discarded {cardLabel(claim.card)}. It plays on the table.</p>{options.length>1&&<label>Choose a meld<select aria-label="Rummy call target" value={target} onChange={e=>setChosen(Number(e.target.value))}>{options.map(index=><option key={index} value={index}>{isSet(room.melds[index]!.cards.map(c=>c.c))?'Set':'Run'} #{index+1} · {room.players[room.melds[index]!.cards[0]!.by]?.name}</option>)}</select></label>}<div><button disabled={pending} onClick={()=>void onMove({t:'rummy',meld:target})}>Call Rummy!</button><button disabled={pending} onClick={()=>void onMove({t:'pass-rummy'})}>Pass call</button></div><small>Claim it before the next draw. Your regular turn stays the same.</small></section>;
}
