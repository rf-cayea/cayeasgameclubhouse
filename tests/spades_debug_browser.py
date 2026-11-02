"""Real Spades HTTP recovery and stale-dialog regressions on the local app."""
import argparse
import json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
base = args.base_url
checks, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = browser.new_context()
    page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base + '/games/spades')
    page.get_by_label('Spades play mode', exact=True).select_option('online')
    page.get_by_role('button', name='Create Spades room', exact=True).click()
    expect(page.get_by_text('Every seat keeps an individual score.', exact=False)).to_be_visible()
    expect(page.get_by_text('Opposite seats are partners.', exact=False)).to_have_count(0)
    checks.append('Solo lobbies show individual scoring guidance; seat choices do not promise partnerships')
    page.get_by_role('button', name='Leave table', exact=True).click()
    page.get_by_role('button', name='Confirm leave', exact=True).click()
    page.get_by_label('Spades play mode', exact=True).select_option('bot')
    page.get_by_role('button', name='Deal me in', exact=True).click()
    expect(page.get_by_label('Your Spades bid', exact=True)).to_be_visible()
    page.get_by_role('button', name='Leave table', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(1)
    def missing(route):
        if route.request.url.endswith('/events'):
            route.continue_()
        else:
            route.fulfill(status=404, content_type='application/json', body='{"error":"Room no longer available"}')
    page.route('**/api/spades/room/*', missing)
    page.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(page.get_by_role('button', name='Deal me in', exact=True)).to_be_visible()
    page.unroute('**/api/spades/room/*', missing)
    page.get_by_role('button', name='Deal me in', exact=True).click()
    expect(page.get_by_label('Your Spades bid', exact=True)).to_be_visible()
    expect(page.get_by_role('dialog')).to_have_count(0)
    checks.append('losing access to a room clears its leave prompt before a new table opens')

    committed, held = [], []
    def lose_reply(route):
        body = route.request.post_data_json
        if body.get('operation') == 'move' and body.get('move', {}).get('t') == 'bid':
            response = route.fetch()
            assert response.ok, response.text()
            committed.append(response.json())
            held.append((route, response))
            # The authoritative move commits; its response never reaches the
            # page. Polling/SSE still work. The real 15-second timeout must free
            # controls without retrying the bid or resetting the table.
        else:
            route.continue_()
    page.route('**/api/spades', lose_reply)
    page.get_by_label('Your Spades bid', exact=True).select_option('3')
    page.get_by_role('button', name='Confirm bid', exact=True).click()
    expect(page.get_by_role('button', name='Play selected card', exact=True)).to_be_visible()
    assert len(committed) == 1
    state = committed[0]
    legal = state['legal'][0]
    page.locator(f'[data-card="{legal}"]').get_by_role('button').click()
    play = page.get_by_role('button', name='Play selected card', exact=True)
    expect(play).to_be_disabled()
    expect(play).to_be_enabled(timeout=22000)
    current = context.request.get(base + '/api/spades/room/' + state['code']).json()
    assert current['revision'] == state['revision'] and current['bids'][0] == 3
    assert len(current['hand']) == 13 and len(committed) == 1
    for route, response in held:
        route.fulfill(response=response)
    checks.append('a lost bid reply times out, reconnects to the accepted bid, and restores controls without replaying the move')
    assert not errors, errors
    context.close(); browser.close()
print(json.dumps({'checks': checks, 'browser_errors': errors}))
