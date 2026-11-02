/** Labels for server-provided award sources; unknown award types stay generic. */
export function describeActivity(source: string): string {
  const level = /^faith3:level:(\d+)$/.exec(source);
  if (level) return `cleared Faith 3 level ${Number(level[1])}`;
  if (source.startsWith("faith3:ms:")) return "claimed a Faith 3 milestone";
  if (source.startsWith("rummy:win:")) return "won a Rummy+ game";
  if (source.startsWith("badge:")) return "earned a Clubhouse badge";
  return "earned Clubhouse points";
}
