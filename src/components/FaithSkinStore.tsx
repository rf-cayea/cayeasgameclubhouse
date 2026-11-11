import { increasedStorePrice } from '@/lib/economy-protocol';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { type Wallet, notifyWallet } from '@/lib/clubhouse';
import { FAITH_SKINS, equippedFaithSkin, type FaithSkinId } from '@/lib/faith-skins';
import { equipFaithSkin, loadFaithSkins, purchaseFaithSkin } from '@/lib/faith-skin-api';
import { THEMES } from '@/lib/game';
import { FaithTileArtwork } from './FaithTileArtwork';

const message = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'The skin could not be updated. Please retry.';
export function FaithSkinStore({ userId, wallet, ready, onEquipped }: { userId: string | null; wallet: Wallet | null; ready: boolean; onEquipped?: (ownerId: string, wallet: Wallet) => void }) {
  const [catalogReady, setCatalogReady] = useState(false), [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<FaithSkinId | null>(null), [collection, setCollection] = useState(0);
  const [purchased, setPurchased] = useState<string[]>([]);
  const active = useRef(false), pending = useRef(false), account = useRef(userId), catalogRequest = useRef(0), dialog = useRef<HTMLDialogElement>(null);
  account.current = userId;
  const balance = wallet?.points ?? 0, currentSkin = equippedFaithSkin(wallet);
  const item = FAITH_SKINS.find(value => value.id === confirm);
  async function load() {
    const version = ++catalogRequest.current;
    setCatalogReady(false); setCatalogError('');
    try { await loadFaithSkins(); if (active.current && version === catalogRequest.current) setCatalogReady(true); }
    catch { if (active.current && version === catalogRequest.current) setCatalogError('Skin checkout is temporarily unavailable. You can still preview every design.'); }
  }
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; ++catalogRequest.current; }; }, []);
  useEffect(() => { setConfirm(null); setPurchased([]); setError(''); setNotice(''); }, [userId]);
  useEffect(() => { const node = dialog.current; if (confirm) node?.showModal(); return () => node?.close(); }, [confirm]);
  async function mutate(kind: 'buy' | 'equip', id: FaithSkinId) {
    if (!userId || !wallet || pending.current || (kind === 'buy' && !catalogReady)) return;
    const buyer = userId; pending.current = true; setBusy(true); setError('');
    try {
      if (kind === 'buy') {
        const result = await purchaseFaithSkin(id, buyer);
        if (active.current && account.current === buyer) {
          setPurchased(previous => previous.includes(id) ? previous : [...previous, id]);
          setNotice(result.already_owned ? 'You already own this skin. No Cash was charged.' : 'Skin collected permanently. Choose Equip to use it in Faith 3.');
        }
      } else {
        const result = await equipFaithSkin(id, buyer);
        onEquipped?.(buyer, result.wallet);
        if (active.current && account.current === buyer) setNotice('Skin equipped. Your Faith 3 board and tray will use this finish.');
      }
      if (active.current && account.current === buyer) setConfirm(null);
      notifyWallet();
    } catch (cause) { if (active.current && account.current === buyer) setError(message(cause)); notifyWallet(); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section className="faith-skin-store card-hub mt-6" aria-labelledby="faith-skins-title" id="faith-skins">
    <p className="faith-eyebrow">A NEW FINISH FOR EVERY TRADITION</p><div className="faith-skin-heading"><div><h2 id="faith-skins-title" className="font-display text-3xl text-gold">The Faith 3 atelier</h2><p className="mt-3 text-sm text-muted-foreground">{FAITH_SKINS.length} permanent tile skins. Each styles all ten religious collections, on your board and in your tray. Cosmetic finishes keep every level’s rules the same.</p></div><Link to="/games/faith-3" className="btn-ghost-gold">Play Faith 3</Link></div>
    <div className="faith-skin-toolbar"><label htmlFor="skin-preview-collection">Preview collection<select id="skin-preview-collection" aria-label="Skin preview collection" value={collection} onChange={event => setCollection(Number(event.target.value))}>{THEMES.map((theme, index) => <option key={theme.name} value={index}>{theme.name}</option>)}</select></label>{userId && wallet && <p>Your balance: <strong data-testid="faith-skin-cash">{balance.toLocaleString()}</strong> Clubhouse Cash</p>}</div>
    <div className="faith-skin-grid">{FAITH_SKINS.map(skin => {
      const owned = Boolean(wallet?.owned.includes(skin.id) || purchased.includes(skin.id)), equipped = owned && currentSkin === skin.id;
      return <article className="faith-skin-card" key={skin.id} aria-label={skin.name}>
        <div className="faith-skin-samples" aria-label={`${skin.name} preview`}>{[0, 1, 3].map(type => <div key={type}><FaithTileArtwork collection={collection} type={type} skin={skin.id} labelled /></div>)}</div>
        <p className="faith-skin-preview-note">Design preview</p><h3>{skin.name}</h3><p>{skin.description}</p><strong className="faith-skin-price">{increasedStorePrice(skin.price)} Clubhouse Cash</strong><small>Permanent unlock · all ten collections</small>
        {!ready ? <p role="status">Loading your collection…</p> : !userId ? <Link to="/auth" className="btn-ghost-gold">Sign in to collect</Link> : <button className="btn-gold" disabled={busy || !wallet || equipped || (!owned && (!catalogReady || balance < increasedStorePrice(skin.price)))} onClick={() => owned ? void mutate('equip', skin.id) : setConfirm(skin.id)}>{equipped ? 'Equipped' : owned ? 'Equip skin' : `Buy · ${increasedStorePrice(skin.price)} Cash`}</button>}
        {userId && wallet && !owned && balance < increasedStorePrice(skin.price) && <small>Earn {increasedStorePrice(skin.price) - balance} more Clubhouse Cash to collect.</small>}
      </article>;
    })}</div>
    <p className="mt-4 text-sm text-muted-foreground">Convert earned game points to Clubhouse Cash in your reward wallet. These skins do not cost real money.</p>
    {catalogError && <p role="status" className="mt-3 text-sm text-muted-foreground">{catalogError} <button className="text-gold underline" onClick={() => void load()}>Retry checkout</button></p>}
    {notice && <p role="status" className="mt-3 text-gold">{notice}</p>}{error && !confirm && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    {item && <dialog ref={dialog} className="spades-dialog" aria-labelledby="faith-skin-purchase-title" onCancel={event => { if (busy) event.preventDefault(); else setConfirm(null); }}><h2 id="faith-skin-purchase-title" className="font-display text-2xl text-gold">Collect {item.name}?</h2><p className="mt-4">Spend {increasedStorePrice(item.price)} Clubhouse Cash for this permanent tile skin.</p><p className="mt-2 text-sm">Balance after purchase: {Math.max(0, balance - increasedStorePrice(item.price))} Clubhouse Cash.</p><div className="mt-5 flex gap-3"><button className="btn-gold" disabled={busy || !userId || !wallet || !catalogReady || balance < increasedStorePrice(item.price)} onClick={() => void mutate('buy', item.id)}>{busy ? 'Collecting…' : 'Confirm purchase'}</button><button className="btn-ghost-gold" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div>{error && <p role="alert" className="mt-3 text-destructive">{error}</p>}</dialog>}
  </section>;
}
