import { useState } from 'react';

export function ClubhouseLogo({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  return <img src={decorative ? '/branding/clubhouse-logo-128.webp' : '/branding/clubhouse-logo.webp'} width="1024" height="1024" alt={decorative ? '' : 'Cayea’s Game Clubhouse'} className={`clubhouse-logo ${className}`} decoding="async" />;
}

export function AnimatedClubhouseLogo() {
  const [paused, setPaused] = useState(() => {
    try { return localStorage.getItem('clubhouse-logo-paused') === 'true'; } catch { return false; }
  });
  function toggleMotion() {
    const next = !paused;
    setPaused(next);
    try { localStorage.setItem('clubhouse-logo-paused', String(next)); } catch { /* Motion controls also work without storage. */ }
  }
  return <div className="clubhouse-hero-brand" data-paused={paused}>
    <div className="clubhouse-logo-float">
      <span className="clubhouse-logo-aura" aria-hidden="true" />
      <div className="clubhouse-logo-surface">
        <ClubhouseLogo className="clubhouse-hero-logo" />
        <span className="clubhouse-logo-sheen" aria-hidden="true" />
      </div>
    </div>
    <button type="button" className="clubhouse-logo-motion" aria-label={paused ? 'Play logo animation' : 'Pause logo animation'} onClick={toggleMotion}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">{paused ? <path d="M5 3 13 8 5 13Z" fill="currentColor" /> : <path d="M5 3V13M11 3V13" fill="none" stroke="currentColor" strokeWidth="2.5" />}</svg>
      {paused ? 'Animate logo' : 'Pause animation'}
    </button>
  </div>;
}
