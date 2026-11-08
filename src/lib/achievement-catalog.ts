import { reducedGameReward, gameAchievementCash } from './reward-rates';
import type { AchievementDefinition, AchievementGroup, Currency, EconomyStats } from './economy-protocol';

const awards: AchievementDefinition[] = [];
function chain(group: AchievementGroup, stat: keyof EconomyStats, currency: Currency, icon: string, prefix: string, rows: [number, number, string][], description: (n: number) => string) {
  rows.forEach(([goal, previousReward, name], n) => { const reward = group === 'clubhouse' ? previousReward : reducedGameReward(previousReward); awards.push({ id: `${prefix}-${goal}`, name, description: description(goal), group, icon, stat, goal, reward, currency, cashReward: currency === 'points' ? reward : gameAchievementCash(reward), tier: n < 2 ? 'bronze' : n < 4 ? 'silver' : n < 6 ? 'gold' : 'platinum' }); });
}
chain('faith-3', 'faithLevels', 'f3_points', 'lotus', 'faith-clear', [[1,50,'First Light'],[10,150,'Pilgrim'],[25,300,'Sacred Steps'],[50,600,'Devoted'],[100,1500,'Keeper of Faith'],[200,3000,'World of Belief'],[280,5000,'Faith Grandmaster']], n => `Clear ${n} different Faith 3 ${n === 1 ? 'level' : 'levels'}.`);
chain('faith-3','faithChapters','f3_points','temple','faith-chapter',[[1,200,'A Complete Chapter'],[5,1000,'Spiritual Explorer'],[14,4000,'Every Sacred Path']],n=>`Complete ${n} full ${n===1?'chapter':'chapters'} of 20 Faith 3 levels.`);
chain('3-gems','gemsLevels','gems_points','gem','gems-clear',[[1,60,'A Seed of Hope'],[15,200,'Courtyard Restorer'],[30,500,'Garden Guardian'],[60,1200,'Monastery Builder'],[100,2500,'Light in the Halls'],[150,5000,'Mountain Sanctuary Keeper'],[200,6500,'Four Communities Flourish']],n=>`Clear ${n} different 3 Gems ${n===1?'level':'levels'}.`);
chain('3-gems','gemsStars','gems_points','star','gems-star',[[30,250,'Starlit Garden'],[150,1000,'Constellation Keeper'],[450,4000,'Perfect Sanctuary'],[600,5500,'Four Starlit Sanctuaries']],n=>`Earn ${n} verified stars in 3 Gems.`);
for (const [game,label,icon] of [['rummy','Rummy+','cards'],['spades','Spades','spade'],['five-dice','Farkle','dice']] as const) {
  const currency = (game === 'five-dice' ? 'dice_points' : `${game}_points`) as Currency;
  const stat = game === 'five-dice' ? 'dice' : game;
  chain(game,`${stat}Wins`,currency,icon,`${game}-victory`,[[1,100,'First Victory'],[5,250,'Table Regular'],[10,500,'Skilled Contender'],[25,1000,'Club Champion'],[50,2000,'Master of the Table'],[100,5000,'Legendary Player']],n=>`Win ${n} verified full ${label} ${n===1?'match':'matches'}.`);
  chain(game,`${stat}HardWins`,currency,'crown',`${game}-hard`,[[1,200,'Challenge Accepted'],[10,1500,'Hard Table Hero'],[50,5000,'Expert Conqueror']],n=>`Win ${n} full ${label} ${n===1?'match':'matches'} against Hard computer opponents.`);
  chain(game,`${stat}HumanWins`,currency,'rivals',`${game}-rivals`,[[1,200,'Friendly Rival'],[10,1500,'Online Champion'],[50,5000,'Multiplayer Legend']],n=>`Win ${n} verified online ${label} ${n===1?'match':'matches'} against signed-in players.`);
}
chain('clubhouse','lifetime','points','coin','member-points',[[100,25,'Welcome In'],[1000,100,'Clubhouse Regular'],[5000,500,'Rising Star'],[25000,2500,'Clubhouse Legend']],n=>`Earn ${n.toLocaleString()} lifetime reward points.`);
chain('clubhouse','visits','points','calendar','member-visits',[[3,75,'Good Company'],[7,250,'A Familiar Face'],[30,1000,'Clubhouse Companion'],[90,3500,'Part of the Club']],n=>`Visit while signed in on ${n} different UTC days.`);
chain('clubhouse','memberDays','points','anniversary','member-days',[[30,500,'One Month Together'],[365,5000,'Clubhouse Anniversary']],n=>`Reach ${n} days of Clubhouse membership.`);
chain('clubhouse','friends','points','friends','member-friends',[[1,50,'A Friendly Beginning'],[5,300,'Circle of Friends']],n=>`Have ${n} accepted Clubhouse ${n===1?'friend':'friends'}.`);
chain('clubhouse','profileComplete','points','emblem','member-profile',[[1,50,'Make Yourself at Home']],()=> 'Choose a personal gamer name and add a short profile bio.');
chain('clubhouse','gamesPlayed','points','compass','member-explorer',[[2,200,'Game Explorer'],[4,1000,'All-Around Club Champion'],[5,1500,'Five-Game Explorer']],n=>`Earn a verified level-clear or match-win reward in ${n} different games.`);
chain('clubhouse','cosmetics','points','palette','member-collection',[[1,50,'A Personal Touch'],[5,500,'Artist Collection']],n=>`Own ${n} store ${n===1?'cosmetic':'cosmetics'}.`);
export const ACHIEVEMENTS: readonly AchievementDefinition[] = awards;
