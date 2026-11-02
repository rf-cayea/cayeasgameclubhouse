import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { HubNav } from "@/components/HubNav";
import { useClubhouse } from "@/lib/clubhouse";
import { configurationError, supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { user, ready } = useClubhouse();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = mode === "signup"
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setNotice("Check your email to confirm your account, then sign in.");
      } else {
        setNotice("You’re signed in. Welcome to the Clubhouse!");
      }
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete your request. Please try again.");
    } finally {
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
            <p>You’re signed in{user.email ? ` as ${user.email}` : ""}.</p>
            <Link to="/clubhouse" className="btn-gold mt-4 inline-block">Visit the Clubhouse</Link>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="card-hub mt-6 space-y-4">
            {!supabase && <p role="status" className="text-sm text-muted-foreground">Accounts are not connected yet. Sign-in will be available after the Clubhouse backend is configured.{configurationError ? ` ${configurationError}` : ""}</p>}
            <div>
              <label htmlFor="auth-email" className="block text-sm">Email</label>
              <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy || !supabase}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
            </div>
            <div>
              <label htmlFor="auth-password" className="block text-sm">Password</label>
              <input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : 1} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || !supabase}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" />
              {mode === "signup" && <p className="mt-1 text-xs text-muted-foreground">Use at least 8 characters.</p>}
            </div>
            <button className="btn-gold w-full" type="submit" disabled={busy || !supabase}>{busy ? "Please wait…" : mode === "signup" ? "Create a free account" : "Sign in"}</button>
            <button className="text-sm text-gold underline" type="button" disabled={busy} onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setNotice(null); }}>
              {mode === "signup" ? "Already a member? Sign in" : "New here? Create a free account"}
            </button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm">{notice}</p>}
          </form>
        )}
      </main>
    </>
  );
}
