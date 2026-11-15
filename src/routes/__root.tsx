import { CompanyLogo, InstallClubhouse, RecentlyOpenedTracker } from '@/components/CompanyBrand';
import {WinnerCelebration} from '@/components/WinnerCelebration';
import { ClubhouseLogo } from "@/components/ClubhouseLogo";
import { createRootRoute, HeadContent, Link, Outlet, Navigate, useLocation } from '@tanstack/react-router';

import { useEffect,useState } from 'react';
import { incomingEmailReturn } from '@/lib/email-confirmation';
function RecoveryOutlet(){const location=useLocation(),[pending,setPending]=useState(incomingEmailReturn?.type==='recovery');useEffect(()=>{if(location.pathname==='/auth/reset')setPending(false);},[location.pathname]);return pending&&location.pathname!=='/auth/reset'?<Navigate to="/auth/reset" hash={window.location.hash.slice(1)} replace/>:<Outlet/>;}
export const Route = createRootRoute({
  head: () => ({ meta: [{ title: "Cayea's Game Clubhouse" }] }),
  component: () => <><HeadContent /><a href="#main-content" className="skip-link">Skip to content</a><div id="main-content"><RecoveryOutlet /></div><footer className="studio-footer"><div className="studio-footer-top"><Link to="/" className="studio-brand"><CompanyLogo/><span><strong>Cayea’s Game Clubhouse</strong><small>Card Guru III Games · A Cayea Digital project</small></span></Link><div className="studio-footer-links"><Link to="/about">Player guide</Link><Link to="/about" hash="credits">Creator credits</Link><Link to="/friends">Friends</Link><Link to="/store">Store</Link></div><InstallClubhouse/></div><div className="studio-footer-bottom"><span>Concepts &amp; vibe coding by Richard Cayea · AI-assisted coding &amp; art with OpenAI</span><a href="/about#credits" className="publisher-mark"><img src="/branding/cayea-digital.webp" alt="Cayea Digital" width="40" height="40" loading="lazy"/>CAYEA DIGITAL</a></div></footer><RecentlyOpenedTracker/><WinnerCelebration/></>,
  notFoundComponent: () => <main className="mx-auto max-w-6xl px-4 py-16"><ClubhouseLogo className="clubhouse-error-logo"/><h1 className="font-display text-4xl text-gold">Page not found</h1><Link to="/" className="btn-gold mt-6 inline-block">Back to the clubhouse</Link></main>,
  errorComponent: ({ error, reset }) => <main className="mx-auto max-w-6xl px-4 py-16"><ClubhouseLogo className="clubhouse-error-logo"/><h1 className="font-display text-4xl text-gold">Something went wrong</h1><p role="alert" className="my-4">{error instanceof Error ? error.message : 'The page could not be loaded.'}</p><button className="btn-gold" onClick={reset}>Try again</button></main>,
});
