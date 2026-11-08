/** Local Vite-only integration harness; never imported by application entries. */
import { createRoot } from 'react-dom/client';
import { useRummyRoom, useSpadesRoom } from '../src/lib/rummy-network';

function Harness({ game }: { game: 'rummy' | 'spades' }) {
  const rummy = useRummyRoom(), spades = useSpadesRoom(), network = game === 'rummy' ? rummy : spades;
  (window as unknown as { roomNetwork: typeof network }).roomNetwork = network;
  return <><pre id="network-state">{JSON.stringify({ code: network.code, room: network.room, pending: network.pending, live: network.live, healthy: network.healthy, error: network.error })}</pre>
    <button id="network-move" onClick={() => void network.command({ operation: 'move', code: network.code!, revision: network.room!.revision, requestId: crypto.randomUUID(), move: game === 'rummy' ? { t: 'draw', from: 'stock' } : { t: 'bid', bid: 3 } } as never)}>Move</button>
    <button id="network-leave" onClick={() => network.code && void network.command({ operation: 'leave', code: network.code })}>Leave</button></>;
}

export function mount(game: 'rummy' | 'spades') {
  document.getElementById('root')!.style.display = 'none';
  const target = document.createElement('div');target.id = 'room-network-harness';document.body.append(target);
  createRoot(target).render(<Harness game={game}/>);
}
