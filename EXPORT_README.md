# Cayea’s Game Clubhouse — complete project export

Published version: **34**
Source commit: `c6b7a67327659eae3aa5a41bf211a9f1c3a3e8fb`
Exported: 2026-11-05T06:11:40+00:00
Site: https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site
Farkle: https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site/games/farkle

## Included

- Complete React/TypeScript source for Faith 3, Rummy+, Spades, 3 Gems of Buddhism, and the finished Farkle game.
- All local images, painted card and tile atlases, village artwork, logos, and app icons under `public/`.
- Authoritative game services, multiplayer, rewards, Store, player profiles, achievements, tests, and configuration.
- Database schema and all Drizzle/Supabase migrations and setup scripts.
- The published Sites Worker build in `dist/server/` and matching browser build in `dist/client/`.
- Optional WordPress editable-block starter files in `wordpress-starter/`.

## Run locally

Install Node.js 24 as specified in `.nvmrc`, then run from this folder:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open http://localhost:5173. Guest games need no Supabase account. Configure member sign-in securely using `.env.example`; never put a private key in browser variables. See `README.md` for the API, storage, and authentication setup. Build with `npm run build`, then `npm start` for the production Node server.

## Farkle

The Clubhouse game uses the requested five-dice scorecard rules: three rolls, held dice, thirteen scoring categories, upper bonus, and repeat five-of-a-kind bonuses. Easy, Normal, and Hard computer opponents and two-human online tables are free. Each player at a three- or four-human table needs the permanent Party Tables unlock, costing 600 Farkle points or 462 Clubhouse Cash. Member wins earn 15/25/35 points against Easy/Normal/Hard computers, or 50 for eligible online wins. Rewards, achievements, profile balances, and point conversion are integrated. Active gameplay fits tested phone and tablet screens without scrolling.

Internal source filenames and service identifiers retain `five-dice` for compatibility. The visible game name and primary page are Farkle and `/games/farkle`.

## Hosting and data

The prebuilt Worker is the exact version-34 release. `.openai/hosting.json` retains the existing Sites identity; configure your intended hosting and database before deploying elsewhere. Runtime credentials belong in hosting settings.

This backup contains code and assets. Private credentials, production player records, live wallet balances, Git history, `node_modules`, and local databases are excluded. Existing player data remains in the hosting databases. `EXPORT_MANIFEST.json` records each included file’s SHA-256 checksum.
