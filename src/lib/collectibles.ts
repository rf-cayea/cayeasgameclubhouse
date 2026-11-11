export type CardStars=1|2|3|4;
export const SEASON_ID='harvest-hearth-01';
export const SEASON_NAME='Harvest & Hearth';
export const JACKPOT_CASH=1000;
export const CARD_RARITIES={1:'Common',2:'Uncommon',3:'Rare',4:'Ultra-rare'} as const;
export const DUPLICATE_PRICES={1:5,2:10,3:20,4:40} as const;
export const BOOSTER_PRICES={1:25,2:50,3:94,4:157} as const;
export const BOOSTER_NEW_CARD_CHANCE=44;
export interface CollectibleCard{id:string;number:number;name:string;stars:CardStars;theme:'fall'|'winter';art:string;panel:number;story:string;singleImage?:boolean}
const names=[
'Copper Pumpkin Morning','The Acorn Keeper','Thankful Feathers','Basket of Plenty','Orchard Cider','The Autumn Clubhouse',
'Squirrel’s Golden Find','Orchard Ladder','The Maple Bridge','Pumpkin-Patch Hedgehog','The Cozy Window','Harvest Windmill',
'The Table We Share','Braided Harvest Loaf','Cranberry Jewel Pie','Hearthside Tabby','Neighborly Baskets','The Lantern Owl',
'The Amber Stag','Woodland Harvest Ball','Pumpkin Gamehouse','Garnet River','Turkey’s Golden Waltz','The Harvest Queen',
'The Amber-Leaf Dragon','First Snow at the Clubhouse','Holly Robin','Moonpath Fox','A Snowflake to Keep','Cocoa by the Window',
'Scarf-Wrapped Snowman','The Gift Sled','Peppermint Workshop','Penguins in One Scarf','Gingerbread Garden','Winter’s Red Cardinal',
'Lantern Through the Pines','The Skating Pond','Emerald-Ribbon Gift','The Village Caroler','Candlelight Cat','The Toymaker’s Table',
'The Christmas Star','Eight Nights of Light','Seven Candles of Kwanzaa','Solstice Evergreen','Father Winter’s Arrival','Midnight Wishes',
'The Snowflake Palace','Aurora Wolf Family','Silver-Moon Owl','The Polar Medallion','The Winter Queen','The Opal Ice Dragon',
'Constellation Reindeer','The Friendship Tree','The Midnight Gift Train','The Lantern Guardian','The Clubhouse Northern Crown','Seasons Together'];
// Preserve the original card numbers, art panels and rarities.
const ultra=new Set([22,23,24,25,53,54,55,58,59,60]),rare=new Set([6,12,13,18,19,20,21,43,44,45,46,51]);
const commons=new Set([1,2,3,4,5,7,8,9,10,11,26,27,28,29,30,31,32,33,34,35]);
const originalCards:CollectibleCard[]=names.map((name,i)=>({id:`hh-${String(i+1).padStart(2,'0')}`,number:i+1,name,stars:ultra.has(i+1)?4:rare.has(i+1)?3:commons.has(i+1)?1:2,theme:i<25?'fall':'winter',art:`/collectible-art/harvest-hearth-${Math.floor(i/6)+1}.avif`,panel:i%6,story:i<25?'A little gratitude, a golden memory, and a place at Cayea’s table.':'A light in the winter dark, and a warm welcome at Cayea’s Clubhouse.'}));
const autumnExpansion = [
  ["Maple Leaf Letter", "A red maple leaf slips into a letter bound for an old friend."],
  ["The Pear Picker’s Basket", "Ripe pears nestle against the wicker on the walk home."],
  ["Scarecrow at Sundown", "The last light catches a patchwork coat in the stubble field."],
  ["Puddle Stompers", "A pair of rain boots waits by the door for the next downpour."],
  ["The Blue Jay’s Visit", "A bright blue jay breaks the quiet at the edge of the orchard."],
  ["Apple Butter Morning", "A small jar holds the orchard’s sweetest afternoon."],
  ["Hazelnuts for the Table", "A wooden bowl makes room for the last handful of hazelnuts."],
  ["The Wandering Squash Vine", "A curling vine takes the long way around the garden gate."],
  ["Chestnuts on the Corner", "The smell of roasted chestnuts drifts across the village square."],
  ["Mushroom Trail", "Little caps mark the damp path through the autumn woods."],
  ["The Amber Apiary", "A beekeeper checks the hives before the first frost."],
  ["Grandmother’s Harvest Quilt", "Scraps from old shirts become a blanket for the long evenings."],
  ["The Candlelit Ferry", "One candle guides the ferry past the reeds and home."],
  ["Moon Over the Stubble", "The harvest moon rises as the last wagon leaves the field."],
  ["The Fox Baker", "A fox slips the first golden loaf onto the bakery shelf."],
  ["The Old Cider Mill", "The mill wheel turns while neighbors bring in their apples."],
  ["The Orchard Griffin", "A griffin folds its wings among the last apples on the hill."],
  ["The Copper Phoenix", "Copper wings scatter glowing leaves across the sky."],
  ["Castle of the Turning Leaves", "The hilltop castle opens its gates for the harvest feast."],
  ["Spirit of the Golden Harvest", "A quiet figure walks the fields after the last sheaf is gathered."],
] as const;
const winterExpansion = [
  ["The Longest Icicle", "A clear icicle catches the morning light under the eaves."],
  ["A Pinecone in the Snow", "A single pinecone has rolled beyond the evergreen’s shadow."],
  ["Rabbit in Fresh Snow", "The first tracks across the yard belong to a snow-white rabbit."],
  ["Mittens on the Line", "A pair of wool mittens dries beside the window after a snowball fight."],
  ["The Last Marshmallow", "One marshmallow melts into a cup of cocoa after the walk home."],
  ["Folded Snow Star", "Careful folds turn an ordinary sheet of paper into a window star."],
  ["Bell on the Sled", "A little brass bell rings all the way down the hill."],
  ["Berries Beneath the Frost", "Bright red berries peek through a fine coat of ice."],
  ["The Snowshoe Trail", "Wide tracks lead through the drifts to a cabin with the lights on."],
  ["The Arctic Hare", "A white hare stops to listen before crossing the frozen clearing."],
  ["The Watchful Toy Soldier", "A painted soldier keeps watch over the empty workshop."],
  ["The Glass Keepsake", "The oldest ornament finds its usual branch on the tree."],
  ["Observatory After Snowfall", "A clear winter night brings the astronomer back to the telescope."],
  ["The Frosted Greenhouse", "Tender leaves stay green behind panes covered in frost."],
  ["The Last Skater", "A lone skater traces one more circle before the pond goes dark."],
  ["The Silverbell Sleigh", "A silver sleigh carries its passengers home beneath the winter moon."],
  ["Pegasus of the Snowfields", "A winged horse rises from the ridge in a cloud of powder."],
  ["The Aurora Phoenix", "An emerald and violet bird wheels through the northern lights."],
  ["Castle Beneath the Snow", "The castle windows shine over the snowbound valley."],
  ["The Starlit Frost Spirit", "A winter spirit leaves delicate stars of frost on sleeping windows."],
] as const;

