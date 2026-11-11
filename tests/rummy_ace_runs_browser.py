"""Ace-low/high meld controls with fictional local game responses.

Run against the local guest Vite preview. Every game request is intercepted;
the fixture checks submitted moves and updates the visible room, but does not
replace the independent authoritative engine/server regression tests.
"""
import argparse
import copy
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


class RoomFixture:
    def __init__(self, variant, cards, phase='play'):
        self.moves = []
        self.unhandled = []
        self.room = {
            'code': 'ABCD1234', 'mode': 'bot', 'variant': variant, 'capacity': 2,
            'status': 'playing', 'revision': 1, 'owner': True, 'mySeat': 0,
            'players': [
                {'id': 'fixture-you', 'name': 'Player', 'bot': False,
                 'count': 10, 'score': 0, 'ready': True, 'you': True},
                {'id': 'fixture-computer', 'name': 'Computer', 'bot': True,
                 'count': 10, 'score': 0, 'ready': True, 'you': False},
            ],
            'hand': cards + ['4H', '5H', '6H', '7D', '8D', '9C', 'TC'],
            'discard': ['QD'], 'stockCount': 30, 'melds': [], 'phase': phase,
            'turn': 0, 'dealer': 0, 'round': 1,
            'target': 500 if variant == 'r500' else 100,
            'winner': None, 'roundResult': None, 'mustUse': None,
            'drewDiscard': None, 'opening': None, 'jokers': False,
            'log': [], 'revealedHands': None,
            'reward': {'status': 'unranked', 'amount': 0,
                       'message': 'Fictional room for ace meld verification.'},
        }
        assert len(set(self.room['hand'])) == len(self.room['hand'])

    @staticmethod
    def respond(route, value, status=200):
        route.fulfill(status=status, content_type='application/json',
                      body=json.dumps(value))

    def route(self, route):
        path = urlparse(route.request.url).path
        if path == '/api/rummy/appearance':
            selected = {'background': 'rummy-room-classic',
                        'table': 'rummy-table-classic', 'deck': 'rummy-standard'}
            self.respond(route, {'member': False, 'wins': 0,
                'owned': list(selected.values()), 'equipped': selected})
        elif path == '/api/rummy/session':
            self.respond(route, {'member': False, 'jokers': False})
        elif path == '/api/rummy/room/ABCD1234/events':
            route.fulfill(content_type='text/event-stream', body=': fixture\n\n')
        elif path == '/api/rummy/room/ABCD1234':
            self.respond(route, self.room)
        elif path == '/api/rummy' and route.request.method == 'POST':
            command = route.request.post_data_json
            assert command['operation'] == 'move'
            assert command['code'] == self.room['code']
            assert command['revision'] == self.room['revision']
            assert isinstance(command['requestId'], str) and command['requestId']
            move = command['move']
            self.moves.append(copy.deepcopy(move))
            if move == {'t': 'draw', 'from': 'stock'}:
                assert self.room['phase'] == 'draw'
                self.room['phase'] = 'play'
                self.room['hand'].append('JD')
                self.room['stockCount'] -= 1
            else:
                assert move['t'] == 'meld' and self.room['phase'] == 'play'
                assert len(move['cards']) == 3
                assert all(card in self.room['hand'] for card in move['cards'])
                self.room['hand'] = [card for card in self.room['hand']
                                     if card not in move['cards']]
                self.room['melds'].append({'cards': [
                    {'c': card, 'by': 0} for card in move['cards']]})
            self.room['revision'] += 1
            self.room['players'][0]['count'] = len(self.room['hand'])
            self.respond(route, self.room)
        else:
            self.unhandled.append((route.request.method, path))
            self.respond(route, {'error': 'Unexpected fixture request.'}, 400)


def choose(page, cards):
    # Phone/tablet players tap the exposed corner rather than a card center,
    # which is covered by the following card in the fitted hand.
    for card in cards:
        button = page.locator(f'.game-hand-section li[data-card="{card}"] button')
        button.tap(position={'x': 5, 'y': 16})
        expect(button).to_have_attribute('aria-pressed', 'true')
    expect(page.get_by_role('button', name=f'Clear selection ({len(cards)})',
                            exact=True)).to_be_enabled()


def fitted(page):
    assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def run(base_url, screenshots):
    checks, errors = [], []
    screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium',
            args=['--no-sandbox', '--disable-dev-shm-usage'])
        for width, height in [(390, 844), (768, 1024)]:
            for variant in ['classic', 'r500']:
                for name, cards, accepted, phase in [
                    ('ace-low', ['AS', '2S', '3S'], True, 'play'),
                    ('ace-high', ['QS', 'KS', 'AS'], True, 'play'),
                    ('draw-first', ['AS', '2S', '3S'], True, 'draw'),
                    ('mixed-suits', ['AS', '2H', '3S'], False, 'play'),
                    ('no-wrap', ['KS', 'AS', '2S'], False, 'play'),
                ]:
                    fixture = RoomFixture(variant, cards, phase)
                    context = browser.new_context(viewport={'width': width,
                        'height': height}, has_touch=True, reduced_motion='reduce')
                    context.route('**/api/rummy**', fixture.route)
                    context.add_init_script("sessionStorage.setItem('cayea-rummy-room','ABCD1234')")
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(base_url + '/games/rummy')
                    expect(page.locator('.rummy-live-table')).to_be_visible()
                    choose(page, cards)
                    meld = page.get_by_role('button', name='Meld selected', exact=True)
                    if phase == 'draw':
                        expect(meld).to_be_disabled()
                        assert not fixture.moves
                        page.get_by_role('button', name='Draw from stock', exact=True).click()
                        expect(page.locator('.game-hand-section ol[aria-label="Your hand"] button')).to_have_count(11)
                        expect(page.get_by_role('button', name='Clear selection (0)', exact=True)).to_be_disabled()
                        choose(page, cards)
                    if accepted:
                        expect(meld).to_be_enabled()
                        meld.click()
                        expect(page.locator('.game-hand-section ol[aria-label="Your hand"] button')).to_have_count(8 if phase == 'draw' else 7)
                        assert fixture.moves[-1] == {'t': 'meld', 'cards': cards}
                        assert len(fixture.room['melds']) == 1
                        assert all(card not in fixture.room['hand'] for card in cards)
                        fitted(page)
                        page.get_by_role('button', name=re.compile(r'^Melds & discard \(1\)$')).click()
                        expect(page.get_by_role('dialog', name='Table melds & discard pile', exact=True)).to_be_visible()
                        expect(page.locator('.rummy-meld-area .card-artwork')).to_have_count(3)
                        if variant == 'classic' and name == 'ace-high':
                            page.screenshot(path=str(screenshots / f'ace-high-{width}.png'))
                    else:
                        expect(meld).to_be_disabled()
                        assert not fixture.moves
                        fitted(page)
                    assert not fixture.unhandled, fixture.unhandled
                    checks.append({'viewport': f'{width}x{height}', 'variant': variant,
                                   'case': name, 'meld_accepted': accepted})
                    context.close()
        browser.close()
    assert not errors, errors
    print(json.dumps({'cases': len(checks), 'checks': checks, 'browser_errors': errors,
                      'real_accounts_or_games_changed': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5173')
    parser.add_argument('--screenshots', default='test-results/rummy-ace-runs')
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
    run(args.base_url.rstrip('/'), Path(args.screenshots))
