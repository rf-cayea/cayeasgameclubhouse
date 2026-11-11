import { describe, expect, it } from 'vitest';
import { smartRummySort } from '../src/lib/rummy-smart-sort';
import { analyseHand } from '../src/lib/rummy-engine';
import { rummyAnnouncement } from '../src/lib/rummy-announcements';
import type { RoomView } from '../src/lib/rummy-protocol';

describe('smart Rummy hand sort', () => {
  it('keeps optimal made melds together, pairs nearby, and isolated high cards last', () => {
    const hand = ['KH','5S','9D','3S','7H','4S','9C','8H','2C'];
    const before = [...hand], result = smartRummySort(hand, 'gin');
    expect(result.melds).toContainEqual(['3S','4S','5S']);
    expect(result.nearMelds).toContainEqual(['7H','8H']);
    expect(result.nearMelds.some(pair => pair.includes('9D') && pair.includes('9C'))).toBe(true);
    expect(result.cards.at(-1)).toBe('KH');
    expect(result.cards.slice(0,3)).toEqual(['3S','4S','5S']);
    expect(result.dw).toBe(analyseHand(hand, 'gin').dw);
    expect(hand).toEqual(before);
    expect(smartRummySort(result.cards, 'gin').cards).toEqual(result.cards);
  });
  it('preserves every physical card, joker and ace at either legal end across variants and large hands', () => {
    for (const variant of ['classic','r500','gin'] as const) {
      const hand = ['AS','2S','3S','QH','KH','AH','7C','7D','X1','9S','JD'];
      const result = smartRummySort(hand, variant);
      expect([...result.cards].sort()).toEqual([...hand].sort());
      expect(new Set(result.cards).size).toBe(hand.length);
      expect(result.dw).toBe(analyseHand(hand,variant).dw);
      expect(smartRummySort([...hand].reverse(),variant).cards).toEqual(result.cards);
    }
    const large = [...'SHDC'].flatMap(suit => [...'A23456789TJQK'].map(rank => rank+suit)).slice(0,28);
    expect(smartRummySort(large,'r500').cards.sort()).toEqual(large.sort());
    expect(smartRummySort([],'classic').cards).toEqual([]);
  });
});

describe('Rummy round announcements', () => {
  const room = (announcement?: { kind:'knock'|'gin'|'out';seat:number;deadwood?:number }, note='') => ({code:'ABCD1234',round:3,status:'playing',phase:'roundOver',players:[{name:'Alice'},{name:'Bob'}],roundResult:{winner:0,points:[25,0],note,announcement}} as RoomView);
  it('announces the knocker rather than the undercut winner', () => {
    expect(rummyAnnouncement(room({kind:'knock',seat:1,deadwood:7}))).toMatchObject({title:'KNOCK!',name:'Bob',detail:'Undercut by Alice'});
    expect(rummyAnnouncement(room({kind:'gin',seat:0}))).toMatchObject({title:'GIN!',name:'Alice'});
    expect(rummyAnnouncement(room({kind:'out',seat:1}))).toMatchObject({title:'WENT OUT!',name:'Bob'});
  });
  it('supports legacy completed tables, but never celebrates an exhausted or abandoned round', () => {
    expect(rummyAnnouncement(room(undefined,'Alice knocked (5 deadwood). Alice scores 12.'))).toMatchObject({kind:'knock',name:'Alice'});
    expect(rummyAnnouncement(room(undefined,'Bob went out.'))).toMatchObject({kind:'out',name:'Bob'});
    expect(rummyAnnouncement(room(undefined,'Stock exhausted. Round scored.'))).toBeNull();
    expect(rummyAnnouncement({...room({kind:'out',seat:0}),status:'abandoned'})).toBeNull();
    expect(rummyAnnouncement({...room({kind:'out',seat:0}),phase:'play'})).toBeNull();
    expect(rummyAnnouncement(room({kind:'out',seat:9}))).toBeNull();
  });
});
