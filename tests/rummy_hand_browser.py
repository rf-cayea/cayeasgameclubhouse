"""Rummy hand-management browser checks against the local app.

Requires the prepared cloud image's Python Playwright and system Chromium.
No member account, purchases, rewards, or remote backend are used.
"""
import argparse
from functools import lru_cache
import json
import re
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

RANKS = 'A23456789TJQK'
SUITS = 'SHDC'


def order(page):
    return page.get_by_role('list', name='Your hand', exact=True).locator('[data-card]').evaluate_all(
        'items => items.map(item => item.dataset.card)')


def expect_order(page, cards):
    page.wait_for_function('''expected => {
      const hand = document.querySelector('ol[aria-label="Your hand"]');
      return hand && JSON.stringify([...hand.querySelectorAll('[data-card]')].map(item => item.dataset.card)) === JSON.stringify(expected);
    }''', arg=cards)


def assert_permutation(before, after):
    assert len(before) == len(after) and sorted(before) == sorted(after), (before, after)
    assert len(set(after)) == len(after), after


def nonjoker_deadwood(cards, variant):
    """Independent exhaustive oracle for the browser's ordinary 10/13-card deal."""
    assert all(card[0] != 'X' for card in cards)
    n = len(cards)
    candidates = []
    for mask in range(1, 1 << n):
        chosen = [cards[i] for i in range(n) if mask & (1 << i)]
        if len(chosen) < 3:
            continue
        ranks = [RANKS.index(card[0]) + 1 for card in chosen]
        suited = len(set(card[1] for card in chosen)) == 1
        run = suited and max(ranks) - min(ranks) + 1 == len(ranks)
        if suited and variant == 'r500' and 1 in ranks:
            high = [14 if rank == 1 else rank for rank in ranks]
            run = run or max(high) - min(high) + 1 == len(high)
        same = len(chosen) <= 4 and len(set(ranks)) == 1
        if same or run:
            candidates.append(mask)

    def value(card):
        rank = RANKS.index(card[0]) + 1
        return (15 if rank == 1 else 10 if rank >= 10 else 5) if variant == 'r500' else min(rank, 10)

    @lru_cache(None)
    def solve(mask):
        if not mask:
            return 0
        first = (mask & -mask).bit_length() - 1
        result = value(cards[first]) + solve(mask & ~(1 << first))
        for meld in candidates:
            if meld & (1 << first) and meld & mask == meld:
                result = min(result, solve(mask ^ meld))
        return result

    return solve((1 << n) - 1)


def card_button(page, position):
    return page.get_by_role('list', name='Your hand', exact=True).locator('[data-card]').nth(position).get_by_role('button')


def mouse_drag(page, source, target, outside=False):
    start = card_button(page, source).bounding_box()
    end = card_button(page, target).bounding_box()
    assert start and end
    sx, sy = start['x'] + 5, start['y'] + start['height'] / 2
    ex, ey = end['x'] + 5, end['y'] + end['height'] / 2
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(sx + 9, sy, steps=3)
    page.mouse.move(ex, sy if not outside else start['y'] - 45, steps=12)
    if not outside:
        page.mouse.move(ex, ey, steps=3)
    page.mouse.up()


