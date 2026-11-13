# Connect a new Supabase project

The hosted Clubhouse reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from
Sites environment settings. These are the project's HTTPS URL and browser-safe
publishable key. The Worker serves them to the browser at `/clubhouse-config.js`.
Local Vite development continues to support the `VITE_SUPABASE_*` names in
`.env.example`.

## Initialize the database

1. Open your new project in the Supabase dashboard, then open **SQL Editor**.
2. Download `/clubhouse-supabase-setup.sql` from your Clubhouse Site.
3. Open the downloaded file, copy its complete contents into a new query, and run
   it once. It combines the included SQL migrations in timestamp order,
   inside one transaction. It creates the profiles, zero-balance wallets, lounge,
   moderation policies, store and verified reward functions.

This script is for an empty project. An existing database needs schema review
instead of blindly re-running initial table creation. A failed query rolls back
all migrations. Existing migration source files remain unchanged.

After changing migration source, run `node scripts/prepare-supabase-setup.mjs`
to regenerate the downloadable script.

## Authentication

In **Authentication → URL Configuration**, use these production settings:

- **Site URL:** `https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site`
- **Redirect URLs:** allow both `https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site/auth/confirm` and `https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site/auth/reset`

Enable the Email provider and keep email confirmation enabled. The app supplies
the confirmation redirect for sign-up and resend requests. In the **Confirm
signup** email template, keep the confirmation link set to
`{{ .ConfirmationURL }}` so Supabase verifies the link before returning to the
Clubhouse. After changing URL settings, request a fresh email from the sign-in
page and use its newest link. Previously issued emails keep their old URLs.

The `/auth/confirm` page completes the return, checks the member with Supabase,
and removes tokens and codes from the address bar. Expired links show a return
to sign-in, where **Resend confirmation email** works without a password. A
60-second resend cooldown avoids accidental repeat requests. Profiles and
wallets initialize automatically; new wallets start at zero.

If no email arrives, check **Authentication → Logs** and your spam folder.
Supabase's default email sender only sends to project-team addresses and is
currently limited to two emails per hour. To send confirmation emails to other
members, configure a production email provider under **Authentication → Email
→ SMTP Settings**, verify its sending domain, and enter its SMTP credentials
privately in Supabase. See the [official SMTP setup and default sender
limits](https://supabase.com/docs/guides/auth/auth-smtp). The site cannot change
those dashboard settings; its public or server Supabase API keys do not
configure SMTP. A sending-limit or unauthorized-address error is shown in the
app without claiming the email was delivered.

## Trusted match rewards

Verified Rummy and Spades wins are credited to the member's game wallet in D1 by
the game server itself, so **no reward credential is needed or awaited**. A win
settles as soon as it is verified, and a delivery that fails or is interrupted is
retried from the durable outbox with backoff; a failed retry is logged with its
match id and error code so a stuck win is visible instead of silent. Current
balances, receipts and allowances live in the game database; see
[SITES_HOSTING.md](SITES_HOSTING.md).

A server secret (`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, with
`CLUBHOUSE_REWARD_KEY` accepted as a legacy alias) is **optional** and only used
for the older Supabase-side sync: mirroring a changed lounge display name into
`profiles`, and settling cash allowances the trusted database already authorized.
If you rely on either, store it as a Site secret and redeploy the saved version
after environment changes. Keep it out of chat, browser code, source files and
every public environment variable.

The optional first moderation role is assigned by a trusted administrator using
the `clubhouse_staff` table defined in the moderation migration; sign-up does not grant staff privileges.

## Current game database

The current wallets, profiles/friends, authoritative rooms, achievements, crates,
card albums and trades use Sites D1, or SQLite for local development. Existing
Supabase wallets are imported once; the current balance then belongs to the game
economy. Deploy the complete `drizzle/` journal with the Worker. The new
collectible and Carrom tables are D1 migrations, not an extra Supabase SQL step.
See [SITES_HOSTING.md](SITES_HOSTING.md).
