import { readFileSync } from 'node:fs';
import { deckArtUrl } from '../src/lib/card-decks';
import { SHARED_DECKS, PLAYING_CARDS, PLAYING_CARDS_WITH_JOKERS } from '../src/lib/playing-decks';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardArtwork, CardDeckProvider } from '../src/components/CardArtwork';
import { CLASSIC_DECK, SPADES_DECKS } from '../src/lib/spades-cosmetics';
import { deckArtIndex, RUMMY_DECK, RUMMY_DECKS } from '../src/lib/card-decks';

describe('painted playing-card decks', () => {
  it('gives every ace, court and joker its own painting while number cards retain exact pip counts', () => {
    const unique = [...'AJQK'].flatMap(rank => [...'SHDC'].map(suit => deckArtIndex(rank + suit)));
    unique.push(deckArtIndex('X1'), deckArtIndex('X2'), deckArtIndex('2S'), deckArtIndex(undefined, true));
    expect([...new Set(unique)].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    for (const deck of [RUMMY_DECK, ...SPADES_DECKS]) for (const suit of 'SHDC') for (let rank = 2; rank <= 10; rank++) {
      const markup = renderToStaticMarkup(createElement(CardArtwork, { deck, card: (rank === 10 ? 'T' : String(rank)) + suit }));
      // Includes the two standard corner suit indices, independent of painting.
      expect(markup.match(/data-suit-mark=/g)).toHaveLength(rank + 2);
    }
  });
  it('keeps the entire back independent of the concealed card', () => {
    for (const deck of [CLASSIC_DECK, ...SPADES_DECKS]) {
      const output = ['AS', 'QH', '7D', 'KC', 'X2'].map(card => renderToStaticMarkup(createElement(CardArtwork, { deck, card, back: true })));
      expect(new Set(output).size).toBe(1);
      expect(output[0]).toContain('data-painted-panel="19"');
      expect(output[0]).not.toContain('data-suit-mark');
      expect(output[0]).toContain(`${deck.name} card back`);
    }
  });
  it('applies an equipped Rummy deck to hands, piles and portals through context, with explicit Spades overrides', () => {
    const markup = renderToStaticMarkup(createElement(CardDeckProvider, { deck: RUMMY_DECKS[0]!, children: [
      createElement(CardArtwork, { key: 'hand', card: 'KH' }),
      createElement(CardArtwork, { key: 'stock', back: true }),
      createElement(CardArtwork, { key: 'override', card: 'AS', deck: CLASSIC_DECK }),
    ] }));
    expect(markup.match(/data-deck="card-deck-standard"/g)).toHaveLength(2);
    expect(markup).toContain('data-deck="spades-deck-classic"');
  });
  it('provides 52 unique French-suited faces and two jokers for each shared deck', () => {
    expect(PLAYING_CARDS).toHaveLength(52); expect(new Set(PLAYING_CARDS_WITH_JOKERS).size).toBe(54);
    expect(SHARED_DECKS).toHaveLength(12);
    for (const deck of SHARED_DECKS) {
      expect(deck.price).toBe(450);
      for (const card of PLAYING_CARDS_WITH_JOKERS) {
        const markup = renderToStaticMarkup(createElement(CardArtwork, { deck, card }));
        expect(markup).toContain(`data-deck="${deck.id}"`);
        expect(markup).toContain('data-painted-panel=');
        expect(markup).not.toContain('undefined');
      }
    }
  });
  it('uses all four suit colors on pip faces and both court indices', () => {
    const deck = SHARED_DECKS.find(deck => deck.motif === 'four-color')!;
    for (const [suit, color] of Object.entries(deck.suitColors!)) for (const rank of 'A23456789TJQK') {
      const markup = renderToStaticMarkup(createElement(CardArtwork, { deck, card: rank + suit }));
      expect(markup).toContain(`color:${color}`);
      expect(markup).toContain(`data-suit-mark="${suit}"`);
    }
  });

  it('ships the atlas used by every selectable deck', () => {
    for (const deck of [RUMMY_DECK, ...SHARED_DECKS]) {
      const image = readFileSync(new URL('../public' + deckArtUrl(deck), import.meta.url));
      expect(image.toString('ascii', 0, 4)).toBe('RIFF');
      expect(image.toString('ascii', 8, 12)).toBe('WEBP');
      expect(image.length).toBeGreaterThan(20000);
    }
  });

});
