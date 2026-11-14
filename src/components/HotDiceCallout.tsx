export function HotDiceCallout({ player, detail = 'All six dice scored.' }: { player: string; detail?: string }) {
  return <div className="fk-hot-callout"><strong>Hot Dice</strong><span>{player} · {detail}</span></div>;
}
