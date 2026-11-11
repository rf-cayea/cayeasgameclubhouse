import { describe, expect, it } from 'vitest';
import { applyFiveDiceMove, newFiveDice, type FiveDiceActivity, type FiveDiceState } from '../src/lib/five-dice';
import { FIVE_DICE_ROLL_MS, QUINTSEE_CELEBRATION_MS, fiveDiceActivityDuration, fiveDiceActivityFrames, fiveDiceActivityText, fiveDicePresentationCards, isQuintseeRoll } from '../src/lib/five-dice-activity';

const players = [{ id: 'a', name: 'Alice', bot: false }, { id: 'b', name: 'Bob', bot: false }];
const move = (state: FiveDiceState, input: Parameters<typeof applyFiveDiceMove>[2], random = () => .7) => applyFiveDiceMove(state, state.turn, input, random)!;

describe('Quintsee committed move history', () => {
  it('celebrates all six five-of-a-kind faces once on the roll, with time after landing', () => {
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const state = move(newFiveDice(players), { t: 'roll' }, () => (face - .5) / 6);
      const roll = state.activity!.at(-1)!;
      expect(isQuintseeRoll(roll)).toBe(true);
      expect(fiveDiceActivityDuration(roll)).toBe(FIVE_DICE_ROLL_MS + QUINTSEE_CELEBRATION_MS);
      expect(isQuintseeRoll({ ...roll, kind: 'hold' })).toBe(false);
      expect(isQuintseeRoll({ ...roll, kind: 'score', category: 'five-kind', score: 50 })).toBe(false);
      for (const dice of [[0, 0, 0, 0, 0], [7, 7, 7, 7, 7], [1.5, 1.5, 1.5, 1.5, 1.5], [6, 6, 6, 6, 5], [6, 6, 6, 6], []]) {
        expect(isQuintseeRoll({ ...roll, dice })).toBe(false);
        expect(fiveDiceActivityDuration({ ...roll, dice })).toBe(FIVE_DICE_ROLL_MS);
      }
    }
    expect(isQuintseeRoll(null)).toBe(false);
  });
  it('shows every player’s committed score at the correct step without revealing future playback choices', () => {
    let state = move(newFiveDice(players), { t: 'roll' });
    state = move(state, { t: 'score', category: 'chance' });
    state = move(state, { t: 'roll' }, () => 0);
    const opponentRoll = state.activity!.at(-1)!;
    state = move(state, { t: 'score', category: 'chance' });
    const visible = fiveDicePresentationCards(state, opponentRoll);
    expect(visible[0]!.scores.chance).toBe(25);
    expect(visible[1]!.scores.chance).toBeUndefined();
    expect(state.cards[1]!.scores.chance).toBe(5);
    expect(fiveDicePresentationCards(state, state.activity!.at(-1)!)).toEqual(state.cards);
    expect(fiveDicePresentationCards(state, null)).toBe(state.cards);
  });
  it('preserves actual rolls, held dice and scoring faces after the next turn resets the tray', () => {
    const initial = newFiveDice(players), first = move(initial, { t: 'roll' });
    const held = move(first, { t: 'hold', index: 0 }), rerolled = move(held, { t: 'roll' }, () => 0);
    const scored = move(rerolled, { t: 'score', category: 'chance' });
    expect(initial.activity).toEqual([]);
    expect(first.activity).toHaveLength(1);
    expect(scored.activity?.map(event => event.id)).toEqual([1, 2, 3, 4]);
    expect(scored.activity?.map(event => event.kind)).toEqual(['roll', 'hold', 'roll', 'score']);
    expect(scored.activity?.[0]?.dice).toEqual([5, 5, 5, 5, 5]);
    expect(scored.activity?.[1]?.held).toEqual([true, false, false, false, false]);
    expect(scored.activity?.[2]?.dice).toEqual([5, 1, 1, 1, 1]);
    expect(scored.activity?.[3]).toMatchObject({ seat: 0, round: 1, dice: [5, 1, 1, 1, 1], held: [true, false, false, false, false], rolls: 2, category: 'chance', score: 9, total: 9 });
    expect(scored.dice).toEqual([0, 0, 0, 0, 0]);
    expect(scored.turn).toBe(1);
    expect(scored.activity?.[0]?.dice).not.toBe(first.dice);
    expect(scored.activity?.[1]?.held).not.toBe(held.held);
  });

  it('keeps bounded history with monotonic IDs, and supports tables saved without activity fields', () => {
    const legacy = newFiveDice(players); delete legacy.activity; delete legacy.actionSequence;
    let state = move(legacy, { t: 'roll' });
    expect(state.actionSequence).toBe(1);
    for (let index = 0; index < 50; index++) state = move(state, { t: 'hold', index: 0 });
    expect(state.actionSequence).toBe(51);
    expect(state.activity).toHaveLength(32);
    expect(state.activity?.[0]?.id).toBe(20);
    expect(new Set(state.activity?.map(event => event.id)).size).toBe(32);
    expect(applyFiveDiceMove(state, 1, { t: 'roll' })).toBeNull();
    expect(state.actionSequence).toBe(51);
  });

  it('records a genuine zero and five-of-a-kind bonus with the selected category', () => {
    const start = move(newFiveDice(players), { t: 'roll' }, () => 0);
    const zero = move(start, { t: 'score', category: 'sixes' });
    expect(zero.activity?.at(-1)).toMatchObject({ score: 0, category: 'sixes', total: 0 });
    const bonus = move({ ...start, cards: [{ scores: { 'five-kind': 50 }, fiveKindBonuses: 0 }, start.cards[1]!] }, { t: 'score', category: 'ones' });
    expect(bonus.activity?.at(-1)).toMatchObject({ score: 5, bonus: 100, category: 'ones', total: 155 });
    expect(fiveDiceActivityText(bonus.activity!.at(-1)!)).toBe('Ones · +5 + 100 bonus');
  });

  it('groups only consecutive holds on the same player’s roll and never drops a roll or score', () => {
    let state = move(newFiveDice(players), { t: 'roll' });
    state = move(state, { t: 'hold', index: 0 }); state = move(state, { t: 'hold', index: 1 });
    state = move(state, { t: 'roll' }, () => 0); state = move(state, { t: 'hold', index: 2 });
    state = move(state, { t: 'score', category: 'chance' }); state = move(state, { t: 'roll' });
    const frames = fiveDiceActivityFrames(state.activity!);
    expect(frames.map(event => [event.seat, event.kind, event.rolls])).toEqual([[0, 'roll', 1], [0, 'hold', 1], [0, 'roll', 2], [0, 'hold', 2], [0, 'score', 2], [1, 'roll', 1]]);
    expect(frames[1]?.held).toEqual([true, true, false, false, false]);
    expect(state.activity).toHaveLength(7);
    expect(fiveDiceActivityFrames([])).toEqual([]);
  });

  it('describes the held faces and gives the scoring choice time to be read', () => {
    const event: FiveDiceActivity = { id: 1, seat: 1, round: 2, kind: 'hold', dice: [6, 2, 6, 3, 6], held: [true, false, true, false, true], rolls: 1, total: 0 };
    expect(fiveDiceActivityText(event)).toBe('Holding 6 · 6 · 6 — 2 dice to reroll');
    expect(fiveDiceActivityText({ ...event, held: [false, false, false, false, false] })).toBe('Released all dice');
    expect(fiveDiceActivityDuration({ ...event, kind: 'roll' })).toBeGreaterThanOrEqual(800);
    expect(fiveDiceActivityDuration({ ...event, kind: 'score' })).toBeGreaterThan(1000);
  });
});
