import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { notifyWallet, type Wallet } from '@/lib/clubhouse';
import { CLASSIC_FAITH_SKIN, FAITH_SKINS, equippedFaithSkin } from '@/lib/faith-skins';
import { equipFaithSkin } from '@/lib/faith-skin-api';
export function FaithSkinPicker({ userId, wallet, ready, onEquipped }: { userId: string | null; wallet: Wallet | null; ready: boolean; onEquipped?: (owner: string, wallet: Wallet) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), active = useRef(false), account = useRef(userId); account.current = userId;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setError(''); }, [userId]);
  async function equip(id: string) {
    if (!userId || !wallet || pending.current) return;
    const buyer = userId; pending.current = true; setBusy(true); setError('');
    try { const result = await equipFaithSkin(id, buyer); if (active.current && account.current === buyer) onEquipped?.(buyer, result.wallet); notifyWallet(); }
    catch (cause) { if (active.current && account.current === buyer) setError(cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Your skin could not be changed.'); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <div className="faith-skin-picker"><label className="faith-select-label" htmlFor="faith-equipped-skin">Tile skin<select id="faith-equipped-skin" aria-label="Tile skin" value={equippedFaithSkin(wallet)} disabled={!ready || !userId || !wallet || busy} onChange={event => void equip(event.target.value)}><option value={CLASSIC_FAITH_SKIN}>Original illumination</option>{FAITH_SKINS.filter(skin => wallet?.owned.includes(skin.id)).map(skin => <option value={skin.id} key={skin.id}>{skin.name}</option>)}</select></label><Link to="/store" hash="faith-skins">Collect skins ↗</Link>{busy && <span role="status">Equipping…</span>}{error && <span role="alert">{error}</span>}</div>;
}
