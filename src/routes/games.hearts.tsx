import { classicTitle } from '@/lib/classic-card-protocol';
import { createFileRoute } from '@tanstack/react-router';
import { ClassicCardTable } from '@/components/ClassicCardTable';

export const Route = createFileRoute('/games/hearts')({
  head: () => ({ meta: [{ title: `${classicTitle('hearts')} — Cayea’s Game Clubhouse` }] }),
  component: () => <ClassicCardTable kind="hearts"/>,
});
