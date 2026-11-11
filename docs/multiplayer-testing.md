# Multiplayer testing and debugging

All eight multiplayer game entries use authoritative rooms, authenticated or
HttpOnly guest identities, revision checks, private per-player views, explicit
readiness and recoverable commands. The current public lobby is Match Making.

| API game key | Game route | Online modes |
| --- | --- | --- |
| `rummy` | `/games/rummy` | Classic, Gin and Rummy 500; Joker Mode is a separate unlock |
| `spades` | `/games/spades` | Four-seat Solo; Partnerships requires the permanent unlock |
| `five-dice` | `/games/quintsee` | Two players free; 3–4 require Quintsee Party for every player |
| `farkle` | `/games/farkle` | Classic 10,000 or Fast 5,000; 3–4 require Farkle Party for every player |
| `crown-court` | `/games/crown-court` | Free 2–4-player Short / Medium / Long games |
| `dominoes` | `/games/dominoes` | Two-player Draw / Block / Muggins |
| `backgammon` | `/games/backgammon` | Two-player Standard / Nackgammon; 1/3/5/7/9 points |
| `carrom` | `/games/carrom` | Two-player Carrom or Disc Pool |

Room codes and `?room=<eight-character hex code>` links provide private joins.
Rummy+/Spades also have signed-in in-app invitations on Friends. All games
provide **Match Making** for public discovery. A private room appears publicly
only after the host lists it. No browser knows another live card/tiles hand.

## Start locally

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

This starts Vite on 5173 and the API on 8787. Local data is
`.data/rummy.sqlite`, configurable with `RUMMY_DATA_FILE`. Use separate browser
contexts/profiles for separate players: normal tabs share auth and guest cookies.
For member tests, configure `.env.local` from `.env.example` using a dedicated
Supabase development project. Browser keys are public/publishable; server keys
never use a `VITE_` prefix. Hosted state uses D1 and the complete migration journal.

## Shared lobby checklist

1. Create a private room, then join from another independent browser. The new
   player must ready up; only the host can start after all required seats fill.
2. Publish in Match Making. Check the correct game variant, target, free/locked
   status and seat count. Filter by selected settings and join an available seat.
3. Race two joins for the final seat. Exactly one should succeed. Full, started,
   hidden and expired listings disappear; a host heartbeat renews only an
   existing listing. Public listings expire after two minutes without renewal.
4. Check blocks in both directions for public discovery and listed-room joins.
   A flagged gamer name must be corrected before public participation.
5. Use a room code/link directly. Invalid, full or already-started joins fail
   normally; an existing member can recover an accepted seat.
6. Verify that required unlocks apply to every participant, including when the
   host starts. Leaving remains possible if a player's entitlement changes.
7. Leave a waiting lobby and verify host reassignment. Leaving active play ends
   the match without awarding a forfeit win or restoring a successfully left seat.

## Gameplay and recovery checks

- Rummy+/Spades: private hands, legal turns, bids/melds/discards, shared table
  appearance, paced computer actions and retained completed tricks. Rummy 500
  and Classic support the documented low/high-ace runs and Call Rummy windows.
- Quintsee/Farkle/Crown & Court: everyone sees the appropriate scorecard and
  committed rolls. Holds remain adjustable in Quintsee. Farkle keeps fill
  consecutive rows, and banked target wins end immediately. Poker-rank dice
  and exact hand categories belong to Crown & Court, not the shared pip dice.
- Dominoes: drag or tap legal ends, fixed rotated pip printing, spinner arms in
  Muggins, remaining-tile counts and complete-hand reveals. Live hands stay private.
- Backgammon: opening rolls, legal maximum dice use, bar entry, hits, bearing
  off, smart hints, cube take/drop, match scoring, Crawford and Nackgammon.
- Carrom/Disc Pool: baseline placement from both rotated perspectives, real
  touch pull-back arrow/power, fine-aim and keyboard controls, cushion banking,
  glancing/head-on collisions, pocket detection, fouls and queen covers. Both
  viewers replay the same physical shot; input stays locked until it settles.
  Computer responses pause after physical replay.

Reload and reconnect during active play. Push/stream updates or polling should
recover the current private view. Simulate a reply lost after the server commits:
retry the original request ID, rather than issuing another roll/shot/purchase.
The duplicate command cannot execute twice. Reused IDs with different payloads,
stale revisions and commands from outsiders must be rejected.

For member rewards, finish a real complete match with eligible signed-in
participants. Check 15/25/35 Easy/Normal/Hard or 50 online points, one trusted
source receipt and the correct achievement statistics. Crate progress follows
its separate 6-real-win / 9-computer-win policy only for the four supported
collections. See [rewards-testing.md](rewards-testing.md).

## Automated validation

`npm test` covers both Node/SQLite and hosted D1 adapters, including race
conditions, membership, room privacy, same-ID retries and verified rewards.
`npm run build:sites` validates the publishable Worker and route checks.

Browser suites include `carrom_browser.py`, `backgammon_browser.py`,
`classic_farkle_browser.py`, `crown_court_browser.py`,
`dominoes_physical_browser.py`, `rummy_multiplayer_browser.py`,
`spades_browser.py` and public-lobby/recovery suites. Read each script's header
for its preview and any isolated helper. Newer integrated suites use loopback
ports 8811/8812; older suites accept their documented `--base-url` option.
The collectible browser suite additionally tests two-player trade consent and
Cash conservation in an isolated database. All automated identities are fictional.

Report a reproducible issue with game, mode, browser/device, steps, room code,
visible error and whether sign-in changed. Credentials, auth links, private
hands and production databases do not belong in test fixtures or reports.
