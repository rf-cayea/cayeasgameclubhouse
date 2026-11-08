Password recovery is available through “Forgot your password?” on sign-in and
“Reset password” on the player profile. Requests use Supabase Auth’s recovery
email and the running Site origin, with /auth/reset as the return path. Recovery
links returning to the Site root or /auth/confirm with type=recovery also open
the reset page. Confirmation links continue through their existing flow.

For Supabase Authentication > URL Configuration, use the live Site URL as Site
URL and allow its /auth/reset and /auth/confirm URLs (or its /** wildcard) in
Redirect URLs. A localhost Site URL or an omitted redirect can send recovery
emails to the wrong host. The email provider and recovery template must remain
enabled in Supabase; this source change does not change dashboard settings.

The reset page supports recovery token hashes, implicit recovery sessions, and
PKCE codes. It checks the user with Supabase before accepting a new password,
compares that identity again at submission, requires matching passwords of at
least eight characters, and clears credentials from the URL. Errors and expired
links offer a fresh email request. Email requests use a neutral confirmation
message and a sixty-second client resend delay; Supabase enforces its own limits.

Tests use fictional Supabase responses and send no real emails or password
updates to production accounts. Actual email delivery depends on the project's
Supabase mail service and redirect configuration.
