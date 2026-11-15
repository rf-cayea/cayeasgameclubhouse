import { useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { GAME_LIBRARY, gamePath, readGameList, writeGameList } from '@/lib/game-library';

export function CompanyLogo({ className = '', mono = false }: { className?: string; mono?: boolean }) {
  return <img src={`/branding/card-guru-${mono ? 'mono' : 'color'}.webp`} className={`company-logo ${className}`} alt="Card Guru III Games" width="800" height="800" decoding="async" />;
}
export function BrandLoading() {
  return <div className="brand-loading" role="status"><CompanyLogo /><p className="gaming-eyebrow">CAYEA’S GAME CLUBHOUSE</p><p>Getting your next game ready…</p><span className="brand-loading-line" aria-hidden="true"/></div>;
}
export function RecentlyOpenedTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    const slug = Object.keys(GAME_LIBRARY).find(key => gamePath(key) === pathname);
    if (slug) writeGameList('clubhouse-recent-v1', [slug, ...readGameList('clubhouse-recent-v1').filter(x => x !== slug)].slice(0, 5));
  }, [pathname]);
  return null;
}
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export function InstallClubhouse() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [hint, setHint] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  useEffect(() => {
    function available(event: Event) { event.preventDefault(); setPrompt(event as InstallPrompt); }
    function done() { setInstalled(true); setPrompt(null); }
    window.addEventListener('beforeinstallprompt', available); window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', done); };
  }, []);
  async function install() { if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(null); } else setHint(value => !value); }
  if (installed) return <p className="install-note">Your Clubhouse is on your home screen.</p>;
  return <div className="install-clubhouse"><button className="install-button" onClick={() => void install()} aria-expanded={hint}>↧ Add to home screen</button>{hint && <p role="status" className="install-note">In your browser menu, choose Install app or Add to Home Screen if available. On iPhone or iPad, use Safari’s Share menu. Online features need an internet connection.</p>}</div>;
}
