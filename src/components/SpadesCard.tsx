import { CardArtwork } from './CardArtwork';
import { CLASSIC_DECK, type SpadesDeck } from '@/lib/spades-cosmetics';

/** Keep each collectible deck’s palette and face/back identity. */
export function SpadesCard({ card, deck = CLASSIC_DECK, back = false }: { card?: string; deck?: SpadesDeck; back?: boolean }) {
  return <CardArtwork card={card} deck={deck} back={back} />;
}
