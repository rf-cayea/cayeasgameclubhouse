import { Link } from '@tanstack/react-router';
import { useClubhouse } from '@/lib/clubhouse';
import { ownsSpadesPartnerships } from '@/lib/spades-perks';
import { StorePurchaseControls } from './StorePurchaseControls';
export function SpadesPartnershipUnlock() {
  const { user, wallet } = useClubhouse(), owned = ownsSpadesPartnerships(wallet?.owned);
  return <section id="spades-partnerships" className="card-hub mt-6 scroll-mt-6" aria-labelledby="partnership-title"><div className="text-4xl" aria-hidden="true">♠</div><h2 id="partnership-title" className="mt-3 font-display text-2xl text-gold">Spades Partnerships · 2 vs 2</h2><p className="mt-3 text-muted-foreground">Permanently unlock partnership Spades against computers or at private online tables. Each human player needs their own unlock.</p><StorePurchaseControls itemId="spades-partnerships" userId={user?.id ?? null} wallet={wallet} owned={owned}/>{owned && <Link to="/games/spades" className="btn-ghost-gold mt-4">Play partnership Spades</Link>}</section>;
}
