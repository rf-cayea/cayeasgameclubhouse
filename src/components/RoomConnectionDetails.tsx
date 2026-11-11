import { useState } from 'react';

interface Connection {
  code: string | null;
  room: { revision: number; status: string } | null;
  live: boolean; healthy: boolean; pending: boolean; error: string;
  lastSync?: number | null;
  refresh(): Promise<void>;
}

/** Optional, player-invoked diagnostics. Never includes tokens or private cards. */
export function RoomConnectionDetails({ game, connection }: { game: 'rummy' | 'spades'; connection: Connection }) {
  const [notice, setNotice] = useState('');
  const transport = connection.live ? 'Live updates' : connection.healthy ? 'Polling for updates' : 'Waiting for connection';
  const report = () => ({
    game, roomCode: connection.code, revision: connection.room?.revision ?? null,
    tableStatus: connection.room?.status ?? 'No table', transport,
    requestPending: connection.pending, browserOnline: navigator.onLine,
    lastSync: connection.lastSync ? new Date(connection.lastSync).toISOString() : null,
    error: connection.error || null,
  });
  return <details className="mt-5 rounded-xl border border-border p-4 text-sm">
    <summary className="cursor-pointer text-gold">Connection &amp; testing details</summary>
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
      <dt>Room code</dt><dd className="font-mono">{connection.code ?? 'No table joined'}</dd>
      <dt>Table revision</dt><dd>{connection.room?.revision ?? '—'}</dd>
      <dt>Connection</dt><dd>{transport}</dd>
      <dt>Last synchronized</dt><dd>{connection.lastSync ? new Date(connection.lastSync).toLocaleTimeString() : 'Not yet'}</dd>
    </dl>
    <p className="mt-3 text-xs text-muted-foreground">Compare the room code and revision on both players’ devices. Reconnect before repeating a move if its response was interrupted.</p>
    {connection.error && <p className="mt-3 text-destructive">{connection.error}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button className="btn-ghost-gold" disabled={connection.pending || !connection.code} onClick={async () => { await connection.refresh(); setNotice('Connection refresh finished.'); }}>Reconnect / refresh</button>
      <button className="btn-ghost-gold" onClick={async () => {
        try { await navigator.clipboard.writeText(JSON.stringify(report(), null, 2)); setNotice('Testing details copied.'); }
        catch { setNotice('Clipboard unavailable. Share the room code, revision and connection shown above.'); }
      }}>Copy testing details</button>
    </div>
    {notice && <p role="status" className="mt-3 text-xs text-gold">{notice}</p>}
  </details>;
}
