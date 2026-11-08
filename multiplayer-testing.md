# Multiplayer testing and debugging

Rummy+ and Spades use the authoritative game API for room membership, moves,
private hands, ready states, table revisions and verified rewards. Profiles and
friend connections use the same verified member identity. Guest card games stay
available without a Supabase project; profiles, friend requests and in-app table
invitations require sign-in.

## Start locally

Use the Node version in `.nvmrc` and run:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

This starts Vite on5173 and the game API on8787. Reuse one API process. The local
SQLite data file is `.data/rummy.sqlite`, unless `RUMMY_DATA_FILE` selects another
test file. The hosted equivalent uses the D1 database and packaged Drizzle
migrations. Keep the database between restarts when testing saved-room recovery.
Do not copy a production database into automated test fixtures.

For real signed-in testing, configure the development Supabase project using
`.env.example` and restart the preview. Browser variables must use a publishable
key. Server secret keys must never use a `VITE_` prefix. Use separate test
accounts and separate browser profiles; an ordinary second tab shares the first
tab's auth and guest cookies and cannot represent an independent player.

## Guest room checklist

1. Open two independent browser contexts or two browsers. Choose Rummy+, Online,
   and create a room. Join its code from the second browser, ready both players,
   then start from the host. Each browser must see its own hand only.
2. Draw and discard on the active player. The other player should receive the
   next table revision without reloading. A computer table should return control
   after the computer's complete legal turn.
3. For Spades, use four independent contexts for four human seats. Check that
   the selected seat, host, ready states, bids, public tricks and private hands
   agree on all devices. Partnerships require sign-in and the permanent unlock
   for every human participant; solo guest games remain free.
4. Reload one context. Its saved room code, player seat and private hand should
   resume. An outsider who knows the code must not be able to read the room's
   private state. Joining a full or started room must fail normally.
5. Disconnect a device, make a legal move elsewhere, then reconnect. The device
   should catch up through polling or push updates. Refresh before repeating a
   move if its response was interrupted; the first request may have committed.
6. Leave a lobby and check host reassignment. Leaving an active game must close
   the table without granting a forfeit win or wallet rewards. Refresh must not
   restore a table that the browser successfully left.

Guest, practice, pass-and-play and mixed ranked-ineligible games do not grant
member rewards. Guest tests should not create point awards.

## Profiles, friends and invitations

Use two signed-in test accounts. Give each a different gamer name and open its
standalone profile. Test a case-insensitive name collision, invalid characters,
the length limits and a bio update; another account must not be able to edit it.
Profile links should keep pointing to the same player after a gamer-name change.

Search for the other gamer name. Send a request, then accept or decline from the
other account. Also check outgoing cancellation, removing an accepted friend,
blocking and unblocking. Repeated or concurrent clicks must not create duplicate
relationships. A blocked player must not send new requests or table invitations.

Create a waiting online Rummy+ or Spades table, invite an accepted friend, then
open the invitation from that account. Confirm the game, host and room code;
joining must still pass normal room and seat checks. Declined, expired, full,
started or closed-table invitations must not bypass those checks. Opening an
invitation while already playing should let the player choose what to do and
must not silently leave their current game. Invitation actions stay inside the
site; they do not send email.

## Connection reports

Open **Connection & testing details** where available. Compare the room code and
table revision on both devices. Record the game, table status, whether push or
polling is active, the last synchronization time, and the visible error. Use
**Reconnect / refresh** first; **Copy testing details** copies this small report.
It contains no authentication token, private cards, email address or wallet data.

For a reproducible issue, include the two browser/device sizes, room code,
revision before and after the action, which player acted, the action category,
and expected versus observed behavior. Do not include the other player's hidden
hand, cookies, JWTs, server keys or personal profile data.

An unavailable push stream is not automatically a failed game: the client polls
the room every three seconds and retries push. A403 can mean the current account
is not a member of that room; a409 means its revision changed. A network timeout
does not prove that a move failed to commit. Game engines reject stale revisions
and deduplicate an identical move request ID; clients should synchronize before
choosing a new action.

## Automated checks

```sh
npx vitest run tests/rummy-network.test.ts tests/rummy-server.test.ts tests/spades-server.test.ts tests/worker.test.ts
python3 tests/rummy_multiplayer_browser.py --base-url http://127.0.0.1:5173
python3 tests/spades_browser.py --base-url http://127.0.0.1:5173
python3 tests/spades_debug_browser.py --base-url http://127.0.0.1:5173
python3 tests/game_viewports_browser.py --base-url http://127.0.0.1:5173
```

The real browser suites use separate guest sessions against the actual local
API. Server and Worker tests use isolated SQLite/D1 bindings and exercise private
reads, ownership, competing moves, persistence and reward eligibility.

For account-transition regressions, run a second Vite process with explicitly
fictional configuration. Every request to its fictional Auth service is
intercepted by the tests:

```sh
VITE_SUPABASE_URL=https://clubhouse.test.invalid VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npx vite --host 127.0.0.1 --port 5174 --strictPort
python3 tests/rummy_network_browser.py --base-url http://127.0.0.1:5174
```

That test mounts the actual room hooks in a local-only harness. It holds reads
and move responses to check refresh coalescing, same-account auth notifications,
account switching, transport cancellation and late responses after leaving.
It changes no real accounts, games or rewards. The harness and fictional test
configuration are not imported by the production application.
