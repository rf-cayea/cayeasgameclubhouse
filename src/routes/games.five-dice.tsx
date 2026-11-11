import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/games/five-dice')({
  validateSearch: (search: Record<string, unknown>): { room?: string } => ({
    room: typeof search.room === 'string' && /^[a-f0-9]{8}$/i.test(search.room) ? search.room.toUpperCase() : undefined,
  }),
  beforeLoad: ({ search }) => { throw redirect({ to: '/games/quintsee', search, replace: true }); },
});
