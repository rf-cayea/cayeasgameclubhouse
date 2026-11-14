import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createRouter, ErrorComponent, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { parseClubhouseSearch } from './lib/router-search';
import './styles.css';

function RouteLoadError({ error }: { error: unknown }) {
  const staleAssets = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css|loading chunk .* failed/i.test(error instanceof Error ? error.message : String(error));

  useEffect(() => {
    if (!staleAssets) return;
    try {
      const key = 'clubhouse-reloaded-build';
      if (sessionStorage.getItem(key) === import.meta.url) return;
      sessionStorage.setItem(key, import.meta.url);
      window.location.reload();
    } catch { /* The reload button also works when session storage is unavailable. */ }
  }, [staleAssets]);

  return staleAssets ? <main className="mx-auto max-w-lg p-8">
    <p>The Clubhouse page could not load. Reload to open the latest version.</p>
    <button className="btn-gold mt-4" onClick={() => window.location.reload()}>Reload Clubhouse</button>
  </main> : <ErrorComponent error={error} />;
}

const router = createRouter({ routeTree, defaultErrorComponent: RouteLoadError, parseSearch: parseClubhouseSearch, defaultPreload: 'intent', defaultPreloadDelay: 180, scrollRestoration: true });
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);