const expansionCards: CollectibleCard[] = [...autumnExpansion, ...winterExpansion].map(([name, story], index) => {
  const number = originalCards.length + index + 1;
  const seasonalIndex = index % autumnExpansion.length;
  const stars = seasonalIndex < 9 ? 1 : seasonalIndex < 13 ? 2 : seasonalIndex < 17 ? 3 : 4;
  return {id: `hh-${number}`, number, name, story, stars, theme: index < autumnExpansion.length ? 'fall' : 'winter',
    art: `/collectible-art/hh-${number}.webp`, panel: 0, singleImage: true};
});

export const SEASON_CARDS = [...originalCards, ...expansionCards];
export const SEASON_THEME_COUNTS = {
  fall: SEASON_CARDS.filter(card => card.theme === 'fall').length,
  winter: SEASON_CARDS.filter(card => card.theme === 'winter').length,
};
export const BOOSTER_ODDS_DESCRIPTION = `Each pack has a ${BOOSTER_NEW_CARD_CHANCE}% chance to contain one card missing from your album. If the guaranteed slot has no eligible duplicate, that slot gives you a new card. A full album receives duplicates.`;
export interface Booster{id:string;stars:CardStars;source:string;createdAt:number}
export interface AlbumState{cards:Record<string,number>;packs:Booster[];crates:number;ultraMisses:number;recent:{id:string;cards:string[];stars:CardStars}[]}
export interface CardTrade{id:string;seller:string;buyer:string;sellerName:string;buyerName:string;give:string;want:string|null;price:number;status:'pending'|'accepted'|'cancelled'|'declined';createdAt:number}
export interface AlbumView extends AlbumState{unique:number;complete:boolean;jackpotClaimed:boolean;trades:CardTrade[]}
export interface CardReceipt{alreadyApplied:boolean;cards?:string[];packId?:string;tradeId?:string;cash?:number}
export type CollectibleCommand={operation:'buy_booster';stars:CardStars;requestId:string}|{operation:'open_booster';packId:string}|{operation:'claim_jackpot'}|{operation:'offer_trade';recipient:string;give:string;want?:string;requestId:string}|{operation:'accept_trade'|'cancel_trade'|'decline_trade';tradeId:string};
export function achievementCardBonus(id:string):{pack?:CardStars;card?:CardStars}|null{
 if(/^(carrom|rummy|spades|five-dice|farkle|dominoes|backgammon|crown-court)-victory-1$/.test(id))return{card:1};
 if(/^(carrom|rummy|spades|five-dice|farkle|dominoes|backgammon|crown-court)-victory-5$/.test(id))return{pack:2};
 if(/^(carrom|rummy|spades|five-dice|farkle|dominoes|backgammon|crown-court)-victory-10$/.test(id))return{pack:3};
 if(/^(carrom|rummy|spades|five-dice|farkle|dominoes|backgammon|crown-court)-(hard|rivals)-10$/.test(id))return{pack:4};
 const special:Record<string,CardStars>={'faith-clear-10':1,'faith-clear-25':2,'faith-clear-100':3,'faith-clear-280':4,'gems-clear-15':1,'gems-clear-30':2,'gems-clear-100':3,'gems-clear-200':4,'member-explorer-4':2,'member-explorer-9':4,'member-explorer-10':4};return special[id]?{pack:special[id]}:null;
}
