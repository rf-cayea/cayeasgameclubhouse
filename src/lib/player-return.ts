/** Preserve profile/invitation destinations without accepting external redirects. */
export function playerReturnPath(value: string | null, origin: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    if (/^\/(profile|friends|rewards)$/.test(url.pathname) || /^\/players\/[a-f0-9-]{36}$/i.test(url.pathname)) return url.pathname;
    if (/^\/games\/(rummy|spades)$/.test(url.pathname) && /^[a-f0-9]{8}$/i.test(url.searchParams.get('room') ?? '')) return `${url.pathname}?room=${url.searchParams.get('room')!.toUpperCase()}`;
  } catch { /* Invalid links fall back to the Clubhouse. */ }
  return null;
}
export function pendingPlayerReturn() { try { return playerReturnPath(sessionStorage.getItem('clubhouse-player-return'), location.origin); } catch { return null; } }
