/** Original Clubhouse mandala artwork, shared by matching boards, pucks and strikers. */
export const CARROM_MANDALAS = [
  {key:'lotus',name:'Lotus Aurora',art:0,description:'Pearl lotus petals, jade enamel and rose-gold filigree.',frame:'#294e45',trim:'#dba67f',surface:'#fff4e7',shade:'#d2bfa8',ink:'#4e6559',face:'#19785e',dark:'#123c30',accent:'#f3c998'},
  {key:'celestial',name:'Celestial Sapphire',art:1,description:'Lapis starbursts, golden compass rosettes and celestial inlay.',frame:'#192e5c',trim:'#c7a04b',surface:'#edf5ff',shade:'#afc2dd',ink:'#294c77',face:'#234f9a',dark:'#13294c',accent:'#f6d58b'},
  {key:'garden',name:'Emerald Garden',art:2,description:'Malachite leaves, copper lace and a flowering garden medallion.',frame:'#143f32',trim:'#be986c',surface:'#edf9e7',shade:'#a8c7ac',ink:'#315e45',face:'#23724b',dark:'#102f21',accent:'#f0c48b'},
  {key:'amethyst',name:'Amethyst Lace',art:3,description:'Violet gemstones, platinum scallops and delicate layered lace.',frame:'#3f2859',trim:'#c5b4d4',surface:'#f7edff',shade:'#c2b0d5',ink:'#67477c',face:'#834eaf',dark:'#332042',accent:'#f1dbff'},
  {key:'ember',name:'Ember Sun',art:4,description:'Garnet rays, amber beadwork and radiant brass sun petals.',frame:'#59261e',trim:'#dcaa50',surface:'#fff1d7',shade:'#d4ae7a',ink:'#85432c',face:'#ba5328',dark:'#4c1b17',accent:'#ffdb86'},
  {key:'tide',name:'Pearl Tide',art:5,description:'Turquoise waves, pearlescent shell fans and silver ocean scrollwork.',frame:'#204e5c',trim:'#b4d5db',surface:'#eefbf9',shade:'#accbd0',ink:'#365e6a',face:'#278597',dark:'#143b45',accent:'#e0f5f7'},
] as const;
export type CarromMandala = typeof CARROM_MANDALAS[number];
export const CARROM_MANDALA_BUNDLES = [
  ...CARROM_MANDALAS.map(theme=>({id:`carrom-mandala-${theme.key}-bundle`,name:`${theme.name} Collection`,price:456,currency:'dice_points' as const,
    items:[`carrom-board-mandala-${theme.key}`,`carrom-pucks-mandala-${theme.key}`,`carrom-striker-mandala-${theme.key}`]})),
  {id:'carrom-mandala-complete-bundle',name:'Complete Mandala Collection',price:2592,currency:'dice_points' as const,
    items:CARROM_MANDALAS.flatMap(theme=>[`carrom-board-mandala-${theme.key}`,`carrom-pucks-mandala-${theme.key}`,`carrom-striker-mandala-${theme.key}`])},
];
