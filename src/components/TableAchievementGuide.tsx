import { Link } from '@tanstack/react-router';
import { ACHIEVEMENTS } from '@/lib/achievement-catalog';

export function TableAchievementGuide({ game }: { game: 'five-dice' | 'farkle' | 'crown-court' | 'dominoes' }) {
  const badges = ACHIEVEMENTS.filter(item => item.group === game), first = badges[0]!;
  const label = game === 'crown-court' ? 'Crown & Court' : game === 'five-dice' ? 'Quintsee' : game === 'farkle' ? 'Farkle' : 'Dominoes';
  return <section aria-label={`${label} achievements`}><h3>{badges.length} achievements to collect</h3><p>Win 1, 5, 10, 25, 50, and 100 full matches. Earn extra badges for 1, 10, and 50 Hard-computer wins, and the same milestones against signed-in online players.</p><p>Your first win badge awards {first.reward} {game === 'crown-court' || game === 'farkle' || game === 'five-dice' ? 'Dice' : label} points plus {first.cashReward} Clubhouse Cash. Harder milestones award larger bonuses. Sign in before playing, then claim unlocked rewards once in Rewards &amp; Cash to display the badges on your profile. Game scores are separate from wallet rewards.</p>{(game==='five-dice'||game==='farkle')&&<p>Crates are earned every 6 wins against real players (28–65 Cash), or 9 wins against computers (3–20 Cash), plus one dice fragment. Three matching fragments unlock a shared D6 set. Open Rewards in the game to collect.</p>}<Link to="/rewards" search={{ game }} hash="achievements" className="btn-ghost-gold">View {label} achievements →</Link></section>;
}
