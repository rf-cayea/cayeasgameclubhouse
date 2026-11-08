# Connect a new Supabase project

The hosted Clubhouse reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from
Sites environment settings. These are the project's HTTPS URL and browser-safe
publishable key. The Worker serves them to the browser at `/clubhouse-config.js`.
Local Vite development continues to support the `VITE_SUPABASE_*` names in
`.env.example`.

## Initialize the database

1. Open your new project in the Supabase dashboard, then open **SQL Editor**.
2. Download `/clubhouse-supabase-setup.sql` from your private Clubhouse Site.
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
- **Redirect URLs:** `https://cayeas-game-clubhouse.r-f-cayea.chatgpt.site/auth/confirm`

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

Configure `CLUBHOUSE_REWARD_KEY` as a **secret** in the Site's environment settings,
using the server secret/service-role credential for the same Supabase project.
Redeploy the saved Site version after environment changes. Keep this credential
out of chat, browser code, source files and every public environment variable.
Without it, sign-in and member features can use the public connection settings,
but verified Rummy and Spades reward delivery waits in the durable outbox.

The optional first moderation role is assigned by a trusted administrator using
the SQL described in README.md; sign-up does not grant staff privileges.
