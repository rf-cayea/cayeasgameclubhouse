import React from 'react';
import ReactDOM from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { parseClubhouseSearch } from './lib/router-search';
import './styles.css';

const router = createRouter({ routeTree, parseSearch: parseClubhouseSearch, defaultPreload: 'intent', scrollRestoration: true });
declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);
