import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { HUB_NAME, useClubhouse } from "@/lib/clubhouse";
import { supabase } from "@/integrations/supabase/client";
import { useModerationRole } from "@/lib/moderation-api";

export function HubNav() {
  const { user, ready } = useClubhouse();
  const moderation = useModerationRole(user?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="border-b border-border bg-background/95">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5">
        <Link to="/" className="font-display text-xl text-gold">{HUB_NAME}</Link>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "text-gold underline" }}>Games</Link>
          <Link to="/clubhouse" activeProps={{ className: "text-gold underline" }}>Clubhouse</Link>
          <Link to="/friends" activeProps={{ className: "text-gold underline" }}>Friends</Link>
          <Link to="/store" activeProps={{ className: "text-gold underline" }}>Store</Link>
          {moderation.role && <Link to="/moderation" activeProps={{ className: "text-gold underline" }}>Moderation</Link>}
          {ready && (user ? (
            <button className="btn-ghost-gold text-sm" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</button>
          ) : (
            <Link to="/auth" className="btn-ghost-gold text-sm">Sign in</Link>
          ))}
        </div>
      </nav>
      {error && <p className="mx-auto max-w-6xl px-4 pb-3 text-sm text-destructive" role="alert">{error}</p>}
    </header>
  );
}
