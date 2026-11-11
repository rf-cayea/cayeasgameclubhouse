import { useEffect, useRef, useState } from 'react';
import { useClubhouse } from '@/lib/clubhouse';
import { profileFrameItem, profileFrameName, PROFILE_IMAGE_SHAPES, customProfileImage, prepareProfileImage, profileImageAvatar, type ProfileImageShape } from '@/lib/profile-image';
import type { ProfileAvatar } from '@/lib/social-protocol';
import { StorePurchaseControls } from './StorePurchaseControls';
import { PlayerAvatar } from './PlayerProfileCard';

export function CustomProfileImage({ avatar, onChange }: { avatar?: ProfileAvatar; onChange?: (avatar: ProfileAvatar) => void }) {
  const { user, wallet } = useClubhouse(), custom = customProfileImage(avatar);
  const ownsFrame = (value: ProfileImageShape) => Boolean(wallet?.owned.includes(profileFrameItem(value)));
  const [shape, setShape] = useState<ProfileImageShape>(custom?.shape ?? 'circle'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const owned = ownsFrame(shape);
  const chosen = useRef(false), chosenAccount = useRef(user?.id);
  const active = useRef(true), latest = useRef({ avatar, userId: user?.id }); latest.current = { avatar, userId: user?.id };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { if (custom) setShape(custom.shape); }, [custom?.shape]);
  useEffect(() => {
    if (chosenAccount.current !== user?.id) { chosen.current = false; chosenAccount.current = user?.id; setError(''); }
    if (!chosen.current && !custom) setShape(PROFILE_IMAGE_SHAPES.find(ownsFrame) ?? 'circle');
  }, [wallet?.owned, user?.id]);
  async function upload(file?: File) {
    if (!file || !owned || !onChange) return;
    const previous = avatar, buyer = user?.id; setBusy(true); setError('');
    try {
      const next = await prepareProfileImage(file, shape);
      if (active.current && latest.current.userId === buyer && latest.current.avatar === previous) onChange(next);
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'The profile image could not load.'); }
    finally { if (active.current) setBusy(false); }
  }
  return <section className="custom-profile-image" aria-label="Custom profile image"><h3 className="font-display text-2xl text-gold">Your own profile image</h3><p className="mt-2 text-sm">Each frame is a separate permanent purchase: 100 points from any game or 77 Clubhouse Cash. Your own image can be reused with frames you collect.</p>
    <div className="profile-image-shapes">{PROFILE_IMAGE_SHAPES.map(value => <button type="button" key={value} aria-label={`${value} profile frame`} aria-pressed={shape === value} disabled={busy} onClick={() => { chosen.current = true; setShape(value); if (custom && ownsFrame(value) && onChange) onChange(profileImageAvatar(value, custom.image)); }}><span className="profile-shape-example" data-image-shape={value}>{custom ? <PlayerAvatar avatar={profileImageAvatar(value, custom.image)}/> : <span aria-hidden="true">♠</span>}</span><span>{profileFrameName(value)}</span><small>{ownsFrame(value) ? 'Owned' : '100 points'}</small></button>)}</div>
    <StorePurchaseControls key={profileFrameItem(shape)} itemId={profileFrameItem(shape)} userId={user?.id ?? null} wallet={wallet}/>
    {owned && custom && onChange && <button type="button" className="btn-ghost-gold mt-3" disabled={busy || custom.shape === shape} onClick={() => onChange(profileImageAvatar(shape, custom.image))}>{custom.shape === shape ? 'Frame selected' : `Use ${profileFrameName(shape)} frame`}</button>}
    {owned && onChange && <label className="mt-4 block text-sm">Upload your profile image<input className="mt-2 block w-full" aria-label="Custom profile image file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => void upload(event.target.files?.[0])}/><span className="mt-2 block text-xs">JPG, PNG or WebP, up to 6 MB. The center is cropped to your frame. Save your profile to apply it.</span></label>}
    {owned && !onChange && <a className="btn-ghost-gold mt-4 inline-block" href="/profile">Choose your profile image</a>}
    {busy && <p role="status" className="mt-2 text-sm">Preparing your image…</p>}{error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
  </section>;
}
