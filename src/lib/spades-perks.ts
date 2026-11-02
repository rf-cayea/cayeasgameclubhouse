/** Permanent per-player access to computer and online partnership Spades. */
export const SPADES_PARTNERSHIPS = { id: 'spades-partnerships', name: 'Spades Partnerships', price: 800, currency: 'spades_points' } as const;
export const ownsSpadesPartnerships = (owned?: readonly string[]) => Boolean(owned?.includes(SPADES_PARTNERSHIPS.id));
