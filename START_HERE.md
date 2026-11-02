# Play Cayea's Game Clubhouse

## Open it in your browser

1. Open https://github.com/rf-cayea/cayeasgameclubhouse/tree/clubhouse-ready-to-run while signed into your GitHub account.
2. Choose **Code → Codespaces → Create codespace** on the `clubhouse-ready-to-run` branch. GitHub installs the project and starts the games.
3. The Clubhouse should open automatically. If it does not, open the **Ports** tab and use **Open in Browser** beside port **5173**.

This runs the actual project, including the card-game server. Your Codespace's
app address is provided by GitHub after creation. Codespaces availability and
usage limits depend on your GitHub account. Stop the Codespace when finished.

If you restart the Codespace, it starts the project again automatically.
To start it manually from its terminal, run:

```sh
node .devcontainer/start.mjs
```

## Get the ZIP

Download https://github.com/rf-cayea/cayeasgameclubhouse/archive/refs/heads/clubhouse-ready-to-run.zip
or open the project branch above and choose **Code → Download ZIP**. These are ordinary GitHub files, rather than chat
preview links. Sign in with the account that has access to the repository.

## Play on your own computer

Install Node.js 24, extract the ZIP, open a terminal in the project folder, and run:

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

Open the address printed by Vite on that computer.

## What works immediately

- **3 Gems of Buddhism:** 150 levels, earned boosters, and monastery restoration; saves on your browser/device.
- **Faith 3:** 280 practice levels.
- **Rummy+:** computer, same-device, and private online tables.
- **Spades:** free Solo against computers or in private online rooms.

Sign-in, point wallets, reward credits, moderation, and the permanent
800-point Spades partnership unlock require your Supabase configuration.
See `.env.example` and `README.md`. Put server keys in environment settings,
as described there.

GitHub opens Codespace ports privately by default. For other people to join a
table, they need access to its app address. You control port visibility in
GitHub's **Ports** tab.

## Lovable

These files have not been published through Lovable. The card games require
the included Node API as well as the web frontend; a static frontend upload
alone does not run multiplayer. The browser launch above runs both parts.
