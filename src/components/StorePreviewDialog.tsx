import { useEffect, useRef, type ReactNode } from 'react';
export function StorePreviewDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current, opener = document.activeElement; node?.showModal(); return () => { node?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); }; }, []);
  return <dialog ref={dialog} className="store-preview-dialog" aria-label={title} onCancel={event => { event.preventDefault(); close(); }}><header><h2>{title}</h2><button type="button" className="btn-ghost-gold" onClick={close} autoFocus>Close preview</button></header><div>{children}</div></dialog>;
}
