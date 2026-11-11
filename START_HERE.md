# Play Cayea’s Game Clubhouse

## Play the published site

**https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site**

No download is needed. [About & Player Guide](https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site/about)
explains all ten game entries, reward crates, collectible cards, the Store and
online play. Guest practice is available; sign in before starting a reward game.

Available now: Carrom & Disc Pool, Backgammon/Nackgammon, Crown & Court,
Farkle, Dominoes, Quintsee, Faith 3, 3 Gems of Buddhism, Rummy+ and Spades.
Faith 3 has 280 levels. 3 Gems has 200 levels and monastery repairs.
Harvest & Hearth adds 100 original collectible picture cards.

## Open the complete project in GitHub Codespaces

1. Open https://github.com/rf-cayea/cayeasgameclubhouse/tree/clubhouse-ready-to-run.
2. Choose **Code → Codespaces → Create codespace** on `clubhouse-ready-to-run`.
3. The project installs and starts the frontend plus the game API. Open forwarded
   port **5173** if the browser does not open automatically.

To restart manually:

```sh
node .devcontainer/start.mjs
```

Codespaces port access and usage limits belong to your GitHub account. Other
players need access to the forwarded app address to join its local tables.

## Run a local copy

Download the branch from GitHub with **Code → Download ZIP**, or use:
https://github.com/rf-cayea/cayeasgameclubhouse/archive/refs/heads/clubhouse-ready-to-run.zip

Install Node.js 24, open a terminal in the extracted project and run:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open the Vite address printed in that terminal. This starts the full app and
Node/SQLite game API. Configure `.env.local` from `.env.example` and follow
[SUPABASE_SETUP.md](SUPABASE_SETUP.md) to enable members and the moderated lounge
in your copy. The published site's accounts/data are not included in the ZIP.

## Where to find things

- **Games:** all ten entries and their Help panels.
- **Match Making:** public online tables; private room codes/links also work.
- **Rewards & Cash:** achievements, six point balances, Cash conversion and crates.
- **Collectibles:** Harvest & Hearth album, boosters, duplicate offers and jackpot.
- **Store:** category navigation, sets, fragments, boosters, unlocks and equipment.
- **My profile / Friends / Clubhouse:** gamer identity, friends and the moderated lounge.

Read [README.md](README.md) for the current rules, reward schedule, prices and
architecture. [SITES_HOSTING.md](SITES_HOSTING.md) covers the live deployment.
A static-only upload, including GitHub Pages alone, does not provide the
required game API or persistent multiplayer.
