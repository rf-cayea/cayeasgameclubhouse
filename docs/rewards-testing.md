# Current rewards, collections and accounting

The Node and Worker adapters share `EconomyStore`, `CollectiblesStore` and
`PuzzleRewardStore`. Current accounts use the game database (SQLite locally,
D1 on Sites), with Supabase authentication and one-time legacy wallet imports.
All D1 migrations in `drizzle/` ship together; they are not Supabase SQL.

## Reward schedule

- Table-game wins: **15 Easy, 25 Normal, 35 Hard, 50 eligible online**.
- Faith 3 first clears: **12–45 points**. Gems first clears: **10–50 points**
  plus one restoration star. Replays do not repeat first-clear rewards.
- Six point balances: Faith 3, Gems, Rummy+, Spades, Dominoes and shared Dice.
  Quintsee, Farkle, Crown & Court, Backgammon and Carrom / Disc Pool use Dice.
- Conversion: **13 game points → 10 Cash**, in multiples of 13. Store Cash
  prices round up from the normal point price. Lifetime earnings are preserved.
- Game badges award catalog points plus `max(2, floor(points / 13))` Cash.
  Membership badges have their own modest Cash rewards. Old paid receipts stay
  valid. New room results, achievement claims and conversions are idempotent.

Each of four crate collections requires **6 signed-in real-player wins** or
**9 computer wins**: Dice (Quintsee/Farkle), Dominoes, shared decks (Rummy+/Spades)
and Backgammon (including Nackgammon). Computer crates give **3–20 Cash**;
real-player crates **28–65 Cash**. Each adds one fragment; three matching
fragments complete a set. Store fragments cost `ceil(set price / 3)` each in
points or Cash. Legacy progress/receipts and existing ownership are preserved.

Harvest & Hearth has 100 picture cards (38/26/20/16 by 1–4 stars; 45 fall and
55 winter). Three-card booster prices are 20/40/75/125 Cash. Packs have a 44%
chance of one missing card when both outcomes are possible. Duplicate sales cost
5/10/20/40 Cash; same-rarity duplicate swaps and fixed-price sales require both
players' consent. Offers escrow duplicates; the first copy remains owned.
The complete album pays a one-time 1,000 Cash jackpot.

Every second opened crate gives a common/uncommon booster, every third a rare,
and every fifth has a 25% ultra chance, guaranteed at the fourth failed-checkpoint
cycle after three misses. Milestones stack globally across crate collections.
Selected claimed achievements award cards/packs once. See the album Guide for
slot rarity weights and the exact claimed-achievement bonus map in
`src/lib/collectibles.ts`.

## API contracts

- `GET /api/economy`: own balances, achievement/progress data and recent receipts.
- `GET /api/economy/catalog`: public fixed prices and equipment slots.
- `POST /api/economy`: conversion, achievement claim, purchase, equip, check-in,
  reward-crate opening and fragment purchases. The server chooses price/loot.
- `GET /api/economy/players/<UUID>`: safe earned-badge/statistics projection.
- `POST /api/puzzles`: owner-bound issued runs and legal-move replay proofs.
- `GET /api/collectibles`: own album, packs, crate milestones and offers.
- `POST /api/collectibles`: buy/open booster, claim jackpot, offer/accept/cancel/
  decline trade. Pack IDs and request IDs make uncertain retries safe.

Clients cannot submit trusted rewards, loot, arbitrary balances or another
owner ID. Revision-guarded batches conserve balances and ownership under
concurrent opens, trades and purchases. One-time tester allowances are trusted
DB records bound to immutable user IDs; no browser command creates them.

## Validation

Run `npm test` and `npm run build:sites`. Focused suites include
`collectibles.test.ts`, `carrom-server.test.ts`, `dice-crates.test.ts`,
`shared-reward-crates.test.ts`, `economy-http.test.ts` and the fragment-shop suites.
Browser scripts document the required local preview/helpers. Examples:
`collectibles_browser.py` checks real isolated purchases/trades, reveal/audio,
missing-card filters, mobile fit and lost replies; `carrom_browser.py` checks
real touch placement/shots, bank/collision playback, online perspectives and
same-ID recovery. Other economy scripts use explicitly fictional Auth and
wallet fixtures. Automated tests never seed or spend a production balance.
