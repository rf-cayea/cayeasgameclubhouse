import type { rummyAnnouncement } from '@/lib/rummy-announcements';

export function RummyAnnouncement({ call, dismiss }: { call: NonNullable<ReturnType<typeof rummyAnnouncement>>; dismiss: () => void }) {
  return <div className="rummy-announcement" data-call={call.kind} key={call.key}>
    <div className="rummy-announcement-card"><div role="status" aria-live="polite" aria-atomic="true"><span>{call.name}</span><strong>{call.title}</strong><p>{call.detail}</p></div><button onClick={dismiss}>View round result →</button></div>
  </div>;
}
