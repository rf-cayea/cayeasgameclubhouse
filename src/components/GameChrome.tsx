import '@/styles/compact-game-menus.css';
import {GameMusic} from './GameMusic';
import { ClubhouseLogo } from "./ClubhouseLogo";
import { Link } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function GameHeader({ title, children, music=true }: { title: string; children: ReactNode; music?:boolean }) {
  const [open,setOpen]=useState(false);
  return <><div className="game-play-header compact-game-header" data-compact-menu="true"><Link to="/" aria-label="Back to the Clubhouse">← <ClubhouseLogo decorative/><span>Clubhouse</span></Link><h1>{title}</h1><div>{music&&<GameMusic/>}<button className="compact-menu-trigger" aria-label={`${title} menu`} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><span aria-hidden="true">☰</span> Menu</button></div></div>
    {open&&<GamePanel title={`${title} menu`} close={()=>setOpen(false)} closeLabel="Back to game"><p className="compact-menu-intro">Your table, collection and game options.</p><nav className="compact-menu-actions" aria-label={`${title} options`} onClick={event=>{if((event.target as HTMLElement).closest('button,a'))setOpen(false);}}>{children}</nav></GamePanel>}
  </>;
}
export function GamePanel({ title, close, children, closeLabel = 'Back to game' }: { title: string; close: () => void; children: ReactNode; closeLabel?: string }) {
  const dialog = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="game-panel" aria-labelledby={id} onCancel={event => { event.preventDefault(); close(); }}><header><h2 id={id}>{title}</h2><button className="btn-ghost-gold" onClick={close} autoFocus>{closeLabel}</button></header><div className="game-panel-content">{children}</div></dialog>;
}
