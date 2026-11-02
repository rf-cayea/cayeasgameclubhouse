"""Wallet browser regressions with explicitly fictional, intercepted Supabase APIs.

Use the dummy-config Vite server described in member_features_browser.py.
Database security and concurrency are verified separately by run_local.sh.
"""
import argparse
import base64
import copy
import json
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
        self.wallets[ADMIN]['f3_points'] = 50

    def http(self, route, fallback_user):
        try:
            payload = route.request.headers.get('authorization', '').split('.')[1]
            user = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
        except (IndexError, KeyError, ValueError):
            user = fallback_user
        if urlparse(route.request.url).path.endswith('/rpc/convert_game_points') and route.request.method == 'POST':
            if self.hold:
                self.pending.append((route, user))
                return
            self.convert(route, user)
        else:
            super().http(route, user)

    def convert(self, route, user):
        body = route.request.post_data_json
        self.calls.append((user, '/rest/v1/rpc/convert_game_points', copy.deepcopy(body)))

        def reply(value, status=200):
            route.fulfill(status=status, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(value))

        if self.fail:
            self.fail = False
            reply({'message': 'Fixture conversion denied; balance unchanged', 'code': '22023'}, 400)
            return
        key = (user, body['_request_id'])
        if key in self.conversions:
            reply({**self.conversions[key], 'already_converted': True})
            return
        wallet = self.wallets[user]
        quantity = body['_amount']
        field = 'rummy_points' if body['_game'] == 'rummy' else 'f3_points'
        assert quantity > 0 and quantity % 10 == 0 and wallet[field] >= quantity
        wallet[field] -= quantity
        wallet['points'] += quantity // 10 * 7
        result = {'amount': quantity, 'cash': quantity // 10 * 7, 'already_converted': False}
        self.conversions[key] = result
        if self.ambiguous:
            self.ambiguous = False
            reply({'message': 'Fixture connection lost after commit; retry to confirm', 'code': 'TEMP'}, 503)
        else:
            reply(result)


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
        expect(tab.get_by_test_id('rummy-balance')).to_have_text('1000')
    amount = page.get_by_role('spinbutton', name='Points to convert')
    convert = page.get_by_role('button', name='Convert to Cash', exact=True)
    for invalid in ('0', '-10', '11', '1010'):
        amount.fill(invalid)
        expect(convert).to_be_disabled()
    checks.append('zero, negative, fractional-block, and over-balance conversions are disabled')
    amount.fill('100')
    convert.click()
    expect(page.get_by_role('dialog')).to_contain_text('70 Clubhouse Cash')
    page.get_by_role('button', name='Cancel', exact=True).click()
    assert not fixture.conversions
    checks.append('conversion cancellation does not debit points')
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('rummy-balance')).to_have_text('900')
    expect(page.get_by_test_id('cash-balance')).to_have_text('70')
    expect(other.get_by_test_id('rummy-balance')).to_have_text('900')
    expect(other.get_by_test_id('cash-balance')).to_have_text('70')
    assert fixture.wallets[ADMIN]['lifetime_points'] == 1000
    checks.append('conversion updates both same-account tabs without adding lifetime earnings')
    page.get_by_role('combobox', name='Conversion game').select_option('faith-3')
    amount.fill('50')
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('cash-balance')).to_have_text('105')
    assert fixture.wallets[ADMIN]['f3_points'] == 0 and fixture.wallets[ADMIN]['rummy_points'] == 900
    checks.append('Faith points convert independently of the Rummy balance')
    page.get_by_role('combobox', name='Conversion game').select_option('rummy')
    amount.fill('10')
    fixture.fail = True
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('balance unchanged')
    expect(page.get_by_test_id('rummy-balance')).to_have_text('900')
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('rummy-balance')).to_have_text('890')
    calls = [body for _, path, body in fixture.calls if path.endswith('/convert_game_points')]
    assert calls[-1]['_request_id'] == calls[-2]['_request_id']
    checks.append('failed conversion keeps funds and retries with the original request ID')
    fixture.ambiguous = True
    amount.fill('890')
    convert.click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('retry to confirm')
    expect(page.get_by_test_id('rummy-balance')).to_have_text('0')
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_test_id('cash-balance')).to_have_text('735')
    assert len(fixture.conversions) == 4
    checks.append('a lost response after commit can be confirmed with zero balance and no second debit')

    # An in-flight completion belongs to its original account even after sign-in changes.
    fixture.wallets[ADMIN]['rummy_points'] = 50
    page.reload()
    expect(page.get_by_test_id('rummy-balance')).to_have_text('50')
    fixture.hold = True
    page.get_by_role('spinbutton', name='Points to convert').fill('10')
    page.get_by_role('button', name='Convert to Cash', exact=True).click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_role('button', name='Converting…', exact=True)).to_be_disabled()
    assert fixture.pending
    page.evaluate("""async session => {
      const {supabase} = await import('/src/integrations/supabase/client.ts');
      const {error} = await supabase.auth.setSession(session); if (error) throw error;
    }""", session(MEMBER))
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_test_id('rummy-balance')).to_have_text('1000')
    fixture.hold = False
    for route, user in fixture.pending:
        fixture.convert(route, user)
    expect(page.get_by_test_id('cash-balance')).to_have_text('0')
    expect(page.get_by_text('7 Clubhouse Cash added. Lifetime earnings are unchanged.', exact=True)).to_have_count(0)
    assert fixture.wallets[ADMIN]['rummy_points'] == 40
    checks.append('late conversion cannot credit the next account or show the previous account success notice')
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/clubhouse-reward-wallet-mobile.png', full_page=True)
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
        if path.endswith('/events'):
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
    expect(wallet.get_by_test_id('rummy-balance')).to_have_text('40')
    game.goto(args.base_url + '/games/rummy')
    expect(game.get_by_text(pending_reward['message'], exact=True)).to_be_visible()
    expect(wallet.get_by_test_id('rummy-balance')).to_have_text('40')
    checks.append('a queued match win does not display an optimistic wallet credit')
    room['reward'] = {'status': 'credited', 'tier': 'normal', 'amount': 70,
                      'source': 'rummy:win:99999999-9999-4999-8999-999999999999',
                      'message': '70 Rummy+ points credited to your wallet.'}
    fixture.wallets[ADMIN]['rummy_points'] += 70
    fixture.wallets[ADMIN]['lifetime_points'] += 70
    game.evaluate("window.dispatchEvent(new Event('focus'))")
    expect(game.get_by_role('status').filter(has_text=room['reward']['message'])).to_be_visible()
    expect(wallet.get_by_test_id('rummy-balance')).to_have_text('110')
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
    game.screenshot(path='/tmp/clubhouse-rummy-reward-credited.png', full_page=True)
    context.close()
    browser.close()
assert not errors, errors
print(json.dumps({'mode': 'intercepted reward wallet fixtures', 'passed_checks': checks, 'uncaught_browser_errors': errors}))
