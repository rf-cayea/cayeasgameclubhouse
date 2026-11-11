"""Wallet browser regressions with fictional Supabase identity and economy APIs.

Use the dummy-config Vite server described in member_features_browser.py.
Real database security and concurrency are verified separately by the economy tests.
"""
import argparse
import base64
import copy
import json
import math
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, SupabaseFixture, session


class WalletFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.conversions = {}
        self.fail = False
        self.ambiguous = False
        self.hold = False
        self.pending = []
        for wallet in self.wallets.values():
            wallet.update(gems_points=65, spades_points=2080, rummy_points=1040)
        self.wallets[ADMIN]['f3_points'] = 52
        self.catalog = [
            {'id': 'rummy-jokers', 'name': 'Joker Mode', 'price': 400, 'currency': 'rummy_points', 'slot': None},
            {'id': 'spades-partnerships', 'name': 'Spades Partnerships', 'price': 400, 'currency': 'spades_points', 'slot': None},
        ]
        for slug, name, price in [('celestial', 'Moonlit Celestial', 300), ('jade', 'Jade Sanctuary', 450), ('rose', 'Rose Quartz', 600)]:
            self.catalog.append({'id': 'faith3-skin-' + slug, 'name': name, 'price': price, 'currency': 'points', 'slot': 'faith3_skin'})
        for kind, entries in [('table', [('atlas', 'Moonlit Observatory', 500), ('ember', 'Rosewood Parlour', 650), ('grove', 'Emerald Conservatory', 800), ('deco', 'Gilded Grand Hall', 950)]), ('deck', [('atlas', 'Midnight Atlas', 350), ('ember', 'Ember Crown', 500), ('grove', 'Verdant Grove', 650), ('deco', 'Ivory Deco', 800)])]:
            self.catalog += [{'id': f'spades-{kind}-{slug}', 'name': name, 'price': price, 'currency': 'spades_points', 'slot': 'spades_' + kind} for slug, name, price in entries]

        for item in self.catalog:
            if item['slot'] == 'spades_deck': item['price'] = 300
            item['cashPrice'] = item['price'] if item['currency'] == 'points' else math.ceil(item['price'] * 10 / 13)

    @staticmethod
    def actor(route, fallback=None):
        try:
            payload = route.request.headers.get('authorization', '').split('.')[1]
            return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
        except (IndexError, KeyError, ValueError):
            return fallback

    @staticmethod
    def reply(route, value, status=200):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(value))

    def context(self, browser, user_id, width=1280):
        context = super().context(browser, user_id, width)
        context.route('**/api/economy**', self.economy)
        context.route('**/api/social**', self.social)
        return context

    def http(self, route, fallback_user):
        super().http(route, self.actor(route, fallback_user))

    def view(self, user):
        return {'wallet': copy.deepcopy(self.wallets[user]), 'sources': [], 'humanWinSources': [], 'history': [], 'achievements': [], 'stats': {}, 'progress': {}, 'conversionRate': {'points': 13, 'cash': 10}}

    def social(self, route):
        path = urlparse(route.request.url).path
        if path.endswith('/friends'):
            self.reply(route, {'friends': [], 'incoming': [], 'outgoing': [], 'blocked': []})
        elif path.endswith('/invites'):
            self.reply(route, {'incoming': [], 'outgoing': [], 'rooms': []})
        elif path.endswith('/me'):
            user = self.actor(route)
            self.reply(route, {'userId': user, 'gamerName': 'WalletPlayer', 'bio': '', 'avatar': 'jade', 'joinedAt': 0, 'updatedAt': 0, 'nameFlagged': False, 'relationship': 'self', 'stats': {'rummyWins': 1, 'spadesWins': 0}})
        else:
            self.unhandled.append(path)
            self.reply(route, {'error': 'Unknown fixture social endpoint'}, 404)

    def economy(self, route):
        path = urlparse(route.request.url).path
        if path.endswith('/catalog'):
            self.reply(route, {'items': self.catalog})
            return
        user = self.actor(route)
        assert user in self.wallets, 'Economy fixture requires a fictional member'
        if route.request.method == 'GET':
            self.reply(route, self.view(user))
            return
        body = route.request.post_data_json
        if body['operation'] == 'convert':
            if self.hold:
                self.pending.append((route, user))
            else:
                self.convert(route, user)
            return
        wallet = self.wallets[user]
        if body['operation'] == 'purchase':
            item = next(item for item in self.catalog if item['id'] == body['itemId'])
            owned = item['id'] in wallet['owned']
            if not owned:
                assert wallet[item['currency']] >= item['price']
                wallet[item['currency']] -= item['price']
                wallet['owned'].append(item['id'])
            receipt = {'type': 'purchase', 'itemId': item['id'], 'currency': item['currency'], 'alreadyApplied': owned, 'amount': item['price']}
        elif body['operation'] == 'equip':
            assert body['itemId'] in wallet['owned'] or body['itemId'].endswith('-classic')
            wallet['equipped'][body['slot']] = body['itemId']
            receipt = {'type': 'equip', 'itemId': body['itemId'], 'alreadyApplied': False}
        else:
            raise AssertionError('Unexpected economy operation: ' + str(body))
        self.reply(route, {'ok': True, **self.view(user), 'receipt': receipt})

    def convert(self, route, user):
        body = route.request.post_data_json
        self.calls.append((user, '/api/economy/convert', copy.deepcopy(body)))
        if self.fail:
            self.fail = False
            self.reply(route, {'error': 'Fixture conversion denied; balance unchanged'}, 400)
            return
        key = (user, body['requestId'])
        if key in self.conversions:
            self.reply(route, {'ok': True, **self.view(user), 'receipt': {**self.conversions[key], 'alreadyApplied': True}})
            return
        wallet, quantity = self.wallets[user], body['amount']
        field = {'rummy': 'rummy_points', 'faith-3': 'f3_points', 'spades': 'spades_points', '3-gems': 'gems_points'}[body['game']]
        assert quantity > 0 and quantity % 13 == 0 and wallet[field] >= quantity
        wallet[field] -= quantity
        wallet['points'] += quantity // 13 * 10
        result = {'type': 'conversion', 'amount': quantity, 'cash': quantity // 13 * 10, 'alreadyApplied': False}
        self.conversions[key] = result
        if self.ambiguous:
            self.ambiguous = False
            self.reply(route, {'error': 'Fixture connection lost after commit; retry to confirm'}, 503)
        else:
            self.reply(route, {'ok': True, **self.view(user), 'receipt': result})


parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5174')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
checks, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    fixture = WalletFixture()
    context = fixture.context(browser, ADMIN)
    page, other = context.new_page(), context.new_page()
    for tab in (page, other):
        tab.on('pageerror', lambda error: errors.append(str(error)))
        tab.goto(args.base_url + '/store')
        expect(tab.get_by_test_id('rummy-balance')).to_have_text('1,040')
    amount = page.get_by_role('spinbutton', name='Points to convert')
    convert = page.get_by_role('button', name='Convert to Cash', exact=True)
    for invalid in ('0', '-10', '11', '1010'):
        amount.fill(invalid)
        expect(convert).to_be_disabled()
    checks.append('zero, negative, fractional-block, and over-balance conversions are disabled')
    amount.fill('130')
    convert.click()
    expect(page.get_by_role('dialog')).to_contain_text('100 Clubhouse Cash')
    page.get_by_role('button', name='Cancel', exact=True).click()
    assert not fixture.conversions
    checks.append('conversion cancellation does not debit points')
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('rummy-balance')).to_have_text('910')
    expect(page.get_by_test_id('cash-balance')).to_have_text('100')
    expect(other.get_by_test_id('rummy-balance')).to_have_text('910')
    expect(other.get_by_test_id('cash-balance')).to_have_text('100')
    assert fixture.wallets[ADMIN]['lifetime_points'] == 1000
    checks.append('conversion updates both same-account tabs without adding lifetime earnings')
    page.get_by_role('combobox', name='Conversion game').select_option('faith-3')
    amount.fill('52')
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('cash-balance')).to_have_text('140')
    assert fixture.wallets[ADMIN]['f3_points'] == 0 and fixture.wallets[ADMIN]['rummy_points'] == 910
    checks.append('Faith points convert independently of the Rummy balance')
    page.get_by_role('combobox', name='Conversion game').select_option('rummy')
    amount.fill('13')
    fixture.fail = True
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('balance unchanged')
    expect(page.get_by_test_id('rummy-balance')).to_have_text('910')
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('rummy-balance')).to_have_text('897')
    calls = [body for _, path, body in fixture.calls if path.endswith('/convert')]
    assert calls[-1]['requestId'] != calls[-2]['requestId']
    checks.append('a definite rejected conversion keeps funds and allows a fresh request')
    fixture.ambiguous = True
    amount.fill('897')
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('retry to confirm')
    expect(page.get_by_test_id('rummy-balance')).to_have_text('0')
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_test_id('cash-balance')).to_have_text('840')
    assert len(fixture.conversions) == 4
    checks.append('a lost response after commit can be confirmed with zero balance and no second debit')

    for slug, quantity, cash in [('3-gems', 65, '890'), ('spades', 52, '930')]:
        page.get_by_role('combobox', name='Conversion game').select_option(slug)
        amount.fill(str(quantity))
        convert.click()
        page.get_by_role('button', name='Confirm conversion', exact=True).click()
        expect(page.get_by_test_id('cash-balance')).to_have_text(cash)
    assert fixture.wallets[ADMIN]['gems_points'] == 0 and fixture.wallets[ADMIN]['spades_points'] == 2028
    checks.append('all four games convert into the same Cash balance independently')

    # Spend converted Cash and game points through the same authoritative wallet.
    skin = page.get_by_role('article', name='Moonlit Celestial', exact=True)
    skin.get_by_role('button', name='Buy · 300 Cash', exact=True).click()
    page.get_by_role('button', name='Confirm purchase', exact=True).click()
    expect(page.get_by_test_id('cash-balance')).to_have_text('630')
    skin.get_by_role('button', name='Equip skin', exact=True).click()
    expect(skin.get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
    assert fixture.wallets[ADMIN]['equipped']['faith3_skin'] == 'faith3-skin-celestial'
    checks.append('converted Cash buys a permanent Faith skin and equips it without another debit')

    deck = page.locator('[aria-label="The Spades collection"]').get_by_role('article', name='Midnight Atlas', exact=True)
    deck.get_by_role('button', name='Buy · 300 points', exact=True).click()
    page.get_by_role('button', name='Confirm purchase', exact=True).click()
    expect(page.get_by_test_id('spades-balance')).to_have_text('1,728')
    deck.get_by_role('button', name='Equip', exact=True).click()
    expect(deck.get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
    standard = page.locator('[aria-label="The Spades collection"]').get_by_role('article', name='Clubhouse Standard', exact=True)
    standard.get_by_role('button', name='Equip', exact=True).click()
    expect(standard.get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
    page.locator('[data-store-item="spades-partnerships"]').get_by_role('button', name='Buy · 400 points', exact=True).click()
    page.get_by_role('button', name='Confirm purchase', exact=True).click()
    expect(page.get_by_test_id('spades-balance')).to_have_text('1,328')
    assert 'spades-partnerships' in fixture.wallets[ADMIN]['owned'] and fixture.wallets[ADMIN]['equipped']['spades_deck'] == 'spades-deck-classic'
    checks.append('Spades designs, free-default equipment and permanent partnership unlock use the shared points wallet')

    # An in-flight completion belongs to its original account even after sign-in changes.
    fixture.wallets[ADMIN]['rummy_points'] = 52
    page.reload()
    expect(page.get_by_test_id('rummy-balance')).to_have_text('52')
    fixture.hold = True
    page.get_by_role('spinbutton', name='Points to convert').fill('13')
    page.get_by_role('button', name='Convert to Cash', exact=True).click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('button', name='Converting…', exact=True)).to_be_disabled()
    assert fixture.pending
    page.evaluate("""async session => {
      const {supabase} = await import('/src/integrations/supabase/client.ts');
      const {error} = await supabase.auth.setSession(session); if (error) throw error;
    }""", session(MEMBER))
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_test_id('rummy-balance')).to_have_text('1,040')
    fixture.hold = False
    for route, user in fixture.pending:
        fixture.convert(route, user)
    expect(page.get_by_test_id('cash-balance')).to_have_text('0')
    expect(page.get_by_text('10 Clubhouse Cash added. Lifetime earnings are unchanged.', exact=True)).to_have_count(0)
    assert fixture.wallets[ADMIN]['rummy_points'] == 39
    checks.append('late conversion cannot credit the next account or show the previous account success notice')
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/clubhouse-reward-wallet-mobile.png', full_page=False, animations='disabled')
    checks.append('reward wallet fits a mobile viewport')
    assert not fixture.unhandled, fixture.unhandled
    context.close()

    # Exercise queued/credited table presentation and same-revision refreshes.
    # The game HTTP response here is a UI fixture; real authoritative delivery
    # is separately exercised by rummy-rewards.test.ts and the PostgreSQL suite.
    context = fixture.context(browser, ADMIN)
    context.add_init_script("sessionStorage.setItem('cayea-rummy-room', 'ABCD1234'); window.walletRefreshes = 0; window.addEventListener('clubhouse-wallet', () => window.walletRefreshes++);")
    pending_reward = {'status': 'pending', 'tier': 'normal', 'amount': 70,
                      'message': 'Your win is verified. 70 Rummy+ points are queued and will sync automatically.'}
    room = {'code': 'ABCD1234', 'mode': 'bot', 'variant': 'classic', 'capacity': 2,
            'status': 'finished', 'revision': 5, 'owner': True, 'mySeat': 0,
            'players': [{'id': ADMIN, 'name': 'Alice', 'bot': False, 'count': 0, 'score': 105, 'ready': True, 'you': True},
                        {'id': 'bot-1', 'name': 'Computer', 'bot': True, 'count': 1, 'score': 0, 'ready': True, 'you': False}],
            'hand': [], 'discard': ['AS'], 'stockCount': 10, 'melds': [], 'phase': 'gameOver',
            'turn': 0, 'dealer': 0, 'round': 2, 'target': 100, 'winner': 0,
            'roundResult': {'winner': 0, 'points': [10, 0], 'note': 'Alice wins the round.'},
            'mustUse': None, 'drewDiscard': None, 'opening': None, 'jokers': False,
            'log': ['Alice wins.'], 'revealedHands': [[], ['KH']], 'reward': pending_reward}

    def game_http(route):
        path = urlparse(route.request.url).path
        if path.endswith('/appearance'):
            route.fulfill(content_type='application/json', body=json.dumps({'member': True, 'wins': 1, 'owned': ['rummy-room-classic', 'rummy-table-classic', 'rummy-room-riviera', 'rummy-standard', 'rummy-deck-atlas'], 'equipped': {'background': 'rummy-room-classic', 'table': 'rummy-table-classic', 'deck': 'rummy-standard'}}))
        elif path.endswith('/events'):
            route.fulfill(content_type='text/event-stream', body=': fixture\n\n')
        elif path.endswith('/session'):
            route.fulfill(content_type='application/json', body='{"member":true,"jokers":false}')
        else:
            route.fulfill(content_type='application/json', body=json.dumps(room))

    context.route('**/api/rummy/**', game_http)
    game, wallet = context.new_page(), context.new_page()
    for tab in (game, wallet):
        tab.on('pageerror', lambda error: errors.append(str(error)))
    wallet.goto(args.base_url + '/store')
    expect(wallet.get_by_test_id('rummy-balance')).to_have_text('39')
    game.goto(args.base_url + '/games/rummy')
    expect(game.get_by_role('dialog', name='Round result', exact=True)).to_be_visible()
    game.get_by_role('button', name='Back to game', exact=True).click()
    expect(game.get_by_text(pending_reward['message'], exact=True)).to_be_visible()
    expect(wallet.get_by_test_id('rummy-balance')).to_have_text('39')
    checks.append('a queued match win does not display an optimistic wallet credit')
    room['reward'] = {'status': 'credited', 'tier': 'normal', 'amount': 70,
                      'source': 'rummy:win:99999999-9999-4999-8999-999999999999',
                      'message': '70 Rummy+ points credited to your wallet.'}
    fixture.wallets[ADMIN]['rummy_points'] += 70
    fixture.wallets[ADMIN]['lifetime_points'] += 70
    game.evaluate("window.dispatchEvent(new Event('focus'))")
    expect(game.get_by_role('status').filter(has_text=room['reward']['message'])).to_be_visible()
    expect(wallet.get_by_test_id('rummy-balance')).to_have_text('109')
    expect(game.get_by_role('link', name='View reward wallet', exact=True)).to_be_visible()
    assert game.evaluate('window.walletRefreshes') == 1
    checks.append('a confirmed match credit refreshes an open wallet tab at the same room revision')
    room['reward'] = pending_reward
    with game.expect_response(lambda response: response.url.endswith('/api/rummy/room/ABCD1234')) as stale:
        game.evaluate("window.dispatchEvent(new Event('focus'))")
    assert stale.value.json()['reward']['status'] == 'pending'
    game.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    expect(game.get_by_role('status').filter(has_text='70 Rummy+ points credited to your wallet.')).to_be_visible()
    assert game.evaluate('window.walletRefreshes') == 1
    checks.append('stale queued responses cannot regress a confirmed credit or notify it twice')
    game.screenshot(path='/tmp/clubhouse-rummy-reward-credited.png', full_page=False, animations='disabled')
    context.close()
    browser.close()
assert not errors, errors
print(json.dumps({'mode': 'intercepted reward wallet fixtures', 'passed_checks': checks, 'uncaught_browser_errors': errors}))
