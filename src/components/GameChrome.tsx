import {GameMusic} from './GameMusic';
import { ClubhouseLogo } from "./ClubhouseLogo";
import { Link } from '@tanstack/react-router';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function GameHeader({ title, children }: { title: string; children: ReactNode }) {
  return <div className="game-play-header"><Link to="/" aria-label="Back to the Clubhouse">← <ClubhouseLogo decorative/><span>Clubhouse</span></Link><h1>{title}</h1><div><GameMusic/>{children}</div></div>;
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
