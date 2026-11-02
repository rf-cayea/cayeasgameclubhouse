# Connect the Clubhouse to Supabase

Project: `spjxaghfxomgafgbrnkr`

Project URL: `https://spjxaghfxomgafgbrnkr.supabase.co`

[Open the project dashboard](https://supabase.com/dashboard/project/spjxaghfxomgafgbrnkr).

## Application settings

Set these in the environment where the frontend and game server run:

```dotenv
VITE_SUPABASE_URL=https://spjxaghfxomgafgbrnkr.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-projects-public-publishable-key
```

The current cloud workspace already has a public-key binding. It still needs
to be checked against this project after network access is applied. GitHub
source uploads do not transfer environment settings to Codespaces or a live site.

Verified match rewards additionally require `CLUBHOUSE_REWARD_KEY` on the
Node game server, supplied securely using this project's secret/server key
or legacy service-role key. Keep this key out of `VITE_*`, browser code, chat,
and Git. A secret requirement has been saved in the cloud environment draft;
the value itself has not been supplied.

The draft also adds this exact Supabase hostname to the network allowlist.
Review/save the changes in environment settings and publish the environment
to apply them. Saving the draft alone does not change the running network policy.

## Check the existing database first

The live schema has not been inspected or changed. In the Supabase SQL editor,
run `supabase/inspect_project.sql` to inspect table columns, row-security flags,
and available function names. This script is read-only and does not read player
records or change balances.

For a new, empty project, apply these migrations in order:

1. `20261101000000_clubhouse_moderation_store.sql`
2. `20261101010000_verified_rewards.sql`
3. `20261101020000_spades_collection_rewards.sql`
4. `20261102000000_spades_partnership_unlock.sql`

For an existing project, compare its schema first and reconcile differences.
The first migration creates tables and should not be applied blindly over
an existing Clubhouse database.

After setup, check that the public store catalog contains:

| Item | Price | Currency |
| --- | ---: | --- |
| `rummy-jokers` | 800 | `rummy_points` |
| `spades-partnerships` | 800 | `spades_points` |

Reward credits use server-only `credit_rummy_match` and `credit_spades_match`.
Browser code cannot submit a match result to award itself points.

## Authentication

Enable the email/password provider. In **Authentication → URL Configuration**,
include your actual app address among the allowed redirect URLs:

`https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site/`

Use it as the Site URL if this is your primary live app. Preserve any other
app addresses you still use. A Codespace's forwarded address is different and
must also be allowed when testing sign-in there.

Restart/rebuild the app after changing its public environment variables.
Then check sign-in, wallet loading, a store purchase, and a verified complete
match reward. No live login, purchase, migration, or reward credit has been
verified yet in this workspace.

3 Gems' stars, boosters, and monastery restoration remain saved on the device;
they are separate from Supabase wallet balances.
