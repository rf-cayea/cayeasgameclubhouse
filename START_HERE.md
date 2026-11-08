# Play Cayea's Game Clubhouse

## The free public website

This is the free option: a **Render free web service** that builds the app and
runs the Node card-game server from one HTTPS address, so guest tables, online
rooms, and push updates all work. It needs no card, and the free plan includes
750 instance hours a month.

1. Sign in to GitHub and open
   <https://github.com/rf-cayea/cayeasgameclubhouse/tree/clubhouse-ready-to-run>.
2. At <https://render.com>, choose **New → Blueprint**, connect GitHub, select
   this repository, and apply. Grant Render access to the repository if it asks;
   that is required while the repository is private. The settings in
   `render.yaml` are read automatically.
3. Wait for the first build, then open the `https://…onrender.com` address Render
   shows for the service. That address is your public game site.

The free service sleeps after 15 minutes with no visitors and takes about a
minute to wake on the next visit. Open card tables are live sessions rather than
saved games, so a restart clears them.

### Add free accounts, wallets, and the store

Guest play needs nothing else. Sign-in, points, purchases, the lounge,
moderation, and match rewards need a free Supabase project; the blueprint asks
for its two public values, and [SUPABASE_SETUP.md](SUPABASE_SETUP.md) walks
through creating it, running the SQL, allowing your live address, and redeploying.
Account data lives in Supabase, so it survives restarts and redeploys; only open
tables are lost.

## A free private dev environment (GitHub Codespaces)

1. Open the repository branch above while signed in to GitHub.
2. Choose **Code → Codespaces → Create codespace** on the `clubhouse-ready-to-run`
   branch. GitHub installs the project and starts the games.
3. The Clubhouse should open automatically. If it does not, open the **Ports**
   tab and use **Open in Browser** beside port **5173**.

This runs the actual project, including the card-game server, at an address
GitHub gives you. Codespaces availability and usage limits depend on your GitHub
account. Stop the Codespace when finished. If you restart it, the project starts
again automatically; to start it by hand, run `node .devcontainer/start.mjs`.

GitHub opens Codespace ports privately by default. For other people to join a
table, they need access to its app address; you control port visibility in the
**Ports** tab.

## Get the ZIP

Download <https://github.com/rf-cayea/cayeasgameclubhouse/archive/refs/heads/clubhouse-ready-to-run.zip>
or open the branch above and choose **Code → Download ZIP**. These are ordinary
GitHub files rather than chat preview links. Sign in with the account that has
access to the repository.

## Play on your own computer

Install Node.js 24, extract the ZIP, open a terminal in the project folder, and run:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open the address printed by Vite on that computer.

## What works immediately

- **3 Gems of Buddhism:** 150 levels, earned boosters, and monastery restoration; saves in this browser.
- **Faith 3:** 280 practice levels.
- **Rummy+:** computer, same-device, and private online tables.
- **Spades:** free Solo against computers or in private online rooms.

Sign-in, point wallets, reward credits, moderation, and the permanent 800-point
Spades partnership unlock require the Supabase configuration above. See
`.env.example` and `README.md`; keep server keys in environment settings.

## Lovable

These files have not been published through Lovable. The card games require the
included Node API as well as the web frontend; a static frontend upload alone
does not run multiplayer. The free Render service above runs both parts.
