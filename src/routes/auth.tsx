import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { HubNav } from "@/components/HubNav";
import { useClubhouse } from "@/lib/clubhouse";
import { authErrorMessage, emailConfirmationUrl } from "@/lib/email-confirmation";
import { configurationError, supabase } from "@/integrations/supabase/client";
import { pendingPlayerReturn } from '@/lib/player-return';

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { user, ready } = useClubhouse();
  const [returnTo] = useState(pendingPlayerReturn);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pending = useRef(false), emailInput = useRef<HTMLInputElement>(null);
  const [resendAt, setResendAt] = useState(0), [clock, setClock] = useState(Date.now());
  const resendWait = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => { const now = Date.now(); setClock(now); if (now >= resendAt) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  function beginCooldown() { const now = Date.now(); setClock(now); setResendAt(now + 60_000); }
  async function resend() {
    if (!supabase || pending.current || resendWait > 0 || !emailInput.current?.reportValidity()) return;
    pending.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: emailConfirmationUrl() } });
      if (error) throw error;
      beginCooldown();
      setNotice('If your account is waiting for confirmation, a new email has been requested. Check your spam folder and use the newest link.');
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = mode === "signup"
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: emailConfirmationUrl() } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setNotice("Check your inbox and spam folder. Open the newest confirmation email to finish signing in.");
        beginCooldown();
      } else {
        setNotice("You’re signed in. Welcome to the Clubhouse!");
      }
      setPassword("");
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <HubNav />
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="font-display text-4xl text-gold">{mode === "signup" ? "Join the Clubhouse" : "Welcome back"}</h1>
        {!ready ? <p className="mt-4" role="status">Checking your account…</p> : user ? (
          <div className="card-hub mt-6">
            <Link to="/auth/reset" className="mb-4 block text-gold underline">Reset your password</Link>
            <p>You’re signed in{user.email ? ` as ${user.email}` : ""}.</p>
            <Link to="/clubhouse" className="btn-gold mt-4 inline-block">Visit the Clubhouse</Link>
            {returnTo ? <a href={returnTo} className="btn-ghost-gold mt-4 ml-2 inline-block" onClick={() => { try { sessionStorage.removeItem('clubhouse-player-return'); } catch { /* Optional return link. */ } }}>Continue to player page or invitation</a> : <Link to="/profile" className="btn-ghost-gold mt-4 ml-2 inline-block">Set up your player profile</Link>}
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="card-hub mt-6 space-y-4">
            {!supabase && <p role="status" className="text-sm text-muted-foreground">Accounts are not connected yet. Sign-in will be available after the Clubhouse backend is configured.{configurationError ? ` ${configurationError}` : ""}</p>}
            <div>
              <label htmlFor="auth-email" className="block text-sm">Email</label>
              <input ref={emailInput} id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy || !supabase}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
            </div>
            <div>
              <label htmlFor="auth-password" className="block text-sm">Password</label>
              <input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : 1} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || !supabase}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
              {mode === "signup" && <p className="mt-1 text-xs text-muted-foreground">Use at least 8 characters.</p>}
            </div>
            <button className="btn-gold w-full" type="submit" disabled={busy || !supabase}>{busy ? "Please wait…" : mode === "signup" ? "Create a free account" : "Sign in"}</button>
            {mode === "signin" && <Link to="/auth/reset" className="block text-sm text-gold underline">Forgot your password?</Link>}
            <button className="text-sm text-gold underline" type="button" disabled={busy} onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setNotice(null); }}>
              {mode === "signup" ? "Already a member? Sign in" : "New here? Create a free account"}
            </button>
            <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">Already signed up but still waiting for the email?</p><button type="button" className="mt-2 text-sm text-gold underline" disabled={busy || !supabase || resendWait > 0} onClick={() => void resend()}>{resendWait > 0 ? `Resend in ${resendWait}s` : 'Resend confirmation email'}</button></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm">{notice}</p>}
          </form>
        )}
      </main>
    </>
  );
}
