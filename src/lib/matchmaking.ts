export const MATCH_GAMES = ['carrom','backgammon','rummy','spades','five-dice','farkle','crown-court','dominoes'] as const;
export type MatchGame = typeof MATCH_GAMES[number];
export const MATCH_GAME_NAMES: Record<MatchGame,string> = {carrom:'Carrom & Disc Pool',backgammon:'Backgammon',rummy:'Rummy+',spades:'Spades','five-dice':'Quintsee',farkle:'Farkle','crown-court':'Crown & Court',dominoes:'Dominoes'};
export const MATCH_PATHS = {carrom:'/games/carrom',backgammon:'/games/backgammon',rummy:'/games/rummy',spades:'/games/spades','five-dice':'/games/quintsee',farkle:'/games/farkle','crown-court':'/games/crown-court',dominoes:'/games/dominoes'} as const;
export interface MatchListing { code:string;host:string;mode:string;variant:string;seats:number;occupied:number;ready:number;details:string;mine:boolean;locked:boolean;requirement:string|null;createdAt:number;jokers?:boolean;target?:number }
export interface MatchList {rooms:MatchListing[];serverTime:number}
export function matchRoomKey(game:MatchGame,userId:string|null){return game==='rummy'||game==='spades'?`cayea-${game}-room`:`clubhouse-${game}:${userId??'guest'}:room`;}

export interface MatchPreferences {variant:string;seats?:number;jokers?:boolean;target?:number}
export function matchesMatchPreferences(room:MatchListing,p:MatchPreferences){return room.variant===p.variant&&(p.seats===undefined||room.seats===p.seats)&&(p.jokers===undefined||(room.jokers??false)===p.jokers)&&(p.target===undefined||room.target===p.target);}
