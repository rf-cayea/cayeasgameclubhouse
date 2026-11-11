"""Artist deck selection across the Store and live card-game renderers.

Run against the local Vite server configured with clubhouse.test.invalid.
Every identity, wallet and game response is intercepted; no real purchases,
accounts, game results or point balances are changed.
"""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, SupabaseFixture

DECKS = [('atlas', 'Midnight Atlas'), ('ember', 'Ember Crown'),
         ('grove', 'Verdant Grove'), ('deco', 'Ivory Deco')]
DEFAULT = {'background': 'rummy-room-classic', 'table': 'rummy-table-classic',
           'deck': 'rummy-standard'}


class ArtistFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.equipped = dict(DEFAULT)
        self.equips = []
        self.wallets[ADMIN]['owned'] = ['spades-deck-' + key for key, _ in DECKS]
        self.wallets[ADMIN]['spades_points'] = 2000
        self.rummy = {
            'code': 'ABCD1234', 'mode': 'bot', 'variant': 'classic', 'capacity': 2,
            'status': 'playing', 'revision': 1, 'owner': True, 'mySeat': 0,
            'players': [{'id': ADMIN, 'name': 'Alice', 'bot': False, 'count': 10,
                         'score': 0, 'ready': True, 'you': True},
                        {'id': 'computer', 'name': 'Computer', 'bot': True,
                         'count': 10, 'score': 0, 'ready': True, 'you': False}],
            'hand': ['AS', 'JS', 'QH', 'KD', 'KC', '6H', '7D', '8D', '9C', 'TC'],
            'discard': ['KS'], 'stockCount': 30, 'melds': [], 'phase': 'draw',
            'turn': 0, 'dealer': 0, 'round': 1, 'target': 100, 'winner': None,
            'roundResult': None, 'mustUse': None, 'drewDiscard': None,
            'opening': None, 'jokers': False, 'log': [], 'revealedHands': None,
            'reward': {'status': 'eligible', 'amount': 70, 'tier': 'normal',
                       'message': 'Fictional game for renderer verification.'},
        }
        self.spades = {
            'code': 'DEFA1234', 'revision': 1, 'owner': True, 'status': 'playing',
            'options': {'mode': 'bot', 'variant': 'solo', 'target': 500,
                        'humans': 1, 'level': 'normal',
                        'table': 'spades-table-classic', 'deck': 'spades-deck-classic'},
            'mySeat': 0,
            'players': [{'id': ADMIN if seat == 0 else f'bot-{seat}',
                         'name': ['Alice', 'North', 'East', 'West'][seat],
                         'bot': seat != 0, 'ready': True, 'occupied': True,
                         'you': seat == 0, 'count': 13} for seat in range(4)],
            'hand': ['AS', 'JS', 'QH', 'KD', 'KC', '6H', '7D', '8D', '9C', 'TC',
                     '2S', '3S', '4H'],
            'legal': ['AS', 'JS', 'QH', 'KD', 'KC', '6H', '7D', '8D', '9C', 'TC',
                      '2S', '3S', '4H'],
            'bids': [3, 3, 3, 3], 'taken': [0, 0, 0, 0], 'scores': [0, 0, 0, 0],
            'bags': [0, 0, 0, 0], 'phase': 'play', 'turn': 0, 'dealer': 3,
            'round': 1, 'broken': True, 'trick': [], 'completed': [], 'result': None,
            'winner': None, 'log': [],
            'reward': {'status': 'eligible', 'amount': 70, 'tier': 'normal',
                       'message': 'Fictional game for renderer verification.'},
        }

    def artwork(self, route):
        if route.request.method == 'POST':
            command = route.request.post_data_json
            assert set(command) == {'background', 'table', 'deck'}
            assert command['background'] == DEFAULT['background']
            assert command['table'] == DEFAULT['table']
            assert command['deck'] in ['rummy-standard'] + ['rummy-deck-' + key for key, _ in DECKS]
            self.equipped = dict(command)
            self.equips.append(copy.deepcopy(command))
        self.respond(route, {'member': True, 'wins': 10,
            'owned': list(DEFAULT.values()) + ['rummy-deck-' + key for key, _ in DECKS],
            'equipped': self.equipped})

    @staticmethod
    def respond(route, value):
        route.fulfill(content_type='application/json', body=json.dumps(value))

    def http(self, route, user_id):
        if urlparse(route.request.url).path.endswith('/rpc/equip_store_item'):
            command = route.request.post_data_json
            assert command['_slot'] == 'spades_deck'
            assert command['_item_id'] in self.wallets[user_id]['owned']
            self.wallets[user_id]['equipped']['spades_deck'] = command['_item_id']
            self.equips.append(copy.deepcopy(command))
            self.respond(route, {'slot': 'spades_deck', 'item_id': command['_item_id']})
        else:
            super().http(route, user_id)

    def game(self, route):
        path = urlparse(route.request.url).path
        if path.endswith('/appearance'):
            self.artwork(route)
        elif path.endswith('/events'):
            route.fulfill(content_type='text/event-stream', body=': fixture\n\n')
        elif path.startswith('/api/rummy/room/'):
            self.respond(route, self.rummy)
        elif path.startswith('/api/spades/room/'):
            self.spades['options']['deck'] = self.wallets[ADMIN]['equipped'].get('spades_deck', 'spades-deck-classic')
            self.respond(route, self.spades)
        elif path.endswith('/session'):
            self.respond(route, {'member': True, 'jokers': False})
        else:
            raise AssertionError('Unexpected game mutation: ' + path)


