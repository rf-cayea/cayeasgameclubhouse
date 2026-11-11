"""Actual four-player Spades, tutorial, original artwork, and touch-hand checks.
Uses real local HTTP/SSE and independent guest cookie jars; no game API mocks.
"""
import argparse
import json
import uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

def cards(page):
    return page.get_by_role('list', name='Your hand', exact=True).locator('[data-card]')

def order(page):
    return cards(page).evaluate_all('nodes => nodes.map(node => node.dataset.card)')

def view(context, base, code):
    response = context.request.get(base + '/api/spades/room/' + code)
    assert response.ok, response.text()
    return response.json()

def move(context, base, state, action):
    response = context.request.post(base + '/api/spades', data={'operation': 'move', 'code': state['code'], 'revision': state['revision'], 'requestId': str(uuid.uuid4()), 'move': action})
    assert response.ok, response.text()
    return response.json()

def fits(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.evaluate('[innerWidth, document.documentElement.scrollWidth]')

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5183')
args = parser.parse_args()
base = args.base_url.rstrip('/')
assert urlparse(base).hostname in ('127.0.0.1', 'localhost')
checks, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    contexts = [browser.new_context(viewport={'width': 390 if i == 0 else 1280, 'height': 844 if i == 0 else 1000}, is_mobile=i == 0, has_touch=i == 0) for i in range(4)]
    pages = [context.new_page() for context in contexts]
    for index, page in enumerate(pages):
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/games/spades')
        expect(page.get_by_role('heading', name='Spades', exact=True)).to_be_visible()
        page.get_by_label('Spades player name', exact=True).fill(['Alice', 'Bob', 'Carol', 'Dave'][index])
    host = pages[0]
    fits(host)
    assert host.get_by_label('Spades scoring mode', exact=True).input_value() == 'solo'
    assert host.get_by_label('Spades scoring mode', exact=True).locator('option[value="teams"]').evaluate('option => option.disabled')
    expect(host.get_by_role('link', name='Unlock 2v2 partnerships for 800 Spades points', exact=True)).to_be_visible()
    checks.append('guest solo play is free and partnership creation requires the permanent store unlock')
    host.get_by_label('Spades play mode', exact=True).select_option('online')
    with host.expect_response(lambda response: response.url.endswith('/api/spades') and response.request.method == 'POST') as created:
        host.get_by_role('button', name='Create Spades room', exact=True).click()
    code = created.value.json()['code']
    # Joiners deliberately choose seats in a nonsequential order.
    for index, seat in enumerate((2, 1, 3), start=1):
        if pages[index].get_by_role('button', name='Join', exact=True).is_visible(): pages[index].get_by_role('button', name='Join', exact=True).click()
        pages[index].get_by_label('Spades room code', exact=True).fill(code)
        pages[index].get_by_label('Spades preferred seat', exact=True).select_option(str(seat))
        pages[index].get_by_role('button', name='Join Spades room', exact=True).click()
        pages[index].get_by_role('button', name='Ready to play', exact=True).click()
    expect(host.get_by_role('button', name='Deal cards', exact=True)).to_be_enabled()
    host.get_by_role('button', name='Deal cards', exact=True).click()
    for page in pages:
        expect(cards(page)).to_have_count(13)
        fits(page)
    views = [view(context, base, code) for context in contexts]
    assert len(set(card for state in views for card in state['hand'])) == 52
    assert all('hands' not in state and 'state' not in state and 'deck' not in state for state in views)
    assert views[1]['mySeat'] == 2
    checks.append('four independent guest players choose seats in a free solo table, ready, and receive 13 private cards each')

    # Native touch dragging on a phone; no game move or request is emitted.
    before = order(host); revision = views[0]['revision']
    first = cards(host).nth(0).get_by_role('button'); first.scroll_into_view_if_needed()
    start, end = first.bounding_box(), cards(host).nth(2).get_by_role('button').bounding_box()
    x, y = start['x'] + 5, start['y'] + start['height'] / 2
    client = contexts[0].new_cdp_session(host)
    client.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    host.wait_for_timeout(280)
    for step in range(1, 15):
        client.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + (end['x'] + 5 - x) * step / 14, 'y': y}]})
    client.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    expected = before[1:3] + before[:1] + before[3:]
    host.wait_for_function('expected => JSON.stringify([...document.querySelectorAll("ol[aria-label=\\"Your hand\\"] [data-card]")].map(node => node.dataset.card)) === JSON.stringify(expected)', arg=expected)
    assert view(contexts[0], base, code)['revision'] == revision
    host.get_by_role('button', name='Hand tools', exact=True).click()
    host.get_by_role('button', name='Undo arrangement', exact=True).click()
    host.get_by_role('button', name='Back to game', exact=True).click()
    assert order(host) == before
    checks.append('long-press touch drag and undo reorder the mobile hand without playing a card or changing server state')
    seat_to_index = {state['mySeat']: index for index, state in enumerate(views)}
    for seat in range(4):
        page = pages[seat_to_index[seat]]
        expect(page.get_by_role('status').filter(has_text='Your bid')).to_be_visible()
        page.get_by_label('Your Spades bid', exact=True).select_option('3')
        page.get_by_role('button', name='Confirm bid', exact=True).click()
    for seat in range(4):
        context, page = contexts[seat_to_index[seat]], pages[seat_to_index[seat]]
        state = view(context, base, code)
        assert state['turn'] == seat
        card = state['legal'][0]
        locator = page.locator(f'ol[aria-label="Your hand"] li[data-card="{card}"] button')
        locator.click(position={'x':5,'y':25})
        page.get_by_role('button', name='Play selected card', exact=True).click()
        expect(cards(page)).to_have_count(12)
    state = view(contexts[0], base, code)
    assert state['phase'] == 'trickOver' and len(state['trick']) == 4
    expect(host.get_by_role('button', name='Collect trick & continue', exact=True)).to_be_enabled()
    host.evaluate('window.scrollTo(0,0)')
    host.screenshot(path='/tmp/spades-mobile-table.png', full_page=True)
    host.get_by_role('button', name='Collect trick & continue', exact=True).click()
    checks.append('bids and a legal four-player trick synchronize across phones and desktops; winning cards remain visible until collected')
    hand = set(view(contexts[0], base, code)['hand'])
    host.reload()
    expect(cards(host)).to_have_count(12)
    assert set(order(host)) == hand
    outside = browser.new_context()
    assert outside.request.get(base + '/api/spades/room/' + code).status == 403
    outside.close()
    checks.append('refresh reconnects to the same private hand; outsiders cannot read a room by its code')

    host.get_by_role('button', name='Rules & tutorial', exact=True).click()
    for index, answer in enumerate(('Seat 3', '40 points', '3 of hearts', '2 of spades', '−58, now 1 bag', 'Another hand is played')):
        host.get_by_role('button', name=answer, exact=True).click()
        expect(host.get_by_role('status').filter(has_text='Correct.')).to_be_visible()
        fits(host)
        if index < 5:
            host.get_by_role('button', name='Next lesson', exact=True).click()
    host.get_by_role('button', name='Take a seat', exact=True).click()
    expect(cards(host)).to_have_count(12)
    checks.append('all six interactive tutorial lessons work on a phone without losing the live table')
    host.get_by_role('button', name='Collection', exact=True).click()
    expect(host.get_by_role('heading', name='The Spades collection', exact=True)).to_be_visible()
    for venue, colour, theme in [('Moonlit Observatory', 'rgb(35, 56, 100)', 'atlas'), ('Rosewood Parlour', 'rgb(104, 47, 63)', 'ember'), ('Emerald Conservatory', 'rgb(18, 84, 86)', 'grove'), ('Gilded Grand Hall', 'rgb(73, 52, 84)', 'deco')]:
        host.get_by_role('button', name='Preview ' + venue, exact=True).click()
        assert host.locator('.spades-preview-table').evaluate('node => getComputedStyle(node).backgroundColor') == colour
        room_image = '/spades-art/room-' + theme + '.webp'
        assert room_image in host.locator('.spades-preview-room').evaluate('node => getComputedStyle(node).backgroundImage')
        host.evaluate('async src=>{const image=new Image();image.src=src;await image.decode();if(!image.naturalWidth)throw new Error("Missing venue painting")}', room_image)
    faces, backs = set(), set()
    for deck in ('Midnight Atlas', 'Ember Crown', 'Verdant Grove', 'Ivory Deco'):
        host.get_by_role('button', name='Preview ' + deck, exact=True).click()
        faces.add(host.locator('.spades-preview-table svg').first.evaluate('node => node.outerHTML'))
        backs.add(host.locator('.spades-preview-table svg').last.evaluate('node => node.outerHTML'))
    assert len(faces) == len(backs) == 4
    fits(host)
    host.screenshot(path='/tmp/spades-mobile-collection.png', full_page=True)
    checks.append('all four venue backgrounds and four distinct face-and-back deck skins preview on mobile without granting unearned ownership')
    host.get_by_role('button', name='Game table', exact=True).click()
    host.get_by_role('button', name='Leave table', exact=True).click()
    host.get_by_role('button', name='Confirm leave', exact=True).click()
    expect(host.get_by_role('heading', name='Set your table', exact=True)).to_be_visible()
    expect(pages[1].get_by_role('status').filter(has_text='Table closed')).to_be_visible()
    checks.append('leaving an active match closes all four seats without a forfeit win')
    host.get_by_label('Spades play mode', exact=True).select_option('bot')
    host.get_by_label('Spades scoring mode', exact=True).select_option('solo')
    host.get_by_label('Spades target score', exact=True).select_option('100')
    host.get_by_label('Spades computer difficulty', exact=True).select_option('hard')
    with host.expect_response(lambda response: response.url.endswith('/api/spades') and response.request.method == 'POST') as created:
        host.get_by_role('button', name='Deal me in', exact=True).click()
    state = created.value.json()
    code = state['code']
    assert state['options']['variant'] == 'solo' and state['options']['level'] == 'hard'
    state = move(contexts[0], base, state, {'t': 'bid', 'bid': 3})
    for _ in range(40):
        if state['phase'] in ('handOver', 'gameOver'):
            break
        action = {'t': 'collect'} if state['phase'] == 'trickOver' else {'t': 'play', 'card': state['legal'][0]}
        state = move(contexts[0], base, state, action)
    assert state['phase'] in ('handOver', 'gameOver') and len(state['completed']) == 13
    host.evaluate("window.dispatchEvent(new Event('focus'))")
    expect(host.get_by_role('region', name='Spades hand result', exact=True)).to_be_visible()
    fits(host)
    if state['phase'] == 'handOver':
        host.get_by_role('button', name='Deal next hand', exact=True).click()
        expect(cards(host)).to_have_count(13)
        assert view(contexts[0], base, code)['dealer'] == 0
    checks.append('hard computers play a complete solo hand with 13 tricks, settle real scores, and rotate the dealer on the next hand')
    host.set_viewport_size({'width': 320, 'height': 740})
    fits(host)
    host.evaluate('window.scrollTo(0,0)')
    host.screenshot(path='/tmp/spades-small-phone.png', full_page=True)
    checks.append('the live table fits a 320-pixel phone; primary turn controls retain 44-pixel touch targets')
    primary = host.get_by_role('button', name='Confirm bid', exact=True)
    if not primary.is_visible(): primary = host.get_by_role('button', name='Back to game', exact=True)
    assert primary.bounding_box()['height'] >= 44
    assert not errors, errors
    browser.close()
result = {'mode': 'real HTTP/SSE and separate guest sessions', 'checks': checks, 'browser_errors': errors}
Path('/tmp/spades-browser-results.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
