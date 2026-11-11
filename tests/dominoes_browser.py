"""Local-only Dominoes UI checks: real guest tables plus extreme display fixtures."""
import argparse
import json
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5180')
base = parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost', '127.0.0.1')
out = Path('/workspace/work/dominoes-qa'); out.mkdir(exist_ok=True)
sizes = [(320, 568), (375, 667), (390, 844), (768, 1024), (1024, 768), (568, 320)]
errors, checks = [], []

def fitted(page, stage):
    measurement = page.evaluate('''()=>({w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight})''')
    assert measurement['scrollH'] <= measurement['h'] + 1 and measurement['scrollW'] <= measurement['w'] + 1, (stage, measurement)
    selectors = '.dm-hand>button,.dm-actions>button' if page.locator('.dm-live').count() else '.dm-start,.dm-setup-fields input,.dm-setup-fields select,.dm-text-button'
    bounds = page.locator(selectors).evaluate_all('''els=>els.map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')||e.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height}})''')
    assert all(r['x'] >= -1 and r['y'] >= -1 and r['x'] + r['w'] <= measurement['w'] + 1 and r['y'] + r['h'] <= measurement['h'] + 1 and r['h'] > 8 for r in bounds), (stage, measurement, bounds)
    assert not page.locator('.dm-network').count(), (stage, page.locator('.dm-network').inner_text() if page.locator('.dm-network').count() else '')
    checks.append({'stage': stage, 'size': f"{measurement['w']}x{measurement['h']}", 'fits': True})

def get_view(ctx, code):
    response = ctx.request.get(base + '/api/dominoes/room/' + code)
    assert response.ok, (response.status, response.text())
    return response.json()

