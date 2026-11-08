import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_WIN_POINTS, PREVIOUS_CARD_WIN_POINTS, validCardRewardAmount } from '../src/lib/reward-rates';
import { WIN_POINTS } from '../src/lib/rummy';
import { SPADES_POINTS } from '../src/lib/spades';
import { ECONOMY_CATALOG, CONVERSION_RATE, puzzleLevelPoints } from '../src/lib/economy-protocol';
import { ACHIEVEMENTS } from '../src/lib/achievement-catalog';

describe('slower earned-currency progression', () => {
  it('uses the requested card win rates while keeping difficulty premiums', () => {
    expect(WIN_POINTS).toEqual({ easy:15, normal:25, hard:35, humans:50 });
    expect(SPADES_POINTS).toEqual(CARD_WIN_POINTS);
    expect(Math.ceil(450 / WIN_POINTS.normal)).toBe(18);
  });
  it('uses reduced positive first-clear rewards at campaign and chapter boundaries', () => {
    expect([1,20,21,40,41,280].map(level=>puzzleLevelPoints('faith-3',level))).toEqual([12,12,15,15,17,45]);
    expect([1,40,41,80,81,120,121,160,161,200].map(level=>puzzleLevelPoints('3-gems',level))).toEqual([10,10,20,20,30,30,40,40,50,50]);
    for (const [game,max] of [['faith-3',280],['3-gems',200]] as const) {
      const rewards=Array.from({length:max},(_,i)=>puzzleLevelPoints(game,i+1));
      expect(rewards.every((value,i)=>Number.isSafeInteger(value)&&value>0&&(i===0||value>=rewards[i-1]!))).toBe(true);
    }
  });
  it('acknowledges receipts committed under the immediately previous card schedule', () => {
    for (const tier of ['easy','normal','hard','humans'] as const) {
      expect(validCardRewardAmount(tier,PREVIOUS_CARD_WIN_POINTS[tier])).toBe(true);
      expect(validCardRewardAmount(tier,CARD_WIN_POINTS[tier])).toBe(true);
      expect(validCardRewardAmount(tier,999)).toBe(false);
    }
  });
  it('reduces game achievement awards and their Cash bonuses while keeping membership awards', () => {
    const badge=(id:string)=>ACHIEVEMENTS.find(item=>item.id===id)!;
    expect(badge('faith-clear-1')).toMatchObject({reward:25,cashReward:5});
    expect(badge('gems-clear-200')).toMatchObject({reward:3250,cashReward:500});
    expect(badge('rummy-victory-1')).toMatchObject({reward:50,cashReward:8});
    expect(badge('spades-victory-100')).toMatchObject({reward:2500,cashReward:385});
    expect(badge('member-profile-1')).toMatchObject({reward:50,currency:'points'});
    expect(badge('member-days-365')).toMatchObject({reward:5000,currency:'points'});
  });
  it('leaves every existing Store price and the exchange rate exactly unchanged', () => {
    const before=JSON.parse(readFileSync(new URL('./fixtures/store-prices-before-rebalance.json',import.meta.url),'utf8'));
    expect(ECONOMY_CATALOG.filter(item=>item.id!=='five-dice-party').map(({id,price,cashPrice,currency})=>({id,price,cashPrice,currency}))).toEqual(before);
    expect(ECONOMY_CATALOG.find(item=>item.id==='five-dice-party')).toMatchObject({price:600,cashPrice:462,currency:'dice_points'});
    expect(CONVERSION_RATE).toEqual({points:13,cash:10});
  });
});