def touch_drag(page, session, source, target, long_press=True):
    card_button(page, source).scroll_into_view_if_needed()
    start = card_button(page, source).bounding_box()
    end = card_button(page, target).bounding_box()
    assert start and end
    sx, sy = start['x'] + 5, start['y'] + start['height'] / 2
    ex, ey = end['x'] + 5, end['y'] + end['height'] / 2
    session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': sx, 'y': sy}]})
    if long_press:
        page.wait_for_timeout(300)
    for step in range(1, 11):
        session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{
            'x': sx + (ex - sx) * step / 10, 'y': sy + (ey - sy) * step / 10,
        }]})
        page.wait_for_timeout(18)
    session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def run(base_url):
    checks = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1100})
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base_url + '/games/rummy')
        expect(page.get_by_role('heading', name='Rummy+', exact=True)).to_be_visible()
        page.get_by_role('button', name='Hand practice', exact=True).click()
        hand = page.get_by_role('list', name='Your hand', exact=True)
        expect(hand.locator('[data-card]')).to_have_count(10)
        initial = order(page)
        assert len(set(initial)) == 10
        expect(page.get_by_role('button', name='Undo arrangement', exact=True)).to_be_disabled()
        expect(page.get_by_role('checkbox', name='Joker Mode', exact=True)).to_be_disabled()
        checks.append('ten unique cards, undo reset, and paid Joker Mode stays locked without ownership')

        card_button(page, 0).scroll_into_view_if_needed()
        mouse_drag(page, 0, 2)
        moved = initial[1:3] + initial[:1] + initial[3:]
        expect_order(page, moved)
        assert_permutation(initial, order(page))
        page.get_by_role('button', name='Undo arrangement', exact=True).click()
        expect_order(page, initial)
        checks.append('real mouse drag reorders without lost cards and undo restores the prior order')

        card_button(page, 0).focus()
        page.keyboard.press('Space')
        expect(page.get_by_role('status').filter(has_text='over position 1 of 10.')).to_be_visible()
        page.keyboard.press('ArrowRight')
        expect(page.get_by_role('status').filter(has_text='over position 2 of 10.')).to_be_visible()
        page.keyboard.press('Space')
        expect_order(page, [initial[1], initial[0], *initial[2:]])
        page.get_by_role('button', name='Undo arrangement', exact=True).click()
        expect_order(page, initial)
        checks.append('keyboard Space/Arrow/Space moves a card with the same ordering semantics')

        card_button(page, 0).focus()
        page.keyboard.press('Space')
        expect(page.get_by_role('status').filter(has_text='over position 1 of 10.')).to_be_visible()
        page.keyboard.press('ArrowRight')
        expect(page.get_by_role('status').filter(has_text='over position 2 of 10.')).to_be_visible()
        page.keyboard.press('Escape')
        expect_order(page, initial)
        mouse_drag(page, 0, 2, outside=True)
        expect_order(page, initial)
        checks.append('Escape and dropping outside the hand cancel without changing cards')

        card_button(page, 1).click(position={'x':5,'y':25})
        page.get_by_role('button', name='Move selected card left', exact=True).click()
        expect_order(page, [initial[1], initial[0], *initial[2:]])
        page.get_by_role('button', name='Undo arrangement', exact=True).click()
        expect_order(page, initial)
        checks.append('explicit move controls provide a drag-free alternative')

        page.get_by_role('button', name='Sort by rank', exact=True).click()
        ranked = order(page)
        assert_permutation(initial, ranked)
        assert [RANKS.index(card[0]) for card in ranked] == sorted(RANKS.index(card[0]) for card in ranked)
        page.get_by_role('button', name='Sort by suit', exact=True).click()
        suited = order(page)
        assert_permutation(initial, suited)
        suit_groups = [card[1] for card in suited]
        assert len([suit for index, suit in enumerate(suit_groups) if index == 0 or suit_groups[index - 1] != suit]) == len(set(suit_groups))
        checks.append('rank and suit sorts preserve the hand and group their advertised keys')

        for variant, count in [('classic', 10), ('gin', 10), ('r500', 13)]:
            page.get_by_label('Rummy variant', exact=True).select_option(variant)
            expect(hand.locator('[data-card]')).to_have_count(count)
            before = order(page)
            expected_dw = nonjoker_deadwood(before, variant)
            page.get_by_role('button', name='Best sort', exact=True).click()
            best = order(page)
            assert_permutation(before, best)
            expect(page.get_by_test_id('deadwood')).to_have_text(f'Lowest deadwood: {expected_dw} points')
            page.get_by_role('button', name='Best sort', exact=True).click()
            expect_order(page, best)
            checks.append(f'{variant} Best sort matches an independent deadwood optimum and is idempotent')

        page.get_by_role('button', name='Deal a new hand', exact=True).click()
        expect(hand.locator('[data-card]')).to_have_count(13)
        expect(page.get_by_role('button', name='Undo arrangement', exact=True)).to_be_disabled()
        page.screenshot(path='/tmp/rummy-hand-desktop.png', full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        checks.append('new deals retain the selected variant, clear arrangement history, and fit desktop width')
        context.close()

        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
        page = mobile.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base_url + '/games/rummy')
        page.get_by_role('button', name='Hand practice', exact=True).click()
        hand = page.get_by_role('list', name='Your hand', exact=True)
        expect(hand.locator('[data-card]')).to_have_count(10)
        initial = order(page)
        session = mobile.new_cdp_session(page)
        touch_drag(page, session, 0, 2, long_press=True)
        expect_order(page, initial[1:3] + initial[:1] + initial[3:])
        assert_permutation(initial, order(page))
        page.get_by_role('button', name='Undo arrangement', exact=True).click()
        expect_order(page, initial)
        checks.append('long-press touch drag reorders the mobile hand without losing cards')

        touch_drag(page, session, 0, 2, long_press=False)
        expect_order(page, initial)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile page overflowed'
        page.evaluate('scrollTo(0,0)')
        page.screenshot(path='/tmp/rummy-hand-mobile.png', full_page=True)
        checks.append('short touch swipes do not accidentally reorder and mobile content remains within page width')
        mobile.close()
        browser.close()
    assert not errors, errors
    result = {'passed_checks': checks, 'browser_errors': errors}
    with open('/tmp/rummy-hand-browser-results.json', 'w') as handle:
        json.dump(result, handle, indent=2)
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5176')
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1'), 'Only local app servers are supported.'
    run(args.base_url.rstrip('/'))
