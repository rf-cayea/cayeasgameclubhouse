import { useEffect, useRef, useState, type ReactNode } from 'react';
import { equipStoreItem } from '@/lib/store';
import { notifyWallet, type Wallet } from '@/lib/clubhouse';
import '@/styles/setup-set-picker.css';

type Design = { id: string; name: string };
export function SetupSetPicker({ label, slot, designs, selected, userId, disabled, onEquipped, onGuest, onBusyChange, children }: { label: string; slot: string; designs: readonly Design[]; selected: string; userId: string | null; disabled?: boolean; onEquipped: (owner: string, wallet: Wallet) => void; onGuest?: (id: string) => void; onBusyChange: (busy: boolean) => void; children: ReactNode }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), mounted = useRef(true), owner = useRef(userId); owner.current = userId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => setError(''), [userId]);
  async function equip(id: string) {
    if (pending.current || !designs.some(item => item.id === id)) return;
    if (!userId) { onGuest?.(id); return; }
    const buyer = userId; pending.current = true; setBusy(true); setError(''); onBusyChange(true);
    try {
      const result = await equipStoreItem(slot, id, buyer);
      if (mounted.current && owner.current === buyer) onEquipped(buyer, result.wallet);
      notifyWallet();
    } catch (cause) { if (mounted.current && owner.current === buyer) setError(cause instanceof Error ? cause.message : 'Your set could not be equipped. Try again.'); }
    finally { pending.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
  return <fieldset className="setup-set-picker" disabled={disabled || busy || (!userId && !onGuest)}><legend>Your {label.toLowerCase()}</legend><div className="setup-set-picker-row"><label>{label}<select aria-label={label} value={selected} onChange={event => void equip(event.target.value)}>{designs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="setup-set-picker-preview" aria-hidden="true">{children}</div></div>{busy && <p role="status">Equipping…</p>}{error && <p role="alert">{error}</p>}</fieldset>;
}
