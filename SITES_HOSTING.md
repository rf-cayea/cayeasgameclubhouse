# Sites hosting

The Sites build keeps the original Clubhouse frontend and runs its authoritative
Rummy+ and Spades rules in a Cloudflare Worker. Guest sessions, rooms, request
IDs and reward outboxes persist in D1, rather than a local SQLite file.

## Build

```sh
npm ci
npm run build:sites
npm test
```

`build:sites` checks generated cloud stores, typechecks the app, builds the Vite
frontend and embeds it into `dist/server/index.js`. The deployment artifact also
contains `.openai/hosting.json`, Worker compatibility configuration and migrations.
This avoids a separate static frontend deployment and keeps game API requests and
HttpOnly guest cookies on the same origin. Existing `npm run dev` and `npm start`
continue to use the original Node service for local development.

Edit game rules in `server/rooms.ts` or `server/spades-rooms.ts`, then run
`node scripts/generate-cloud-stores.mjs`. Checked-in cloud stores use the same rules
with asynchronous D1 calls. A command batches the room, move deduplication and reward
writes behind an atomic revision check. A conflicting concurrent command returns
409 and leaves all its writes unapplied. The client refreshes the current table.

## Database

The DB binding is declared in `.openai/hosting.json`. Generated schema migrations and their journal are in `drizzle/`. Apply them
through the Sites publishing workflow, never from a request handler. Existing local
SQLite files are not automatically transferred. Hosted streams recheck each private
room and notify clients about new revisions; polling remains a fallback.

## Optional member features

Guest play does not require Supabase. To enable the existing member features,
configure the same Supabase project and SQL migrations documented in README.md.
Set these production runtime variables through Sites environment settings:

- `SUPABASE_URL`: your HTTPS project URL
- `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`): your project's public key
- `CLUBHOUSE_REWARD_KEY` (or the supported Supabase server-secret variables): server
  credential authorized for the reward RPCs

Only the URL and public key are served by `/clubhouse-config.js`; server credentials
stay in the Worker environment. Member sign-in, wallets, purchases, lounge and
moderation need the original Supabase schema and policies. The adaptation does not
create or alter an external Supabase project, grant free unlocks, or fabricate
wallet balances. Incomplete reward delivery remains in the durable outbox and
retries on subsequent game requests.

## Verification

The test suite includes the original game/server tests, D1 persistence and
concurrent-write tests, and Worker request integration tests. Browser QA requires
the Sites preview infrastructure; a Node or SQLite test is not a browser check.
