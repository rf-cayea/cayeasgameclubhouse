import type { RoomView } from './rummy-protocol';

export function rummyAnnouncement(room: RoomView) {
  if (!room.roundResult || room.status === 'abandoned' || !['roundOver', 'gameOver'].includes(room.phase ?? '')) return null;
  let action = room.roundResult.announcement;
  if (!action) {
    // Read completed tables saved before structured announcements existed.
    for (const [seat, player] of room.players.entries()) {
      const note = room.roundResult.note;
      if (note.startsWith(`${player.name} knocked (`)) action = { kind: 'knock', seat };
      else if (note.startsWith(`${player.name} went Gin (`)) action = { kind: 'gin', seat };
      else if (note === `${player.name} went out.`) action = { kind: 'out', seat };
      if (action) break;
    }
  }
  if (!action || !room.players[action.seat]) return null;
  const player = room.players[action.seat]!, undercut = action.kind === 'knock' && room.roundResult.winner !== null && room.roundResult.winner !== action.seat;
  return { key: `${room.code}:${room.round}:${action.kind}:${action.seat}`, kind: action.kind, seat: action.seat, name: player.name,
    title: action.kind === 'knock' ? 'KNOCK!' : action.kind === 'gin' ? 'GIN!' : 'WENT OUT!',
    detail: undercut ? `Undercut by ${room.players[room.roundResult.winner!]?.name ?? 'the opponent'}` : action.kind === 'knock' && action.deadwood !== undefined ? `${action.deadwood} deadwood points` : action.kind === 'gin' ? 'No deadwood. A perfect finish.' : 'Every card played.' };
}
