# Points, Cash and achievements

The Node and Worker adapters share `EconomyStore` and `PuzzleRewardStore`.
Run `npm test` for real SQLite/D1 accounting, HTTP authorization, replay proofs,
concurrency, import preservation, unique claims, owned equipment and receipts.
`npm run build:sites` checks generated files and builds the production Worker.
The deployment includes Drizzle migration0004; do not paste it into Supabase.

For browser QA, start the normal Vite/API preview on5173, plus a fictional Auth
configuration on5174 (all Auth calls are intercepted by the tests):

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
VITE_SUPABASE_URL=https://clubhouse.test.invalid VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npx vite --host 127.0.0.1 --port 5174 --strictPort
```

In another terminal:

```sh
python3 tests/pricing_browser.py
python3 tests/economy_browser.py --base-url http://127.0.0.1:5174
python3 tests/reward_wallet_browser.py --base-url http://127.0.0.1:5174
python3 tests/puzzle_browser.py
python3 tests/game_viewports_browser.py --base-url http://127.0.0.1:5173
```

The first two browser suites use intercepted economy fixtures for rejection,
timeout-after-commit, account changes, cross-tab notifications and store controls.
`puzzle_browser.py` starts its own in-memory API on8788, forwards puzzle/economy
requests to the actual Node service, and intercepts only fictional Supabase Auth.
It clicks a full Faith3 clear, claims the verified badge, plays an issued Gems
board, converts its points to Cash, and checks the saved profile. It shuts down
its own API afterwards. Use separate test accounts for manual production testing.

Member API contracts:

- `GET /api/economy`: own wallet, achievement progress, game progress and50 recent
  receipts. `GET /api/economy/catalog` is a public fixed-price catalog.
- `POST /api/economy`: `convert`, `claim_achievement`, `purchase`, `equip` or
  `check_in`. The actor is verified from the bearer token. Conversion requests
  require a UUID reused for uncertain retries; amount must be a positive multiple
  of13 within that game's balance. Price and achievement rewards are server-chosen. Purchase `payment` is
  `game` or `cash`; the catalog provides both `price` and `cashPrice`.
- `GET /api/economy/players/<UUID>`: member-visible safe earned-badge projection.
  It does not expose wallet balances, ownership, ledger sources, or purchases.
- `POST /api/puzzles`: `start` issues the board/run; `complete` supplies the
  owner-bound run ID and ordered action transcript. Scores, won flags, reward
  amounts, extra boosters and caller-selected owner IDs are never trusted.

Never seed a live wallet for automation. Keep production keys out of tests,
logs and screenshots. Supabase imports use stable before/after wallet reads around
paginated award reads; REST/RLS failures leave migration uncommitted for retry.

Pricing policy:1Cash=1.3points, with13→10 exact conversion blocks and storeCash
prices rounded up. Artist decks are300points/231Cash; both premiumgame modes are
400points/308Cash. Game achievements pay their points plus a Cash bonus, while
Clubhouse achievements pay Cash directly. Previously claimed game badges get
one catch-up Cash payment; duplicate and competing reads cannot pay it twice.
Old pending conversions preserve their original receipt amount. Browser tests
use no real balances or identities.

One-time tester allowances are trusted database records, bound to immutable
account IDs. The server imports an existing wallet before applying the requested
Cash total. The adjustment and its unique receipt commit together; future
refreshes never reset the balance again. Allowances leave game points, lifetime
earnings, and collections intact. No browser command can create an allowance.
