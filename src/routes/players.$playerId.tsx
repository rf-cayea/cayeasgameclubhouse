import { createFileRoute, Link } from '@tanstack/react-router';
import { PublicPlayerRewards } from '@/components/PlayerRewards';
import { HubNav } from '@/components/HubNav';
import { FriendActions, PlayerAvatar, SocialFeedback, SocialSignIn } from '@/components/PlayerProfileCard';
import { PlayerReportProvider, ReportPlayer } from '@/components/ReportPlayer';
import { useClubhouse } from '@/lib/clubhouse';
import { useSocialAction, useSocialResource } from '@/lib/social';
import type { PlayerProfile } from '@/lib/social-protocol';

export const Route = createFileRoute('/players/$playerId')({ head: () => ({ meta: [{ title: "Player profile — Cayea's Game Clubhouse" }] }), component: PlayerPage });

function PlayerPage() {
  const { playerId } = Route.useParams(), { user, ready } = useClubhouse();
  const profile = useSocialResource<PlayerProfile>(`/api/social/players/${encodeURIComponent(playerId)}`, user?.id ?? null), action = useSocialAction(user?.id ?? null);
  const player = profile.data;
  return <PlayerReportProvider><HubNav/><main className="social-shell"><div className="social-heading"><div><p className="social-eyebrow">THE PEOPLE BEHIND THE PLAY</p><h1>Player profile</h1></div><Link to="/friends" className="btn-ghost-gold">Friends & invitations</Link></div>
    {!ready ? <p role="status">Checking your account…</p> : !user ? <SocialSignIn label="Meet this player"/> : !player ? <section className="card-hub"><p role={profile.error ? 'alert' : 'status'}>{profile.error || 'Opening player profile…'}</p>{profile.error && <button className="btn-ghost-gold mt-4" onClick={() => void profile.refresh()}>Retry player profile</button>}</section> : <section className="social-player-page"><PlayerAvatar avatar={player.avatar} large/><p className="social-eyebrow">CLUBHOUSE PLAYER</p><h2>@{player.gamerName}</h2><p className="social-profile-bio">{player.bio || 'Here for a little play and a little progress.'}</p><p className="social-subtle">Member since {new Date(player.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p><dl className="social-profile-stats"><div><dt>Rummy+ wins</dt><dd>{player.stats.rummyWins}</dd></div><div><dt>Spades wins</dt><dd>{player.stats.spadesWins}</dd></div></dl><p className="social-subtle">Verified full-match wins</p><FriendActions player={player} action={action}/>{player.relationship === 'friends' && <Link to="/friends" hash="table-invitations" className="btn-gold mt-4 inline-block">Invite to a game</Link>}{player.relationship !== 'self' && <div className="social-report"><ReportPlayer userId={player.userId} name={player.gamerName} context="player"/></div>}<SocialFeedback action={action}/><PublicPlayerRewards key={`${user.id}:${player.userId}`} userId={user.id} playerId={player.userId}/></section>}
  </main></PlayerReportProvider>;
}
