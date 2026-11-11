import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useSocialResource, useSocialAction } from '@/lib/social';
import type { FriendsView, InvitesView, SocialGame, GameInvite } from '@/lib/social-protocol';
import { SocialFeedback, SocialSignIn } from './PlayerProfileCard';

export function FriendInvitePanel({ userId, game, code }: { userId: string | null; game?: SocialGame; code?: string }) {
  const friends = useSocialResource<FriendsView>('/api/social/friends', userId), invites = useSocialResource<InvitesView>('/api/social/invites', userId), action = useSocialAction(userId);
  const [target, setTarget] = useState(''), [table, setTable] = useState('');
  const rooms = (invites.data?.rooms ?? []).filter(room => !game || (room.game === game && room.code === code));
  const selected = rooms.find(room => `${room.game}:${room.code}` === table) ?? rooms[0];
  async function send(event: FormEvent) {
    event.preventDefault();
    if (selected && friends.data?.friends.some(friend => friend.userId === target)) await action.run({ operation: 'invite', targetUserId: target, game: selected.game, code: selected.code }, 'Table invitation sent. Your friend can open it from Friends.');
  }
  if (!userId) return <SocialSignIn label="Invite Clubhouse friends"/>;
  return <section className="social-invite-panel" aria-label="Invite a friend to your table"><h3>Invite a friend</h3>
    {(friends.error || invites.error) && <p role="alert" className="social-error">{friends.error || invites.error}<button onClick={() => { void friends.refresh(); void invites.refresh(); }} className="social-text-button">Retry invitations</button></p>}
    {!friends.data || !invites.data ? <p role="status">Loading friends and tables…</p> : !rooms.length ? <p>Create a private online table first. Only the host can invite friends while the table is waiting and seats are open. <Link to="/games/rummy" className="text-gold underline">Rummy+</Link> · <Link to="/games/spades" className="text-gold underline">Spades</Link></p> : !friends.data.friends.length ? <p><Link to="/friends" className="text-gold underline">Add and accept a friend</Link> before sending a table invitation. You can also share the room link.</p> : <form onSubmit={event => void send(event)} className="social-invite-form"><label>Table<select aria-label="Invitation table" value={selected ? `${selected.game}:${selected.code}` : ''} onChange={event => setTable(event.target.value)}>{rooms.map(room => <option key={`${room.game}:${room.code}`} value={`${room.game}:${room.code}`}>{room.title} · {room.code} · {room.occupied}/{room.capacity} seats</option>)}</select></label><label>Friend<select aria-label="Friend to invite" value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose a friend</option>{friends.data.friends.map(friend => <option key={friend.userId} value={friend.userId}>@{friend.gamerName}</option>)}</select></label><button className="btn-gold" disabled={action.busy || !selected || !target}>Send table invitation</button></form>}
    <SocialFeedback action={action}/>
  </section>;
}

export function GameInvitations({ userId }: { userId: string }) {
  const invites = useSocialResource<InvitesView>('/api/social/invites', userId), action = useSocialAction(userId);
  function card(invite: GameInvite, incoming: boolean) {
    const other = incoming ? invite.sender : invite.recipient;
    return <article className="social-invitation" key={invite.id}><p><Link to="/players/$playerId" params={{ playerId: other.userId }}>@{other.gamerName}</Link> · {invite.game === 'rummy' ? 'Rummy+' : 'Spades'} · <span className="font-mono">{invite.code}</span></p><p className="social-subtle">{invite.status} · expires {new Date(invite.expiresAt).toLocaleTimeString()}</p>{!invite.available && <p className="social-subtle">{invite.reason || 'This table is unavailable.'}</p>}<div className="social-player-actions">
      {incoming && invite.status === 'pending' && <><button className="btn-gold" disabled={action.busy || !invite.available} onClick={() => void action.run({ operation: 'accept_invite', inviteId: invite.id }, 'Invitation accepted. Open the table to choose your seat.')}>Accept invitation</button><button className="btn-ghost-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'decline_invite', inviteId: invite.id }, 'Invitation declined.')}>Decline invitation</button></>}
      {incoming && invite.status === 'accepted' && invite.available && <a className="btn-gold" href={invite.href}>Open table</a>}
      {!incoming && ['pending', 'accepted'].includes(invite.status) && <button className="btn-ghost-gold" disabled={action.busy} onClick={() => void action.run({ operation: 'cancel_invite', inviteId: invite.id }, 'Invitation cancelled.')}>Cancel invitation</button>}
    </div></article>;
  }
  return <section className="card-hub" id="table-invitations"><h2 className="font-display text-2xl text-gold">Table invitations</h2><p className="social-subtle">Invitations last 30 minutes. Opening a table never leaves another game automatically. The normal join and ready checks apply.</p>{invites.error && <p role="alert" className="social-error">{invites.error}<button className="social-text-button" onClick={() => void invites.refresh()}>Retry</button></p>}
    {!invites.data ? <p role="status">Loading invitations…</p> : <><h3 className="social-subheading">Received</h3>{invites.data.incoming.length ? invites.data.incoming.map(invite => card(invite, true)) : <p>No invitations yet.</p>}<details className="mt-5"><summary>Sent invitations ({invites.data.outgoing.length})</summary>{invites.data.outgoing.map(invite => card(invite, false))}</details></>}
    <SocialFeedback action={action}/><FriendInvitePanel userId={userId}/>
  </section>;
}