def command(ctx, body):
    response = ctx.request.post(base + '/api/dominoes', data={'requestId': str(uuid4()), **body})
    assert response.ok, (response.status, response.text())
    return response.json()['view']

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    # Every variant and computer difficulty starts and accepts a real tile move.
    for variant in ('draw', 'block', 'muggins'):
        for level in ('easy', 'normal', 'hard'):
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
            page = ctx.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/games/dominoes')
            start = page.get_by_role('button', name='Start match', exact=True); expect(start).to_be_enabled()
            page.get_by_label('Dominoes variant', exact=True).select_option(variant)
            page.get_by_label('Dominoes difficulty', exact=True).select_option(level)
            for width, height in sizes:
                page.set_viewport_size({'width': width, 'height': height}); fitted(page, f'{variant}/{level}/setup')
            start.click(); expect(page.locator('.dm-live')).to_be_visible()
            expect(page.locator('.dm-match-line strong')).to_have_text('Your turn')
            for width, height in sizes:
                page.set_viewport_size({'width': width, 'height': height}); fitted(page, f'{variant}/{level}/table')
            page.set_viewport_size({'width': 390, 'height': 844})
            code = page.evaluate('sessionStorage.getItem("clubhouse-dominoes:guest:room")')
            view = get_view(ctx, code)
            if not view['legal']:
                page.locator('.dm-actions').get_by_role('button', name='Draw', exact=False).click()
                expect(page.locator('.dm-hand>button[data-playable=true]').first).to_be_enabled()
            tile = page.locator('.dm-hand>button[data-playable=true]').first
            tile.click(); expect(tile).to_have_attribute('aria-pressed', 'true')
            end = page.locator('.dm-actions>button:not(:disabled)').first
            with page.expect_response(lambda r: r.url.endswith('/api/dominoes') and r.request.method == 'POST') as response:
                end.click()
            assert response.value.ok
            expect(page.locator('.dm-board>g[data-domino-tile]').first).to_be_visible()
            current = get_view(ctx, code)
            assert current['board'] and current['hand'] and current['revealedHands'] is None
            assert all('tile' not in item for item in current['activity'] if item['kind'] == 'draw')
            page.reload(); expect(page.locator('.dm-live')).to_be_visible()
            expect(page.locator('.dm-board>g[data-domino-tile]')).to_have_count(len(current['board']))
            # Rendered pip order must follow the server's orientation in both directions.
            for index, placed in enumerate(current['board']):
                face = page.locator('[data-domino-tile="'+placed['id']+'"]').locator('[data-domino-face]')
                first, second = placed['a'], placed['b']
                expect(face).to_have_attribute('data-first-pips', str(first)); expect(face).to_have_attribute('data-second-pips', str(second))
            page.screenshot(path=str(out / f'{variant}-{level}-390x844.png'))
            ctx.close()

    # Independent guests join by invitation, ready up, play and see shared moves.
    contexts = [browser.new_context(viewport={'width': 375, 'height': 667}, reduced_motion='reduce') for _ in range(2)]
    pages = [ctx.new_page() for ctx in contexts]
    for page in pages: page.on('pageerror', lambda error: errors.append(str(error)))
    host, peer = pages
    host.goto(base + '/games/dominoes'); expect(host.get_by_role('button', name='Start match', exact=True)).to_be_enabled()
    host.get_by_role('button', name='Play a friend', exact=True).click()
    host.get_by_label('Dominoes variant', exact=True).select_option('block')
    host.get_by_label('Dominoes target', exact=True).select_option('200')
    host.get_by_label('Dominoes player name', exact=True).fill('Alice')
    host.get_by_role('button', name='Create private table', exact=True).click(); expect(host.locator('.dm-lobby')).to_be_visible()
    code = host.evaluate('sessionStorage.getItem("clubhouse-dominoes:guest:room")')
    peer.goto(base + '/games/dominoes?room=' + code)
    expect(peer.get_by_role('dialog')).to_be_visible()
    peer.get_by_label('Join Dominoes player name', exact=True).fill('Bob')
    peer.get_by_role('button', name='Join table', exact=True).click(); expect(peer.locator('.dm-lobby')).to_be_visible()
    for width, height in sizes:
        for page in pages:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1')
            actions = page.locator('.dm-lobby-actions').bounding_box(); assert actions['y'] + actions['height'] <= height + 1
    peer.get_by_role('button', name='I’m ready', exact=True).click()
    expect(host.get_by_role('button', name='Start match', exact=True)).to_be_enabled(timeout=10000)
    host.get_by_role('button', name='Start match', exact=True).click()
    for page in pages: expect(page.locator('.dm-live')).to_be_visible()
    view = get_view(contexts[0], code); turn = view['turn']; active = pages[turn]; spectator = pages[1-turn]
    expect(active.locator('.dm-hand>button[data-playable=true]').first).to_be_enabled()
    tile = active.locator('.dm-hand>button[data-playable=true]').first; tile.click()
    # Simulate a response lost after the server commits. Retry must not play twice.
    lost = {'done': False}
    def lose_once(route):
        response = route.fetch()
        if not lost['done']:
            assert response.ok; lost['done'] = True; route.abort('failed')
        else: route.fulfill(response=response)
    active.route('**/api/dominoes', lose_once)
    active.locator('.dm-actions>button:not(:disabled)').first.click()
    expect(active.get_by_role('button', name='Retry action', exact=True)).to_be_visible()
    expect(active.locator('.dm-actions>button:not(:disabled)')).to_have_count(0)
    committed = get_view(contexts[turn], code); assert len(committed['board']) == 1
    active.get_by_role('button', name='Retry action', exact=True).click(); expect(active.locator('.dm-network')).to_have_count(0)
    after = get_view(contexts[turn], code); assert after['revision'] == committed['revision'] and after['board'] == committed['board']
    active.unroute('**/api/dominoes', lose_once)
    expect(spectator.locator('.dm-board>g[data-domino-tile]')).to_have_count(1, timeout=10000)
    expect(spectator.locator('.dm-last-move')).to_contain_text('played')
    assert get_view(contexts[turn], code)['hand'] != get_view(contexts[1-turn], code)['hand']
    # Finish the first hand through the real API, then use the host's Next hand UI.
    view = after
    for n in range(160):
        if view['phase'] != 'play': break
        seat = view['turn']; own = get_view(contexts[seat], code)
        best = sorted(own['legal'], key=lambda option: (option['points'], sum(map(int, option['tile'].split('-')))), reverse=True)
        move = {'t': 'play', 'tile': best[0]['tile'], 'end': best[0]['end']} if best else {'t': 'draw' if own['canDraw'] else 'pass'}
        view = command(contexts[seat], {'operation': 'move', 'code': code, 'revision': own['revision'], 'move': move})
    assert view['phase'] == 'roundOver'
    expect(host.get_by_role('button', name='Next hand', exact=True)).to_be_visible(timeout=10000)
    expect(peer.get_by_role('button', name='Waiting for host', exact=True)).to_be_disabled(timeout=10000)
    host.get_by_role('button', name='Next hand', exact=True).click()
    for page in pages: expect(page.locator('.dm-match-line')).to_contain_text('Hand 2', timeout=10000)
    host.reload(); expect(host.locator('.dm-live')).to_be_visible(); expect(host.locator('.dm-match-line')).to_contain_text('Hand 2')
    for ctx in contexts: ctx.close()
    checks.append({'stage': 'real online players, private hands, lost response, retry, reconnect, next hand', 'passed': True})

    # Extreme public-view fixtures exercise all 21 hand slots and a complete chain.
    tiles = [f'{a}-{b}' for a in range(7) for b in range(a, 7)]
    for fixture_name in ('large-hand', 'long-chain'):
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        ctx.add_init_script('sessionStorage.setItem("clubhouse-dominoes:guest:room","ABCDEF12");')
        board = [{'id': '0-0', 'a': 0, 'b': 0, 'seat': 1}]
        hand = tiles[1:22]
        if fixture_name == 'long-chain':
            # Euler circuit through the double-six graph; 27 tiles can be played
            # before the final tile left in the other hand ends the match.
            unused, stack, circuit = set(tiles), [0], []
            while stack:
                v = stack[-1]; edge = next((tile for tile in sorted(unused) if str(v) in tile.split('-')), None)
                if edge:
                    unused.remove(edge); a, b = map(int, edge.split('-')); stack.append(b if a == v else a)
                else: circuit.append(stack.pop())
            circuit.reverse()
            board = [{'id': f'{min(a,b)}-{max(a,b)}', 'a': a, 'b': b, 'seat': i % 2} for i, (a,b) in enumerate(zip(circuit,circuit[1:]))][:27]
            hand = []
        fixture = {'code': 'ABCDEF12', 'revision': 1, 'owner': True, 'status': 'playing' if hand else 'finished', 'options': {'mode': 'online', 'variant': 'muggins', 'level': 'normal', 'target': 100}, 'mySeat': 0,
                   'players': [{'id': f'p{i}', 'name': name, 'bot': False, 'ready': True, 'you': i == 0, 'occupied': True, 'count': len(hand) if i == 0 else 6 if hand else 1, 'score': 40 if i == 0 else 35} for i, name in enumerate(['A name with twenty chars', 'Another player name'])],
                   'hand': hand, 'board': board, 'stockCount': 0, 'turn': 0, 'round': 5, 'phase': 'play' if hand else 'finished', 'scores': [40, 35], 'legal': [{'tile': t, 'end': 'left', 'points': 5} for t in hand], 'canDraw': False, 'canPass': False,
                   'forcedOpening': None, 'activity': [], 'result': None, 'winner': None if hand else 0, 'revealedHands': None if hand else [[], []], 'reward': {'status': 'ineligible', 'tier': None, 'amount': 0, 'message': 'Local display fixture'}}
        ctx.route('**/api/dominoes/room/ABCDEF12', lambda route, request, value=fixture: route.fulfill(status=200, content_type='application/json', body=json.dumps(value)))
        ctx.route('**/api/dominoes/room/ABCDEF12/events', lambda route: route.fulfill(status=200, content_type='text/event-stream', body='data: {"revision":1}\n\n'))
        page = ctx.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/games/dominoes'); expect(page.locator('.dm-live')).to_be_visible()
        for width, height in sizes:
            page.set_viewport_size({'width': width, 'height': height}); fitted(page, fixture_name)
            expect(page.locator('.dm-hand>button')).to_have_count(len(hand))
            expect(page.locator('.dm-board>g[data-domino-tile]')).to_have_count(len(board))
            for index, placed in enumerate(board):
                face = page.locator('[data-domino-tile="'+placed['id']+'"]').locator('[data-domino-face]')
                first, second = placed['a'], placed['b']
                expect(face).to_have_attribute('data-first-pips', str(first)); expect(face).to_have_attribute('data-second-pips', str(second))
            page.screenshot(path=str(out / f'{fixture_name}-{width}x{height}.png'))
        ctx.close()
    # Home navigation must open the actual new game route.
    page = browser.new_page(); page.goto(base)
    expect(page.get_by_role('link', name='Play Dominoes →', exact=True)).to_have_attribute('href', '/games/dominoes')
    assert not errors, errors
    browser.close()
    (out / 'report.json').write_text(json.dumps({'checks': checks, 'errors': errors}, indent=2))
    print(json.dumps({'checks': len(checks), 'errors': errors, 'report': str(out / 'report.json')}))
