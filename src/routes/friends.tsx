import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { HubNav } from '@/components/HubNav';
import { PlayerProfileCard, SocialFeedback, SocialSignIn } from '@/components/PlayerProfileCard';
import { GameInvitations } from '@/components/FriendInvitePanel';
import { useClubhouse } from '@/lib/clubhouse';
import { useSocialAction, useSocialResource } from '@/lib/social';
import type { FriendsView, PlayerProfile } from '@/lib/social-protocol';

export const Route = createFileRoute('/friends')({ head: () => ({ meta: [{ title: "Friends & invitations — Cayea's Game Clubhouse" }] }), component: FriendsPage });
function FriendsPage() {
  const { user, ready } = useClubhouse();
  return <><HubNav/><main className="social-shell"><div className="social-heading"><div><p className="social-eyebrow">GOOD GAMES. FAMILIAR FACES.</p><h1>Friends & invitations</h1><p>Find players by gamer name, connect, and take a seat together.</p></div><Link to="/profile" className="btn-ghost-gold">My player profile</Link></div>{!ready ? <p role="status">Checking your account…</p> : !user ? <SocialSignIn/> : <FriendsMember key={user.id} userId={user.id}/>}</main></>;
}
function FriendsMember({ userId }: { userId: string }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const list = useSocialResource<FriendsView>('/api/social/friends', userId), results = useSocialResource<{ players: PlayerProfile[] }>(search ? `/api/social/players?q=${encodeURIComponent(search)}` : null, userId, false), action = useSocialAction(userId);
  function find(event: FormEvent) { event.preventDefault(); if (query.trim().length >= 2) setSearch(query.trim()); }
  return <div className="social-section-stack"><section className="card-hub"><h2 className="font-display text-2xl text-gold">Find a player</h2><form className="social-search" onSubmit={find}><label htmlFor="friend-search">Gamer name<input id="friend-search" value={query} onChange={event => setQuery(event.target.value)} minLength={2} maxLength={24} pattern="[A-Za-z0-9_]{2,24}" placeholder="At least 2 letters" autoComplete="off"/></label><button className="btn-gold" disabled={results.loading || query.trim().length < 2}>Find players</button></form>{search && <><p className="social-subtle">Results for “{search}”</p>{results.error ? <p role="alert" className="social-error">{results.error}</p> : !results.data ? <p role="status">Searching…</p> : results.data.players.length ? <div className="social-player-list">{results.data.players.map(player => <PlayerProfileCard key={player.userId} player={player} action={action}/>)}</div> : <p>No matching players. Ask your friend for their gamer name.</p>}</>}</section>
    <section className="card-hub"><div className="social-heading"><h2 className="font-display text-2xl text-gold">Your connections</h2><button className="btn-ghost-gold" disabled={list.loading} onClick={() => void list.refresh()}>Refresh friends</button></div>{list.error && <p role="alert" className="social-error">{list.error}</p>}{!list.data ? <p role="status">Loading connections…</p> : <>{(['incoming', 'friends', 'outgoing', 'blocked'] as const).map(kind => <section key={kind} aria-label={`${kind} connections`} className="social-connection-group"><h3>{({ incoming: 'Friend requests', friends: 'Your friends', outgoing: 'Requests you sent', blocked: 'Blocked players' })[kind]} <span>({list.data![kind].length})</span></h3>{list.data![kind].length ? <div className="social-player-list">{list.data![kind].map(player => <PlayerProfileCard key={player.userId} player={player} action={action}/>)}</div> : <p className="social-subtle">{kind === 'friends' ? 'Find a player above to start your friends list.' : 'None right now.'}</p>}</section>)}</>}<SocialFeedback action={action}/></section><GameInvitations userId={userId}/>
  </div>;
}