def verify_fitted(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1')
    expect(page.locator('.game-hand-section')).to_be_visible()


def run(base_url):
    fixture, checks, errors, assets = ArtistFixture(), [], [], set()
    qa = Path('/workspace/work/allgames-qa')
    qa.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium',
            args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = fixture.context(browser, ADMIN, width=390)
        context.route('**/api/rummy/**', fixture.game)
        context.route('**/api/spades/**', fixture.game)
        context.add_init_script("sessionStorage.setItem('cayea-rummy-room','ABCD1234');sessionStorage.setItem('cayea-spades-room','DEFA1234');")
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: assets.add(urlparse(response.url).path)
                if '/card-art/' in response.url and response.status == 200 else None)
        page.goto(base_url + '/store')
        page.evaluate("""async()=>{await Promise.all(['heritage','atlas','ember','grove','deco'].map(async theme=>{const image=new Image();image.src='/card-art/'+theme+'.webp';await image.decode();if(image.naturalWidth<600||image.naturalHeight<1000)throw new Error('Invalid painted atlas '+theme)}))}""")
        rummy = page.get_by_role('region', name='Rummy+ earned artwork', exact=True)
        spades = page.get_by_role('region', name='Artist decks for Spades', exact=True)
        expect(rummy.locator('article')).to_have_count(5)
        expect(spades.locator('article')).to_have_count(5)
        expect(rummy.get_by_text('All 4 rewards collected', exact=False)).to_be_visible()
        for key, name in [('heritage', 'Clubhouse Heritage')] + DECKS:
            rummy_id = 'rummy-standard' if key == 'heritage' else 'rummy-deck-' + key
            spades_id = 'spades-deck-classic' if key == 'heritage' else 'spades-deck-' + key
            spades_name = 'Clubhouse Standard' if key == 'heritage' else name
            rummy.get_by_role('button', name='Preview ' + name, exact=True).click()
            expect(rummy.locator('.artist-deck-showcase .card-artwork').first).to_have_attribute('data-deck', rummy_id)
            rummy.get_by_role('button', name='See every face', exact=True).click()
            contact = page.get_by_role('dialog', name=name + ' · 54 illustrated faces', exact=True)
            expect(contact.locator('.artist-deck-contact-sheet > div')).to_have_count(55)
            # A/J/Q/K for each suit, two distinct jokers, a number frame and
            # a concealed back cover all twenty painted atlas cells.
            panels = contact.locator('[data-painted-panel]').evaluate_all('nodes=>[...new Set(nodes.map(n=>Number(n.dataset.paintedPanel)))].sort((a,b)=>a-b)')
            assert panels == list(range(20)), panels
            expect(contact.get_by_role('img', name=name + ' card back', exact=True)).to_have_count(1)
            page.set_viewport_size({'width': 1440, 'height': 1000})
            if key == 'atlas':
                contact.locator('.artist-deck-contact-sheet').screenshot(path=str(qa / 'artist-atlas-all-faces.png'))
            # Keep a large contact sheet of every royal portrait for visual
            # review of each atlas crop, separate from playing-size hand shots.
            contact.locator('.artist-deck-contact-sheet > div').evaluate_all("nodes=>nodes.forEach(node=>{const label=node.querySelector('[role=img]')?.getAttribute('aria-label')||'';if(!/^(Jack|Queen|King) of /.test(label))node.style.display='none'})")
            expect(contact.locator('.artist-deck-contact-sheet > div:visible')).to_have_count(12)
            contact.locator('.artist-deck-contact-sheet').screenshot(path=str(qa / f'artist-{key}-royal-courts.png'))
            page.set_viewport_size({'width': 390, 'height': 950})
            contact.get_by_role('button', name='Back to game', exact=True).click()
            spades.get_by_role('button', name='Preview ' + spades_name, exact=True).click()
            expect(spades.locator('.artist-deck-showcase .card-artwork').first).to_have_attribute('data-deck', spades_id)
        assert not fixture.equips
        checks.append('Both Store galleries preview all five designs; all 54 Rummy faces and the independent back use twenty painted panels without equipping or purchasing')

        rummy.get_by_role('article', name='Verdant Grove', exact=True).get_by_role('button', name='Use design', exact=True).click()
        expect(rummy.get_by_role('article', name='Verdant Grove', exact=True).get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
        spades.get_by_role('article', name='Ember Crown', exact=True).get_by_role('button', name='Equip', exact=True).click()
        expect(spades.get_by_role('article', name='Ember Crown', exact=True).get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
        assert fixture.equipped['deck'] == 'rummy-deck-grove'
        assert fixture.wallets[ADMIN]['equipped']['spades_deck'] == 'spades-deck-ember'
        assert fixture.wallets[ADMIN]['spades_points'] == 2000
        checks.append('Equipping owned decks updates separate Rummy and Spades selections without spending points or changing room/table choices')
        page.set_viewport_size({'width': 1440, 'height': 1000})
        rummy.screenshot(path=str(qa / 'artist-store-rummy.png'))
        spades.screenshot(path=str(qa / 'artist-store-spades.png'))
        page.set_viewport_size({'width': 390, 'height': 950})
        page.reload()
        expect(page.get_by_role('region', name='Rummy+ earned artwork', exact=True).get_by_role('article', name='Verdant Grove', exact=True).get_by_role('button', name='Equipped', exact=True)).to_be_disabled()

        for game, deck, count in [('rummy', 'rummy-deck-grove', 10), ('spades', 'spades-deck-ember', 13)]:
            page.goto(base_url + '/games/' + game)
            expect(page.locator('.' + game + '-live-table')).to_be_visible()
            hand = page.locator('.game-hand-section .clubhouse-playing-card .card-artwork')
            expect(hand).to_have_count(count)
            assert hand.evaluate_all('(nodes,deck)=>nodes.every(n=>n.dataset.deck===deck)', deck)
            # Court portraits and suit/rank corner indices stay present in the
            # same renderer in live hands, not only the Store thumbnails.
            courts = page.locator('.game-hand-section li[data-card="JS"], .game-hand-section li[data-card="QH"], .game-hand-section li[data-card="KD"], .game-hand-section li[data-card="KC"]')
            expect(courts).to_have_count(4)
            for card in courts.all():
                assert card.locator('[data-painted-panel]').count() >= 1
                assert card.locator('text').first.text_content() in ('J', 'Q', 'K')
            for width, height in [(390, 844), (768, 1024), (1024, 768)]:
                page.set_viewport_size({'width': width, 'height': height})
                verify_fitted(page)
                if width == 390:
                    # A royal card remains selectable by its exposed index
                    # when the playing-size faces overlap in a phone fan.
                    jack = page.locator('.game-hand-section li[data-card="JS"] button')
                    jack.click(position={'x': 5, 'y': 16})
                    expect(jack).to_have_attribute('aria-pressed', 'true')
                    jack.click(position={'x': 5, 'y': 16})
                    expect(jack).to_have_attribute('aria-pressed', 'false')
                page.screenshot(path=str(qa / f'{game}-artist-{width}x{height}.png'))
            checks.append(f'{game.title()} reloads the Store-equipped deck into real hand and pile renderers and fits phone/tablet portrait and landscape')
        assert assets >= {'/card-art/' + theme + '.webp' for theme in ['heritage', 'atlas', 'ember', 'grove', 'deco']}, assets
        assert not fixture.unhandled, fixture.unhandled
        assert not errors, errors
        context.close()
        browser.close()
    print(json.dumps({'checks': checks, 'browser_errors': errors,
                      'real_accounts_or_rewards_changed': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5174')
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
    run(args.base_url)
