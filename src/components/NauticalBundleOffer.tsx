import { NAUTICAL_BUNDLES, NAUTICAL_FINISHES } from '@/lib/nautical-sets';
import { FARKLE_DICE_SETS } from '@/lib/farkle-dice';
import { DOMINO_SKINS } from '@/lib/dominoes-skins';
import type { EconomyWallet } from '@/lib/economy-protocol';
import { DieFace } from './FarkleDice';
import { DominoFace } from './DominoArtwork';
import { StorePurchaseControls } from './StorePurchaseControls';
import '@/styles/nautical-collection.css';
export function NauticalBundleOffer({ game, userId, wallet, onBrowse }: { game:'dice'|'dominoes';userId:string|null;wallet:EconomyWallet|null;onBrowse:()=>void }) {
 const bundle=NAUTICAL_BUNDLES[game==='dice'?0:1];
 return <section className="nautical-bundle" aria-label="Nautical collection bundle"><div><p className="nautical-eyebrow">FOUR SHORES. ONE COLLECTION.</p><h3>Nautical collection</h3><p>Four individual {game==='dice'?'dice':'tile'} sets, 313 points or 242 Cash each. The bundle unlocks all four for this game: 1,000 points or 770 Cash. Save 252 points compared with four separate purchases.</p></div><div className="nautical-bundle-previews">{NAUTICAL_FINISHES.map(finish=><div key={finish.key}><div>{game==='dice'?<DieFace value={6} design={FARKLE_DICE_SETS.find(s=>s.id===`farkle-dice-nautical-${finish.key}`)!}/>:<DominoFace id="3-6" vertical design={DOMINO_SKINS.find(s=>s.id===`domino-skin-nautical-${finish.key}`)!}/>}</div><span>{finish.name}</span></div>)}</div><StorePurchaseControls itemId={bundle.id} userId={userId} wallet={wallet} owned={bundle.items.every(id=>wallet?.owned.includes(id))}/><button className="btn-ghost-gold" onClick={onBrowse}>View individual nautical sets</button><p className="nautical-note">Dice sets are shared across compatible d6 games; Dominoes tiles are separate purchases. Already-owned sets stay in your collection; this bundle has a fixed price.</p></section>;
}
