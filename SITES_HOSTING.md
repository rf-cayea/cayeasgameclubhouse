# Sites hosting

Live Site: https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site

The complete React frontend and authoritative APIs run together in a Cloudflare
Worker. Sites binds D1 as `DB`; rooms, request receipts, current wallets,
profiles/friends, puzzle proofs, achievements and collectible albums persist
there. Supabase handles authentication and the moderated lounge.

## Build and package

```sh
npm ci
npm run typecheck
npm test
npm run build:sites
```

The build produces `dist/server/index.js`, a standalone Worker with embedded
frontend/artwork, plus its compatibility configuration. Package `.openai/`,
`dist/server/` and `drizzle/`. Push the exact source before saving a Sites
version; build output and commit must match. Deploy the saved version while
preserving the existing Site's audience and database binding.

`art/optimized-assets/manifest.json` verifies source hashes before existing WebP
URLs use pre-encoded AVIF. Original WebP source remains intact. New collectible
paintings are AVIF atlases. HTTP Content-Encoding is deliberately absent so the
Site gateway receives readable HTML/JS and directly decodable images.

## Game and data migrations

`drizzle/meta/_journal.json` orders all migrations. Include the complete journal
and SQL files, not just a selected newest statement. Sites applies migrations
through deployment, not through an HTTP request. Recent additive migrations:

- `0014_public_matchmaking`: opt-in public lobby listings.
- `0015_clubhouse_farkle`: six-dice Farkle rooms/requests/reward evidence.
- `0016_broad_the_phantom`: Crown & Court rooms/requests/rewards.
- `0017_clubhouse_backgammon`: Backgammon rooms/requests/rewards.
- `0018_cayea_collectibles`: albums and escrowed duplicate trades.
- `0019_clubhouse_carrom`: Carrom / Disc Pool rooms/requests/rewards.

Local Node initialization creates the equivalent SQLite schema. Local data is
not automatically transferred to the hosted database. Supabase SQL migrations
in `supabase/migrations/` are a separate system; do not paste D1 SQL into Supabase.

Rummy and Spades share generated D1 stores with their Node engines. After
editing `server/rooms.ts` or `server/spades-rooms.ts`, run:

```sh
node scripts/generate-cloud-stores.mjs
```

Newer engines use one asynchronous store for both SQLite and D1. Revision guards,
request IDs and unique ledger sources prevent competing or retried commands
from overwriting state, repeating shots/rolls or double-paying rewards.

## Member configuration

Sites runtime settings use `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
(`SUPABASE_ANON_KEY` is also supported). `/clubhouse-config.js` serves only the
HTTPS URL and browser-safe public key. Local Vite supports `VITE_SUPABASE_*` in
ignored `.env.local` files. Server secrets use the supported server-only names,
including `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or
`CLUBHOUSE_REWARD_KEY` for legacy delivery/name mirroring. They never use a
`VITE_` prefix. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

The current game economy is D1-owned. Existing Supabase wallet/award data is
imported once per member; current balances and entitlements are then committed
through `EconomyStore`. Legacy external reward delivery remains retryable;
new game evidence and current receipts are stored in the game database.

## Verification

`npm test` checks game rules, real SQLite/D1 transactions, HTTP authorization,
private projections, lobby concurrency, reward proofs and collectible trades.
The build checks supported routes and the Worker size limit. Browser scripts
exercise actual gameplay on local previews, including Carrom touch gestures,
shared online replays, booster reveals, sounds, reduced motion and retry recovery.
See the helper/startup notes in each script. A successful production deployment
confirms publication; local test fixtures never grant live player rewards.
