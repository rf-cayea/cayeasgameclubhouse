# Shared playing-card collection

All twelve collectible decks cost 450 Rummy+ or Spades points, or 347 Clubhouse Cash. Eight new designs join the four existing artist decks: Everyday Standard, Realms of Legend, Stellar Dominion, Sultan’s Court, Four-Suit Regalia, Chinese Imperial Courts, Pharaoh’s Court and Merfolk Kingdoms. Each uses 52 French-suited cards and two joker faces. Spades still deals exactly 52 cards; Rummy+ only includes jokers when its independently unlocked Joker Mode is selected. Included starter decks remain free for everyone.

`src/lib/playing-decks.ts` owns the catalog, compatible deck family, canonical card IDs and purchase aliases. Future games using this family should resolve the same `card-deck-*` entitlement rather than add game-specific products. Deck choices remain independent for each game. A host’s Spades selection is shared visually with the other seats without granting them ownership.

The authoritative EconomyStore charges a single canonical SKU atomically with its ledger receipt. Both card-game points sources and Cash compete for the same entitlement, so retries and concurrent checkouts cannot debit twice. Deprecated game-specific SKUs cannot be purchased by an older client at its outdated displayed price.

On the first wallet read, existing Rummy+/Spades deck purchases are combined and deduplicated. Earlier verified Rummy+ wins preserve their original deck rewards at 1, 3, 5 and 10 wins. The `legacy:shared-playing-decks` receipt makes this a one-time migration, even for members with zero wins. Future wins earn points and existing table rewards; new collectible decks require purchase. Balances and lifetime earnings are unchanged by migration. Saved legacy Rummy+ and Spades appearances resolve to the corresponding shared design. No Supabase SQL change is needed: the Sites economy owns these balances and entitlements, and imports previous Supabase ownership before this migration.

All new court, ace, joker, number-frame and card-back paintings use a theme-specific atlas. Exact indices and number pips are rendered over the artwork. Four-Suit Regalia uses black spades, red hearts, blue diamonds and green clubs on indices and pips as well as the painted court clothing. All hidden cards use the same back regardless of identity.

Retired room-background images are no longer deployed. Their old ownership IDs remain readable for compatibility; active games use their full-screen table surfaces.

Validation: `npm test`, `npm run build:sites`, and `python tests/shared_decks_browser.py --base-url http://127.0.0.1:5181`. The browser suite intercepts fictional member data and never spends real player currency. It checks 54-face previews, shared purchases/equips and both live renderers on phone and tablet sizes.

Artwork is optimized as WebP for deployment. Existing Faith atlas dimensions and panel geometry are preserved during compression; shortcut PNGs retain their dimensions and transparency. Full-resolution generated sources remain in the creation workspace.
