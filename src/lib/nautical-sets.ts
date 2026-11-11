/** Four matching nautical finishes; each game's ownership stays independent. */
export const NAUTICAL_FINISHES = [
  { key:'seahorse', name:'Golden Seahorse', price:250, face:'#123e40', light:'#286463', edge:'#09282b', pip:'#ffc35c', symbol:'seahorse', description:'Golden-orange seahorses with curled tails and coral ridges on deep sea-glass teal.' },
  { key:'starfish', name:'Coral Starfish', price:250, face:'#f3dfb4', light:'#fff5da', edge:'#af8951', pip:'#b63b31', symbol:'starfish', description:'Natural coral sea stars with rounded, tapering arms and a pebbled surface on warm beach sand.' },
  { key:'clownfish', name:'Clownfish Cove', price:250, face:'#123546', light:'#28546a', edge:'#08232e', pip:'#ff9a32', symbol:'clownfish', description:'Bright orange clownfish, ivory bands and dark fins against deep lagoon blue.' },
  { key:'trident', name:'Neptune’s Trident', price:250, face:'#0754a0', light:'#2689d1', edge:'#052b64', pip:'#ffe49a', symbol:'trident', description:'Neptune’s gold tridents with bold forked tips on ocean-blue enamel.' },
] as const;
export const NAUTICAL_BUNDLE_PRICE = 800;
export const NAUTICAL_BUNDLES = [
  { id:'farkle-nautical-bundle', name:'Shared D6 Nautical Collection · 4 dice sets', currency:'dice_points', items:NAUTICAL_FINISHES.map(item=>`farkle-dice-nautical-${item.key}`) },
  { id:'domino-nautical-bundle', name:'Dominoes Nautical Collection · 4 tile sets', currency:'domino_points', items:NAUTICAL_FINISHES.map(item=>`domino-skin-nautical-${item.key}`) },
] as const;
export const nauticalBundle = (id:string) => NAUTICAL_BUNDLES.find(item=>item.id===id);
