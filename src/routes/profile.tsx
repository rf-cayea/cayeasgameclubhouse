import { CustomProfileImage } from '@/components/CustomProfileImage';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PlayerRewards } from '@/components/PlayerRewards';
import { HubNav } from '@/components/HubNav';
import { PlayerAvatar, PLAYER_AVATARS, SocialFeedback, SocialSignIn } from '@/components/PlayerProfileCard';
import { useClubhouse } from '@/lib/clubhouse';
import { usePlayerProfile, useSocialAction } from '@/lib/social';
import { PROFILE_AVATARS, type PlayerProfile, type ProfileAvatar } from '@/lib/social-protocol';

export const Route = createFileRoute('/profile')({ head: () => ({ meta: [{ title: "My player profile — Cayea's Game Clubhouse" }] }), component: ProfilePage });

function ProfilePage() {
  const { user, ready } = useClubhouse(), profile = usePlayerProfile(user?.id ?? null);
  return <><HubNav/><main className="social-shell"><div className="social-heading"><div><p className="social-eyebrow">YOUR PLACE IN THE CLUBHOUSE</p><h1>My player profile</h1><p>Choose the gamer name your friends will know you by.</p></div><div className="flex flex-wrap gap-2"><Link to="/auth/reset" className="btn-ghost-gold">Reset password</Link><Link to="/friends" className="btn-ghost-gold">Find friends</Link></div></div>
    {!ready ? <p role="status">Checking your account…</p> : !user ? <SocialSignIn label="Make your player profile"/> : profile.data ? <><ProfileEditor key={user.id} profile={profile.data}/><PlayerRewards key={`rewards-${user.id}`} userId={user.id}/></> : <section className="card-hub"><p role={profile.error ? 'alert' : 'status'}>{profile.error || 'Opening your player profile…'}</p>{profile.error && <button className="btn-ghost-gold mt-4" onClick={() => void profile.refresh()}>Retry profile</button>}</section>}
  </main></>;
}

function ProfileEditor({ profile }: { profile: PlayerProfile }) {
  const action = useSocialAction(profile.userId), dirty = useRef(false);
  const [gamerName, setGamerName] = useState(profile.gamerName), [bio, setBio] = useState(profile.bio), [avatar, setAvatar] = useState<ProfileAvatar>(profile.avatar), [edited, setEdited] = useState(false), [copied, setCopied] = useState('');
  useEffect(() => { if (!dirty.current) { setGamerName(profile.gamerName); setBio(profile.bio); setAvatar(profile.avatar); } }, [profile.gamerName, profile.bio, profile.avatar]);
  const change = () => { dirty.current = true; setEdited(true); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await action.run({ operation: 'profile', gamerName: gamerName.trim(), bio: bio.trim(), avatar }, 'Your player profile is saved.');
    if (result) { dirty.current = false; setEdited(false); if (result.profile) { setGamerName(result.profile.gamerName); setBio(result.profile.bio); setAvatar(result.profile.avatar); } }
  }
  async function copy() {
    const href = new URL(`/players/${profile.userId}`, location.origin).href;
    try { await navigator.clipboard.writeText(href); setCopied('Profile link copied.'); }
    catch { setCopied(`Your profile link: ${href}`); }
  }
  return <div className="social-profile-layout"><section className="social-profile-preview"><PlayerAvatar avatar={avatar} large/><p className="social-eyebrow">PLAYER CARD</p><h2>@{gamerName || profile.gamerName}</h2><p className="social-profile-bio">{bio || 'A little play. A little progress. A place to belong.'}</p><p className="social-subtle">Member since {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p><dl className="social-profile-stats"><div><dt>Rummy+ wins</dt><dd>{profile.stats.rummyWins}</dd></div><div><dt>Spades wins</dt><dd>{profile.stats.spadesWins}</dd></div></dl><p className="social-subtle">Verified full-match wins</p><Link to="/players/$playerId" params={{ playerId: profile.userId }} className="btn-ghost-gold">View player page</Link><button className="social-text-button" onClick={() => void copy()}>Copy profile link</button>{copied && <p role="status" className="social-subtle social-wrap">{copied}</p>}</section>
    <form className="social-profile-form" onSubmit={event => void save(event)}><h2>Edit your player card</h2>{profile.nameFlagged && <p role="alert" className="social-error">Your gamer name is under review. Profile changes are paused until the review is resolved.</p>}<label htmlFor="gamer-name">Gamer name</label><input id="gamer-name" name="gamerName" autoComplete="nickname" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" value={gamerName} disabled={action.busy || profile.nameFlagged} onChange={event => { setGamerName(event.target.value); change(); }}/><p className="social-field-hint">3–24 letters, numbers or underscores. Each gamer name belongs to one player. New tables use this name. Active games keep their existing player names.</p><label htmlFor="player-bio">About your play</label><textarea id="player-bio" rows={4} maxLength={160} value={bio} disabled={action.busy || profile.nameFlagged} onChange={event => { setBio(event.target.value); change(); }}/><p className="social-field-hint">{bio.length} / 160 characters. Keep personal contact details out of your player card.</p>
      <fieldset disabled={action.busy || profile.nameFlagged}><legend>Choose your player emblem</legend><div className="social-avatar-picker">{PROFILE_AVATARS.map(value => <label key={value} data-selected={avatar === value}><input type="radio" name="avatar" value={value} checked={avatar === value} onChange={() => { setAvatar(value); change(); }}/><PlayerAvatar avatar={value}/><span>{PLAYER_AVATARS[value].label}</span></label>)}</div></fieldset><fieldset disabled={action.busy || profile.nameFlagged}><legend className="sr-only">Custom image settings</legend><CustomProfileImage avatar={avatar} onChange={value => { setAvatar(value); change(); }}/></fieldset><button className="btn-gold" type="submit" disabled={action.busy || profile.nameFlagged || !edited}>{action.busy ? 'Saving profile…' : 'Save profile'}</button><SocialFeedback action={action}/>
    </form></div>;
}
