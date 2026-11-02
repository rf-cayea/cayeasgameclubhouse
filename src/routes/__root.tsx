import { createRootRoute, HeadContent, Link, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({ meta: [{ title: "Cayea's Game Clubhouse" }] }),
  component: () => <><HeadContent /><a href="#main-content" className="skip-link">Skip to content</a><div id="main-content"><Outlet /></div><footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">Cayea’s Game Clubhouse · A little play. A little progress. A place to belong.</footer></>,
  notFoundComponent: () => <main className="mx-auto max-w-6xl px-4 py-16"><h1 className="font-display text-4xl text-gold">Page not found</h1><Link to="/" className="btn-gold mt-6 inline-block">Back to the clubhouse</Link></main>,
  errorComponent: ({ error, reset }) => <main className="mx-auto max-w-6xl px-4 py-16"><h1 className="font-display text-4xl text-gold">Something went wrong</h1><p role="alert" className="my-4">{error instanceof Error ? error.message : 'The page could not be loaded.'}</p><button className="btn-gold" onClick={reset}>Try again</button></main>,
});
