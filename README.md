# Cayea’s Game Clubhouse

Play the current site: **https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site**.
The [About & Player Guide](https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site/about)
explains the games, rewards, collections, multiplayer and account features.

This repository contains the complete React / TypeScript / Vite app, original
artwork, Node/SQLite game service, Cloudflare Worker/D1 deployment, migrations
and tests. Supabase provides member authentication and the moderated lounge.
The current wallets, profiles, friends, game state, verified rewards and
collectible-card albums live in the Clubhouse game database.

## Games available now

| Game | Rules and features | Opponents |
| --- | --- | --- |
| Carrom & Disc Pool | Movable baseline striker, touch pull-back aiming arrow, light-to-hard power, first-contact and bank guides, deterministic collisions and cushion rebounds. Carrom has queen-and-cover rules; Disc Pool is a nine-disc color race. | Easy / Normal / Hard computer; two-player online |
| Backgammon | Standard or Nackgammon; 1/3/5/7/9-point matches, smart legal moves, doubling cube, gammons, backgammons and Crawford rule | Three computer difficulties; two-player online |
| Crown & Court | Cayea’s original five poker-dice game, faces 9/10/J/Q/K/A; exact poker hands, Court Tally and Royal Trials; 7/14/21 turns | Three computer difficulties; free online tables for 2–4 |
| Farkle | Six pip dice; smart scoring, hot dice, 300-point opening; Classic 10,000 or Fast 5,000; first to bank the target wins immediately | Three computer difficulties; two-player online; separate Party unlock for 3–4 |
| Clubhouse Dominoes | Draw, Block or Muggins; highest-double opening, physical chains/spinner branches, drag-and-drop, opponent tile counts and revealed hand results | Three computer difficulties; two-player online |
| Quintsee | Five pip dice, three rolls, freely adjustable holds, 13-category scorecard including small/large straights, five-of-a-kind celebration | Three computer difficulties; two-player online; separate Party unlock for 3–4 |
| Faith 3 Tile Match | 280 levels, layered portrait tiles, belief-themed artwork, increasing obstacles, 80 mahjong-style bonus layouts and collectible skins | Solo puzzle |
| 3 Gems of Buddhism | 200 match-three levels, mixed specials, visible effects and boosters; 50 levels per monastery and 50 restoration-star repairs | Solo puzzle |
| Rummy+ | Classic, Gin and Rummy 500; legal ace runs, meld ownership, Call Rummy, smart sorting, drag-and-drop and optional Joker Mode | Computers, same-device play and private online tables |
| Spades | Four-seat Solo or Partnerships, bids, private hands, paced computer plays, drag-to-play and explicit trick collection | Computers or online; Partnerships requires its unlock |

All eight multiplayer game entries have a **Match Making** button. Public
listings are opt-in; private rooms stay private until listed. Players join,
ready up, and the host starts. Room codes and shareable table links support
private invitations. The signed-in Friends page also provides direct in-app
invitations for Rummy+ and Spades. See [multiplayer testing](docs/multiplayer-testing.md).

Game boards fit phone/tablet viewports; rules, history, artwork and collection
panels open separately. Core Carrom physics and server validation are shared by
both players. The server locks the next shot until the discs settle; computers
pause before replying. Interrupted commands retry their original request ID.

## Points, Clubhouse Cash and achievements

- Eligible full-match wins pay **15 Easy / 25 Normal / 35 Hard / 50 online**.
  Online rewards require the eligible signed-in human participants. Guest,
  abandoned, pass-and-play and unverified results do not pay win rewards.
- Faith 3 verified first clears pay **12–45 Faith 3 points**. 3 Gems first clears
  pay **10–50 Gems points** and one restoration star. Replays do not repeat
  first-clear rewards; Gems replays can improve saved star ratings.
- There are six game-point balances. Quintsee, Farkle, Crown & Court,
  Backgammon and Carrom / Disc Pool share **Dice points**. The other balances
  are Faith 3, Gems, Rummy+, Spades and Dominoes.
- Convert **13 game points → 10 Clubhouse Cash**, in multiples of 13. Cash has
  30% more purchasing power per unit. Conversion and spending preserve lifetime
  earnings. Cash is an in-game currency, with no withdrawal or monetary value.
- All ten game entries plus membership have achievements. Each table-game
  entry has 12 win, Hard-computer and online milestones. Claim rewards in
  Rewards & Cash; earned badges appear on player profiles. Game achievements
  give points plus `max(2, floor(points / 13))` Cash. Membership has its own
  modest Cash rewards. The catalog is authoritative for current amounts.
