import { ClubhouseLogo } from "./ClubhouseLogo";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { HUB_NAME, useClubhouseAccount } from "@/lib/clubhouse";
import { supabase } from "@/integrations/supabase/client";
import { useModerationRole } from "@/lib/moderation-api";
import { useSocialResource } from '@/lib/social';
import type { FriendsView, InvitesView } from '@/lib/social-protocol';

export function HubNav() {
  const { user, ready } = useClubhouseAccount();
  const moderation = useModerationRole(user?.id);
  const friends = useSocialResource<FriendsView>('/api/social/friends', user?.id ?? null), invitations = useSocialResource<InvitesView>('/api/social/invites', user?.id ?? null);
  const pendingFriends = (friends.data?.incoming.length ?? 0) + (invitations.data?.incoming.filter(invite => invite.status === 'pending' && invite.available).length ?? 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="hub-neon-nav" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
      <nav aria-label="Main navigation" className="hub-neon-nav-inner">
        <Link to="/" className="clubhouse-nav-brand font-display text-xl text-gold"><ClubhouseLogo decorative/><span><small>CARD GURU III GAMES</small>{HUB_NAME}</span></Link>
        <button ref={menuButton} type="button" className="hub-menu-toggle" aria-expanded={menuOpen} aria-controls="clubhouse-main-links" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? 'Close ✕' : 'Menu ☰'}</button>
        <div id="clubhouse-main-links" className="hub-neon-nav-links" data-open={menuOpen} onClick={event => { if ((event.target as HTMLElement).closest('a, button')) setMenuOpen(false); }}>
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "text-gold underline" }}>Games</Link>
          <Link to="/about" activeProps={{ className: "text-gold underline" }}>About</Link>
          <Link to="/clubhouse" activeProps={{ className: "text-gold underline" }}>Clubhouse</Link>
          {user && <Link to="/profile" activeProps={{ className: "text-gold underline" }}>My profile</Link>}
          <Link to="/friends" activeProps={{ className: "text-gold underline" }}>Friends{pendingFriends > 0 && <span className="ml-1 rounded-full bg-gold px-1.5 text-xs text-background" aria-label={`${pendingFriends} new requests or invitations`}>{pendingFriends}</span>}</Link>
          <Link to="/rewards" activeProps={{ className: "text-gold underline" }}>Rewards & Cash</Link>
          <Link to="/collectibles" activeProps={{ className: "text-gold underline" }}>Collectibles</Link>
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
