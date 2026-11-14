import { classicTitle } from '@/lib/classic-card-protocol';
import { createFileRoute } from '@tanstack/react-router';
import { ClassicCardTable } from '@/components/ClassicCardTable';

export const Route = createFileRoute('/games/crazy-eights')({
  head: () => ({ meta: [{ title: `${classicTitle('eights')} — Cayea’s Game Clubhouse` }] }),
  component: () => <ClassicCardTable kind="eights"/>,
});
