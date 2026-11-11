import { customProfileImage } from '@/lib/profile-image';
import { Link } from '@tanstack/react-router';
import type { PlayerProfile, ProfileAvatar, PresetProfileAvatar } from '@/lib/social-protocol';
import type { useSocialAction } from '@/lib/social';

export const PLAYER_AVATARS: Record<PresetProfileAvatar, { label: string; symbol: string }> = {
  jade: { label: 'Jade leaf', symbol: '❧' }, sapphire: { label: 'Sapphire', symbol: '◆' }, ruby: { label: 'Ruby heart', symbol: '♥' },
  amber: { label: 'Amber sun', symbol: '☀' }, lotus: { label: 'Lotus', symbol: '✿' }, moon: { label: 'Moon', symbol: '☾' },
};
export function PlayerAvatar({ avatar, large = false }: { avatar: ProfileAvatar; large?: boolean }) {
  const custom = customProfileImage(avatar);
  return <span data-image-shape={custom?.shape} className={`player-profile-avatar ${large ? 'player-profile-avatar-large' : ''}`} data-avatar={custom ? 'custom' : avatar} aria-hidden="true">{custom ? <img src={custom.image} alt=""/> : PLAYER_AVATARS[avatar as PresetProfileAvatar]?.symbol ?? '❧'}</span>;
}
export function SocialSignIn({ label = 'Connect with your fellow players' }: { label?: string }) {
  return <section className="card-hub mt-6"><h2 className="font-display text-2xl text-gold">{label}</h2><p className="mt-3 text-muted-foreground">Sign in to choose your gamer name, build your player profile, add friends, and receive table invitations.</p><Link to="/auth" className="btn-gold mt-4 inline-block" onClick={() => { try { sessionStorage.setItem('clubhouse-player-return', location.pathname + location.search); } catch { /* Optional return link. */ } }}>Sign in or create an account</Link></section>;
}
export function SocialFeedback({ action }: { action: Pick<ReturnType<typeof useSocialAction>, 'error' | 'notice'> }) {
  return <>{action.error && <p role="alert" className="social-error">{action.error}</p>}{action.notice && <p role="status" className="social-notice">{action.notice}</p>}</>;
}
export function FriendActions({ player, action }: { player: PlayerProfile; action: ReturnType<typeof useSocialAction> }) {
  const targetUserId = player.userId;
  if (player.relationship === 'self') return <Link to="/profile" className="btn-ghost-gold text-sm">Edit your profile</Link>;
  return <div className="social-player-actions">
    {player.relationship === 'none' && <button className="btn-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'request', targetUserId }, 'Friend request sent.')}>Add friend</button>}
    {player.relationship === 'incoming' && <><button className="btn-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'accept', targetUserId }, 'You are now friends.')}>Accept request</button><button className="btn-ghost-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'decline', targetUserId }, 'Request declined.')}>Decline</button></>}
    {player.relationship === 'outgoing' && <><span className="social-state">Request sent</span><button className="btn-ghost-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'cancel', targetUserId }, 'Friend request cancelled.')}>Cancel request</button></>}
    {player.relationship === 'friends' && <><span className="social-state">Friends</span><button className="btn-ghost-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'remove', targetUserId }, 'Friend removed.')}>Remove friend</button></>}
    {player.relationship === 'blocked' ? <button className="btn-ghost-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'unblock', targetUserId }, 'Player unblocked. You can send a new request.')}>Unblock</button> : <button className="social-text-button" disabled={action.busy} onClick={() => void action.run({ operation: 'block', targetUserId }, 'Player blocked. Friend requests and invitations are stopped.')}>Block player</button>}
  </div>;
}
export function PlayerProfileCard({ player, action }: { player: PlayerProfile; action?: ReturnType<typeof useSocialAction> }) {
  return <article className="social-player-card" aria-label={`Player ${player.gamerName}`}><div className="social-player-identity"><PlayerAvatar avatar={player.avatar}/><div><Link className="social-gamer-name" to="/players/$playerId" params={{ playerId: player.userId }}>@{player.gamerName}</Link>{player.bio && <p className="social-player-bio">{player.bio}</p>}</div></div>{action && <FriendActions player={player} action={action}/>}</article>;
}
