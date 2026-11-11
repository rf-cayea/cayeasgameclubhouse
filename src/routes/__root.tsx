import { ClubhouseLogo } from "@/components/ClubhouseLogo";
import { createRootRoute, HeadContent, Link, Outlet, Navigate, useLocation } from '@tanstack/react-router';

import { useEffect,useState } from 'react';
import { incomingEmailReturn } from '@/lib/email-confirmation';
function RecoveryOutlet(){const location=useLocation(),[pending,setPending]=useState(incomingEmailReturn?.type==='recovery');useEffect(()=>{if(location.pathname==='/auth/reset')setPending(false);},[location.pathname]);return pending&&location.pathname!=='/auth/reset'?<Navigate to="/auth/reset" hash={window.location.hash.slice(1)} replace/>:<Outlet/>;}
export const Route = createRootRoute({
  head: () => ({ meta: [{ title: "Cayea's Game Clubhouse" }] }),
  component: () => <><HeadContent /><a href="#main-content" className="skip-link">Skip to content</a><div id="main-content"><RecoveryOutlet /></div><footer className="clubhouse-footer-brand mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground"><Link to="/" aria-label="Cayea’s Game Clubhouse home"><ClubhouseLogo decorative /></Link><span>Cayea’s Game Clubhouse by Card Guru III Games</span><Link to="/about" className="text-gold underline">About &amp; player guide</Link><Link to="/about" hash="credits" className="text-gold underline">Credits</Link></footer></>,
  notFoundComponent: () => <main className="mx-auto max-w-6xl px-4 py-16"><ClubhouseLogo className="clubhouse-error-logo"/><h1 className="font-display text-4xl text-gold">Page not found</h1><Link to="/" className="btn-gold mt-6 inline-block">Back to the clubhouse</Link></main>,
  errorComponent: ({ error, reset }) => <main className="mx-auto max-w-6xl px-4 py-16"><ClubhouseLogo className="clubhouse-error-logo"/><h1 className="font-display text-4xl text-gold">Something went wrong</h1><p role="alert" className="my-4">{error instanceof Error ? error.message : 'The page could not be loaded.'}</p><button className="btn-gold" onClick={reset}>Try again</button></main>,
});
