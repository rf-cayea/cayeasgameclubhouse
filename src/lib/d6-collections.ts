/** Original Clubhouse artwork; every design is a permanent shared D6 finish. */
export const D6_COLLECTIONS = [
  ['rainbow','Rainbow'],['dessert','Desserts'],['fruit','Fruit'],['fabric','Fabrics'],['animal','Animals'],['material','Materials'],['sport','Sports'],
] as const;
export type D6Collection = typeof D6_COLLECTIONS[number][0];
export interface CollectionDice {
  id:string; name:string; price:number; face:string; light:string; edge:string; pip:string; symbol:'dot';
  collection:D6Collection; motif:string; accent:string; description:string;
}
type Recipe = [key:string,name:string,face:string,pip:string,accent:string];
const recipes:Record<D6Collection,Recipe[]> = {
 rainbow:[['rose','Candy Rose','#e82674','#fff5ee','#ff9fd5'],['tangerine','Tangerine Glow','#f19307','#38290d','#ffd85b'],['lemon','Lemon Drop','#eed31a','#343b13','#fff493'],['lime','Lime Pop','#82b32d','#fffaf2','#c2e977'],['aqua','Lagoon Aqua','#39b5cd','#142b4d','#baf5fc'],['blue','Blue Skies','#639aed','#ffffff','#c7dcff'],['orchid','Orchid Bloom','#b350c8','#fff4fe','#f3b2fc'],['spectrum','Prism Spectrum','#5551bb','#171b35','#fce49e']],
 dessert:[['chocolate','Cocoa Bar','#673d30','#fff6dc','#a46b4e'],['cookie','Chocolate Chip Cookie','#d7a366','#352215','#70412b'],['cupcake','Birthday Cupcake','#f4d0df','#512438','#c94f8b'],['pie','Cherry Lattice Pie','#ce9267','#52291d','#f5d798'],['waffle','Honey Waffle','#deb26d','#422909','#fff0bc'],['cake','Strawberry Layer Cake','#ed889d','#581b30','#fff0dc'],['sundae','Neapolitan Sundae','#e6b5a3','#4f2431','#fbecbc'],['sandwich','Ice Cream Sandwich','#754e3d','#fff4d8','#e7c6a1']],
 fruit:[['apple','Orchard Apple','#9ebe43','#24380e','#d5ea8b'],['cherry','Cherry Orchard','#cf3a47','#fff7dc','#7b1527'],['kiwi','Kiwi Slice','#b8d365','#273b0e','#fbf3bd'],['orange','Orange Grove','#ed9c36','#432909','#ffe594'],['strawberry','Strawberry Patch','#d7495b','#fff9e0','#ffbb93'],['pear','Golden Pear','#c5ba3b','#32380e','#f4e48c'],['lemon','Citrus Zest','#e9cd4b','#3e350b','#fff7b5'],['melon','Watermelon Picnic','#ec7c78','#382317','#65a56c']],
 fabric:[['linen','Natural Linen','#c9bea5','#332c20','#eee4cb'],['silk','Crimson Silk','#8e2939','#fff2bd','#e5b65d'],['knit','Winter Nordic Knit','#ad3f4b','#fff9eb','#efb6b0'],['denim','Indigo Denim','#3e6788','#fff8e4','#a9c9d5'],['weave','Autumn Loom','#c2a086','#392c32','#e7d0aa'],['plaid','Lumberjack Plaid','#b64f3e','#fff3d4','#292d31'],['brocade','Royal Brocade','#46445d','#fff3d0','#c3b188'],['tartan','Seaglass Tartan','#3b7772','#fff5df','#be9b85']],
 animal:[['cat','Ginger Tabby','#d39859','#352315','#f6dfb5'],['chick','Sunny Chick','#f2dfa0','#403313','#e4a337'],['cow','Meadow Cow','#f0e7d7','#272635','#44414d'],['tuxedo','Midnight Tuxedo','#333b4a','#fff8dc','#b4bdcf'],['pony','Chestnut Pony','#b68153','#fff5dc','#683c2c'],['mouse','Silver Mouse','#a4a6b8','#302939','#e8bac8'],['pig','Rosebud Pig','#e9a2b6','#602e42','#ffd6d7'],['sheep','Cloud Sheep','#e9e1c6','#352e29','#a39b87']],
 material:[['glass','Glacier Glass','#9cc9d7','#183e55','#e2faff'],['gold','Brushed Gold','#d2ae48','#49360d','#fff2a7'],['leather','Saddle Leather','#a77254','#fff4d4','#563625'],['marble','Carrara Marble','#dddfe3','#343e51','#9a9ca9'],['copper','Weathered Copper','#b67e50','#fff2ce','#507c73'],['steel','Diamond Steel','#8b9aaa','#1c273c','#dde6ed'],['water','Ripple Water','#269bb9','#f4ffff','#a6f4ed'],['wood','Old Oak','#9b7856','#fff3cf','#4d3726']],
 sport:[['baseball','Clubhouse Baseball','#eee5d3','#282d3c','#b54c48'],['basketball','Courtside Basketball','#d68739','#302113','#623b26'],['football','Gridiron Football','#86523f','#fff3d8','#dbb698'],['tennis','Match Point Tennis','#b7cc3e','#25351b','#f1f3bb'],['golf','Sunday Golf','#e3e6de','#234236','#a6bdac'],['soccer','Stadium Football','#ede9dd','#25313e','#697e96'],['bowling','Cosmic Bowling','#644e9f','#fff2d6','#b391dd'],['rugby','Club Rugby','#d8a265','#432e1d','#f3e6c0']],
};
export const COLLECTION_D6_DICE:CollectionDice[] = D6_COLLECTIONS.flatMap(([collection])=>recipes[collection].map(([motif,name,face,pip,accent])=>({
 id:`farkle-dice-${collection}-${motif}`,name,price:collection==='rainbow'?150:250,face,light:accent,edge:collection==='rainbow'?'#fff3b7':accent,pip,symbol:'dot' as const,collection,motif,accent,
 description:`${name}: original ${collection==='rainbow'?'glossy color':collection} artwork with recessed, contrasting pips. One purchase equips the complete six-sided set in Farkle and Quintsee.`,
})));
