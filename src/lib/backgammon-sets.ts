export interface BGDesign{id:string;name:string;price:number;slot:'bg_board'|'bg_checkers';rail:string;felt:string;point:string;alternate:string;gold:string;ivory:string;accent:string;motif:'classic'|'compass'|'lotus'|'stars'|'crown'|'wave'|'scarab'|'bamboo'|'sun'|'moon'|'knot'|'flame'|'peak'|'rose'|'shell'|'snow'|'anchor'|'leaf'|'feather'|'hourglass'|'gate'}
export const BG_CLASSIC:BGDesign={id:'bg-board-classic',name:'Clubhouse Walnut',price:0,slot:'bg_board',rail:'#492d20',felt:'#285241',point:'#d3b17a',alternate:'#72452e',gold:'#c69a4f',ivory:'#f3e2bf',accent:'#efd39a',motif:'classic'};
export const BG_CLASSIC_CHIPS:BGDesign={...BG_CLASSIC,id:'bg-checkers-classic',name:'Classic Brass & Ivory',slot:'bg_checkers'};
const themes:[string,string,string,string,string,string,string,BGDesign['motif']][]=[
 ['admiralty','Admiralty Compass','#193650','#173f52','#d2b279','#416d83','#e4c272','compass'],
 ['lotus','Jade Lotus','#234b40','#173d32','#86bfa4','#d4be83','#c7e0b0','lotus'],
 ['celestial','Celestial Observatory','#262346','#151d38','#b49dd8','#526486','#d5c1f1','stars'],
 ['imperial','Imperial Court','#56222e','#341c2e','#d6a354','#8d3c4e','#f1d18a','crown'],
 ['tidal','Tidal Pearl','#174550','#145063','#b3ded9','#3792a0','#e5efe3','wave'],
 ['pharaoh','Pharaoh’s Treasury','#543424','#174951','#dfbb64','#a36535','#ffe09b','scarab'],
 ['bamboo','Bamboo Pavilion','#3c4b2c','#2b4937','#c5d7a2','#74975a','#dbe8b6','bamboo'],
 ['solstice','Copper Solstice','#593b2f','#452e2a','#e6b473','#9e6244','#ffda96','sun'],
 ['moonstone','Moonstone Garden','#343e55','#25364a','#ced4e3','#6b7c97','#f3e8ff','moon'],
 ['celtic','Celtic Oak','#394331','#243c34','#cbb980','#70835a','#eddba8','knot'],
 ['ember','Ember Forge','#412322','#331e20','#df934f','#8c493d','#ffd0a0','flame'],
 ['alpine','Alpine Pass','#243e53','#244653','#d5e7ed','#5e8c9e','#daf5ff','peak'],
 ['rosewood','Rosewood Conservatory','#522b3e','#413041','#e1a7ba','#855473','#ffe1e9','rose'],
 ['abalone','Abalone Coast','#193d42','#264f51','#a8d9cb','#50848c','#e0fff2','shell'],
 ['frost','Frostglass','#2d3c66','#293456','#c2d8f8','#6a83b7','#e0edff','snow'],
 ['harbor','Brass Harbor','#1d3543','#243b4c','#dcb26f','#5e7a83','#ffe0a5','anchor'],
 ['maple','Crimson Maple','#542c22','#48382a','#e2a16b','#9c5947','#ffd5a0','leaf'],
 ['peacock','Peacock Pavilion','#23404a','#193c40','#a1cfb9','#52729d','#d4f6e0','feather'],
 ['sands','Sands of Time','#574130','#493e36','#e5be87','#a38262','#ffe4b4','hourglass'],
 ['midnight','Midnight Gate','#29273e','#252739','#b9a4d4','#655e86','#ece0ff','gate'],
];
export const BG_BOARDS:BGDesign[]=themes.map(([key,name,rail,felt,point,alternate,accent,motif])=>({...BG_CLASSIC,id:`bg-board-${key}`,name,price:300,rail,felt,point,alternate,accent,motif}));
export const BG_CHECKERS:BGDesign[]=themes.map(([key,name,rail,felt,point,alternate,accent,motif])=>({...BG_CLASSIC,id:`bg-checkers-${key}`,name:`${name} checkers`,slot:'bg_checkers',price:150,rail,felt,point,alternate,accent,motif,gold:point,ivory:motif==='moon'?'#e2c3ef':motif==='lotus'?'#b8e5d0':motif==='wave'?'#d8f2f3':'#f2e7d0'}));
export const BG_COLLECTIBLES=[...BG_BOARDS,...BG_CHECKERS];
export const bgBoard=(id?:string)=>BG_BOARDS.find(d=>d.id===id)??BG_CLASSIC;
export const bgChips=(id?:string)=>BG_CHECKERS.find(d=>d.id===id)??BG_CLASSIC_CHIPS;
