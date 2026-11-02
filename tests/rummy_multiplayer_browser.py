"""Real, unmocked multiplayer and table appearance tests.

Start the full app with npm run dev; this uses separate cookie jars for players.
No live Supabase project, reward grants, or test-only game endpoints are used.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


def cards(page):
    return page.get_by_role('list', name='Your hand', exact=True).locator('[data-card]')


def order(page):
    return cards(page).evaluate_all('nodes => nodes.map(node => node.dataset.card)')


def draw_discard(page):
    page.get_by_role('button', name='Draw from stock', exact=True).click()
    expect(cards(page)).to_have_count(11)
    cards(page).first.get_by_role('button').click()
    page.get_by_role('button', name='Discard selected', exact=True).click()
    expect(cards(page)).to_have_count(10)


def run(base):
    checks, errors = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        one_context = browser.new_context(viewport={'width': 1440, 'height': 1100})
        two_context = browser.new_context(viewport={'width': 1280, 'height': 1000})
        one, two = one_context.new_page(), two_context.new_page()
        for page in (one, two):
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/games/rummy')
        one.get_by_label('Your name', exact=True).fill('Alice')
        one.get_by_label('Play mode', exact=True).select_option('online')
        response = None
        with one.expect_response(lambda response: response.url.endswith('/api/rummy') and response.request.method == 'POST') as create:
            one.get_by_role('button', name='Create online room', exact=True).click()
        response = create.value.json()
        code = response['code']
        expect(one.get_by_role('heading', name='Your table is waiting', exact=True)).to_be_visible()
        two.get_by_label('Your name', exact=True).fill('Bob')
        two.get_by_label('Room code', exact=True).fill(code)
        two.get_by_role('button', name='Join room', exact=True).click()
        expect(two.get_by_role('heading', name='Your table is waiting', exact=True)).to_be_visible()
        expect(one.get_by_text('Bob', exact=False).first).to_be_visible()
        two.get_by_role('button', name='Ready to play', exact=True).click()
        expect(one.get_by_role('button', name='Start game', exact=True)).to_be_enabled()
        one.get_by_role('button', name='Start game', exact=True).click()
        expect(cards(one)).to_have_count(10)
        expect(cards(two)).to_have_count(10)
        expect(two.get_by_text('Your turn', exact=True)).to_be_visible()
        assert not set(order(one)) & set(order(two))
        view_one = one_context.request.get(base + '/api/rummy/room/' + code).json()
        view_two = two_context.request.get(base + '/api/rummy/room/' + code).json()
        assert 'deck' not in view_one and 'hands' not in view_one and view_one['revealedHands'] is None
        assert view_one['hand'] != view_two['hand']
        assert set(view_one['hand']).isdisjoint(view_two['hand'])
        expect(one.get_by_role('button', name='Draw from stock', exact=True)).to_be_disabled()
        checks.append('two independent players join, ready, start, and receive only their private hand')
        draw_discard(two)
        expect(one.get_by_text('Your turn', exact=True)).to_be_visible()
        draw_discard(one)
        expect(two.get_by_text('Your turn', exact=True)).to_be_visible()
        checks.append('real draw/discard turns synchronize across both browsers without a reload')
        before = order(two)
        two.reload()
        expect(cards(two)).to_have_count(10)
        assert set(order(two)) == set(before)
        expect(two.get_by_text('Your turn', exact=True)).to_be_visible()
        checks.append('refresh resumes the saved match, seat, current turn, and hand')
        outside = browser.new_context()
        assert outside.request.get(base + '/api/rummy/room/' + code).status == 403
        outside.close()
        checks.append('a third browser cannot read a room just by knowing its code')

        one.get_by_role('button', name='Leave table', exact=True).click()
        one.get_by_role('button', name='Confirm leave', exact=True).click()
        expect(one.get_by_role('heading', name='Take a seat', exact=True)).to_be_visible()
        expect(two.get_by_text('Table closed — game ended without a winner', exact=True)).to_be_visible()
        checks.append('leaving an active match closes the table for everyone without declaring a winner')

        one.get_by_label('Play mode', exact=True).select_option('bot')
        one.get_by_role('button', name='Start game', exact=True).click()
        expect(cards(one)).to_have_count(10)
        expect(one.get_by_text('Your turn', exact=True)).to_be_visible()
        draw_discard(one)
        expect(one.get_by_text('Your turn', exact=True)).to_be_visible()
        expect(one.get_by_role('button', name='Draw from stock', exact=True)).to_be_enabled()
        checks.append('computer plays a legal full turn and returns control to the human')

        before_order = order(one)
        before_revision = one_context.request.get(base + '/api/rummy/room/' + one.evaluate("sessionStorage.getItem('cayea-rummy-room')")).json()['revision']
        cards(one).first.get_by_role('button').scroll_into_view_if_needed()
        first = cards(one).nth(0).get_by_role('button').bounding_box()
        third = cards(one).nth(2).get_by_role('button').bounding_box()
        x, y = first['x'] + first['width'] / 2, first['y'] + first['height'] / 2
        one.mouse.move(x, y); one.mouse.down()
        one.mouse.move(x + 9, y, steps=3)
        one.mouse.move(third['x'] + third['width'] / 2, third['y'] + third['height'] / 2, steps=12)
        one.mouse.up()
        expected_order = before_order[1:3] + before_order[:1] + before_order[3:]
        one.wait_for_function('expected => JSON.stringify([...document.querySelectorAll("ol[aria-label=\\"Your hand\\"] [data-card]")].map(node => node.dataset.card)) === JSON.stringify(expected)', arg=expected_order)
        undo = one.get_by_role('button', name='Undo arrangement', exact=True)
        undo.scroll_into_view_if_needed()
        undo_box = undo.bounding_box()
        # Move naturally from the drop location to the separate control. The
        # drag sensor briefly suppresses the mouse-up's click to avoid selecting
        # a dropped card; teleporting the test pointer can hit that suppression.
        one.mouse.move(undo_box['x'] + undo_box['width'] / 2, undo_box['y'] + undo_box['height'] / 2, steps=25)
        undo.click()
        one.wait_for_function('expected => JSON.stringify([...document.querySelectorAll("ol[aria-label=\\"Your hand\\"] [data-card]")].map(node => node.dataset.card)) === JSON.stringify(expected)', arg=before_order)
        after_revision = one_context.request.get(base + '/api/rummy/room/' + one.evaluate("sessionStorage.getItem('cayea-rummy-room')")).json()['revision']
        assert before_revision == after_revision
        checks.append('dragging and undo work during a real match without submitting a game move or changing server cards')

        one.get_by_text('Table appearance', exact=True).click()
        one.get_by_label('Felt color', exact=True).select_option('wine')
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#423560"/></svg>'
        one.get_by_label('Room background image', exact=True).set_input_files({'name': 'room.svg', 'mimeType': 'image/svg+xml', 'buffer': svg})
        one.get_by_label('Table surface image', exact=True).set_input_files({'name': 'felt.svg', 'mimeType': 'image/svg+xml', 'buffer': svg})
        one.wait_for_function('getComputedStyle(document.querySelector(".rummy-scene")).backgroundImage.includes("data:image/")')
        one.wait_for_function('getComputedStyle(document.querySelector(".rummy-table")).backgroundImage.includes("data:image/")')
        assert one.locator('main').evaluate('node => getComputedStyle(node).backgroundColor') == 'rgba(0, 0, 0, 0)'
        one.screenshot(path='/tmp/rummy-full-table-desktop.png', full_page=True)
        one.reload()
        expect(cards(one)).to_have_count(10)
        assert one.locator('.rummy-table').evaluate('node => getComputedStyle(node).backgroundImage').find('data:image/') >= 0
        checks.append('room and table artwork remain visible through a transparent outer wrapper and persist on reload')
        one.get_by_text('Table appearance', exact=True).click()
        one.get_by_role('button', name='Reset appearance', exact=True).click()
        one.screenshot(path='/tmp/rummy-full-table-felt.png', full_page=True)

        local = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = local.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/games/rummy')
        page.get_by_label('Your name', exact=True).fill('Local player')
        page.get_by_label('Play mode', exact=True).select_option('local')
        page.get_by_role('button', name='Start game', exact=True).click()
        expect(page.get_by_role('region', name='Pass and play privacy screen', exact=True)).to_be_visible()
        expect(cards(page)).to_have_count(0)
        page.get_by_role('button', name='Reveal my hand', exact=True).click()
        expect(cards(page)).to_have_count(10)
        page.get_by_role('button', name='Draw from stock', exact=True).click()
        expect(cards(page)).to_have_count(11)
        cards(page).first.get_by_role('button').click()
        page.get_by_role('button', name='Discard selected', exact=True).click()
        expect(page.get_by_role('region', name='Pass and play privacy screen', exact=True)).to_be_visible()
        expect(cards(page)).to_have_count(0)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='/tmp/rummy-full-table-mobile.png', full_page=True)
        checks.append('mobile pass-and-play covers each new player hand and the table fits the screen')
        assert not errors, errors
        browser.close()
    result = {'mode': 'real local app server and separate browser sessions; no mocked game API', 'checks': checks, 'browser_errors': errors}
    Path('/tmp/rummy-multiplayer-results.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5177')
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
    run(args.base_url.rstrip('/'))