- Selected claimed achievements also award Harvest & Hearth cards or boosters.
  Previously claimed eligible achievements receive their card bonus once when
  the album opens. No achievement or reward retry can pay twice.

The implementation lives in `src/lib/reward-rates.ts`,
`src/lib/achievement-catalog.ts`, `server/economy.ts` and `server/puzzle-rewards.ts`.
See [rewards and accounting](docs/rewards-testing.md).

## Reward crates and fragments — current policy

| Collection | Win progress comes from | Fragment unlocks |
| --- | --- | --- |
| Shared D6 dice | Quintsee + Farkle | Shared pip-dice finishes |
| Dominoes | Draw / Block / Muggins | Domino sets |
| Shared playing decks | Rummy+ + Spades | Shared 52-card decks |
| Backgammon | Standard + Nackgammon | Boards or checker sets |

Each collection awards one crate per **6 verified real-player wins** or
**9 computer wins**. A computer crate gives **3–20 Cash**; a real-player crate
**28–65 Cash**. Every crate also gives one fragment. **Three matching fragments**
unlock the complete set. Losses and ties do not advance crates. Existing crates,
fragments, ownership and credited rewards remain valid.

Open crates from a game's Rewards panel or Rewards & Cash. Openings have an
animation, synthesized sounds, a saved mute setting and reduced-motion support.
An interrupted opening retries the same crate. Store → Fragments sells one or
the remaining fragments, each at `ceil(set price / 3)` in points or Cash.

## Cayea’s Collectibles — Harvest & Hearth

The permanent first album contains **100 original illustrated cards**:
**45 fall/Thanksgiving and 55 winter/holiday** paintings.

| Stars | Rarity | Cards | Booster price | Duplicate-sale price |
| --- | --- | --- | --- | --- |
| 1 | Common | 38 | 25 Cash | 5 Cash |
| 2 | Uncommon | 26 | 50 Cash | 10 Cash |
| 3 | Rare | 20 | 94 Cash | 20 Cash |
| 4 | Ultra-rare | 16 | 157 Cash | 40 Cash |

Each booster contains three cards. Its first card meets or exceeds the pack
tier; two additional slots can have any rarity. A pack has a **44% chance to contain one missing card**.
If the guaranteed slot has no eligible duplicate, it awards a new card.
Full albums receive duplicates.

Across all reward-crate collections, every **second opened crate** gives a common
or uncommon booster (75% / 25%), every **third** also gives a rare booster, and
every **fifth** has a 25% ultra-rare-booster chance. After three missed ultra
checkpoints the fourth is guaranteed. Overlapping milestones stack. Selected
claimed achievements give individual cards or boosters too.

Use Collectibles → Boosters for the foil-tear animation, staggered card reveals
and rarity chimes; sound can be muted and reduced motion is supported. Store →
Card boosters sells all four tiers. View the last opening again after a reload.

Only duplicates can be offered directly to another gamer name. Both players
confirm a fixed-price Cash sale or a swap of different cards of the same
rarity. The first copy stays in the album. Offers escrow the duplicate until
accepted, declined or cancelled; Cash transfers between player wallets.
Complete all 100 cards to claim a **one-time 1,000 Cash jackpot**.

`server/collectibles.ts` validates ownership, consent, blocks and balances and
commits both sides atomically. `drizzle/0018_cayea_collectibles.sql` is additive.
Original paintings are local assets; [artwork notes](art/README.md) document
atlas panels and deployment encodings.

## Crown & Chance

An original game by Richard Cayea. Roll six poker dice and bank scoring hands or
risk another roll. The first bank in every mode requires a pair or better.
Play Fast (4,000 points), Long (12,000 points), or solo Score Attack (ten turns).
Play solo, pass-and-play, against a computer, or by private online table code.
The current multiplayer round finishes after a player reaches the target.
Tied leaders play additional rounds until the tie breaks.

Crown & Court and Crown & Chance share the Poker dice Store collection and
equipment slot. Each set shows the same six ranks, with cosmetic Ace suits
and deck-themed artwork. Account achievements track each game separately.
Verified wins in either game count toward the same poker dice crate milestones.

## Store and customization

Paid prices increased by 25%, with fractional prices rounded up to whole units.

The Store has categories for Card boosters, Fragments, Carrom, Backgammon, Tables,
Decks, Shared D6 dice, Dominoes, Faith 3, Game modes, Frames and Wallet.

- Shared 52-card decks: **563 Rummy+ or Spades points / 434 Cash** each. Buy once
  for compatible games, equip independently. Includes 52 cards and two optional
  jokers; Rummy+ Joker Mode remains a separate unlock.
- Paid Rummy+/Spades table surfaces: **125 game points / 97 Cash** each.
  Retired room-background products are no longer offered.
- Joker Mode and Spades Partnerships: **500 matching-game points / 385 Cash**.
- Quintsee Party and Farkle Party: **750 Dice points / 578 Cash each**, separate
  purchases. Every human at a 3–4-player table needs that game's Party unlock.
- Shared D6 and Dominoes jewel colors: **188 matching points / 145 Cash**.
  Decorated, skull, sunburst and nautical designs: **313 points / 242 Cash**.
  Four-set nautical bundles cost **1,000 points / 770 Cash** per collection.
  Dice and domino ownership are separate; D6 dice work in compatible pip-dice
  games, including Backgammon. Crown & Court uses separate poker-rank dice.
- Backgammon boards: **375 Dice points / 289 Cash**; checker sets:
  **188 points / 145 Cash**. Twenty paid board and twenty checker themes are available,
  alongside included classic designs; equip each slot independently.
- Custom-image circle, diamond, square and portrait frames are **four separate
  purchases of 125 points / 97 Cash each**. Upload the image on My profile.
- Faith 3 skins cost **375, 563 or 750 Cash**. Equipping changes artwork only.

Carrom and Disc Pool share a collection of boards, pip-free puck sets and strikers, plus a reward crate with one design fragment per opening. Equip each piece independently. The nine table games have an optional four-track instrumental loop with crossfades.

Owned designs are selectable before a match and in each game's collection
controls. The Store retains Equip/Use after purchase. The server catalog,
not a browser price, determines every debit. See [shared card decks](docs/shared-card-decks.md).

## 3 Gems monastery journey

The 200-level journey has four monasteries inspired by Sri Lankan Theravada,
Chinese Mahayana, Tibetan Vajrayana and Japanese Zen (within Mahayana). First
clears earn restoration stars for 50 repairs, with before/after scenes and
repair animation. Villages, resource production, NPC missions and worker
purchases are retired. Existing earned stars and completed repairs stay saved.

Story milestones introduce Buddha, Dharma and Sangha, including monks, nuns and
lay practitioners. Quotations use Bhikkhu Sujato's CC0 translations and retain
references. See [monastery sources](docs/monastery-sources.md).

## Accounts, profiles and moderation

A member can choose a unique gamer name, bio and emblem/custom-image shape.
Standalone player pages show earned badges and safe statistics; private
wallets and transaction history stay in account views. Friends, blocks,
verified friend activity and room invitations use authenticated member APIs.

The Supabase lounge provides posts/chat, reports and staff moderation with
audit records. Staff actions are checked on the server/database; sign-up does
not grant a moderation role. Membership, email confirmation and password
recovery use the configured Supabase project. See [Supabase setup](SUPABASE_SETUP.md)
and [password recovery](docs/password-reset.md).

## Run locally or in Codespaces

Use Node **24.19.0** (`.nvmrc`) and npm:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

This starts Vite on 5173 and the authoritative API on 8787, using
`.data/rummy.sqlite`. Vite proxies all game, puzzle, economy, collectible and
social routes so cookies remain on one origin. Copy `.env.example` to
`.env.local` for optional member settings. Guest play does not need Supabase.

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm start` serves the production frontend plus API after `npm run build`.
`npm run preview` previews the frontend; keep the API running separately.
For one-click Codespaces setup or ZIP access, see [START_HERE.md](START_HERE.md).
GitHub Pages alone does not run this app's game API or persistent multiplayer.

## Sites deployment and validation

```sh
npm run build:sites
```

The standalone Worker is `dist/server/index.js`. Package it with
`.openai/hosting.json` and the full `drizzle/` migration journal. The Sites
project ID and D1 binding in the manifest belong to the existing live site;
use your own hosting project configuration when deploying a separate copy.
See [SITES_HOSTING.md](SITES_HOSTING.md).

The test suite covers game rules, exact scoring, private hands, deterministic
Carrom collisions, queen cover/fouls, complete computer games, room concurrency,
public lobbies, request retries, accounting and collectible trades on SQLite
and D1. Browser suites use loopback servers and fictional identities, including
real touch input, shared online replays, viewport fit, audio/mute and lost-reply
recovery. Run each browser script with the preview/helper documented in it.

Current source is maintained on GitHub's `clubhouse-ready-to-run` branch. The
repository is the complete project; the live Sites URL above is the playable
service. Local generated data, credentials, dependencies and deployment output
are excluded from source control.
