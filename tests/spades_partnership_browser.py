"""Permanent partnership purchase UI, with explicitly fictional Supabase APIs.
Real HTTP room access and PostgreSQL enforcement are tested separately.
"""
import argparse
import base64
import json
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, SupabaseFixture, session

ITEM = 'spades-partnerships'

class PartnershipFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.wallets[ADMIN]['spades_points'] = 800
        self.wallets[MEMBER]['spades_points'] = 799
        self.purchases = []
        self.hold = False
        self.pending = []
        self.fail = False

    def http(self, route, fallback):
        try:
            payload = route.request.headers.get('authorization', '').split('.')[1]
            user = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
        except (ValueError, KeyError, IndexError):
            user = fallback
        path = urlparse(route.request.url).path
        body = route.request.post_data_json if route.request.post_data else {}
        if path.endswith('/rpc/purchase_store_item') and body.get('_item_id') == ITEM:
            if self.hold:
                self.pending.append((route, user))
            else:
                self.purchase(route, user)
        else:
            super().http(route, user)

    def purchase(self, route, user):
        body = route.request.post_data_json
        self.purchases.append((user, body))
        assert body == {'_item_id': ITEM}, body
        def reply(value, status=200):
            route.fulfill(status=status, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(value))
        wallet = self.wallets[user]
        if self.fail:
            self.fail = False
            reply({'message': 'Fixture purchase denied; no points charged', 'code': '22023'}, 400)
            return
        owned = ITEM in wallet['owned']
        if not owned:
            if wallet['spades_points'] < 800:
                reply({'message': 'Not enough Spades points', 'code': '22023'}, 400)
                return
            wallet['spades_points'] -= 800
            wallet['owned'].append(ITEM)
        reply({'item_id': ITEM, 'owned': True, 'already_owned': owned, 'balance': wallet['spades_points'], 'currency': 'spades_points', 'price': 800})

def switch_account(page, user):
    page.evaluate("""async session => {
      const {supabase} = await import('/src/integrations/supabase/client.ts');
      const {error} = await supabase.auth.setSession(session); if(error) throw error;
    }""", session(user))

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5188')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
checks, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    fixture = PartnershipFixture()
    context = fixture.context(browser, MEMBER, width=390)
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/store#spades-partnerships')
    unlock = page.get_by_role('button', name='Unlock Spades Partnerships · 800 points', exact=True)
    expect(unlock).to_be_disabled()
    expect(page.get_by_text('Earn 1 more Spades point to unlock.', exact=True)).to_be_visible()
    assert not fixture.purchases
    checks.append('799 Spades points cannot buy partnerships, even with 1000 Rummy points')
    context.close()

    context = fixture.context(browser, ADMIN, width=390)
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/games/spades')
    mode = page.get_by_label('Spades scoring mode', exact=True)
    expect(mode).to_have_value('solo')
    assert mode.locator('option[value="teams"]').evaluate('option => option.disabled')
    page.get_by_role('link', name='Unlock 2v2 partnerships for 800 Spades points', exact=True).click()
    unlock = page.get_by_role('button', name='Unlock Spades Partnerships · 800 points', exact=True)
    expect(unlock).to_be_enabled()
    page.set_viewport_size({'width': 320, 'height': 740})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    unlock.click()
    expect(page.get_by_role('dialog')).to_contain_text('800 Spades points')
    assert page.get_by_role('dialog').evaluate('dialog => { const rect = dialog.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth; }')
    page.screenshot(path='/tmp/spades-partnership-unlock-mobile.png', full_page=True)
    page.get_by_role('button', name='Cancel', exact=True).click()
    assert not fixture.purchases
    checks.append('the locked mode links to the central store and cancelling spends no points')
    fixture.fail = True
    unlock.click()
    page.get_by_role('button', name='Confirm partnership unlock', exact=True).click()
    expect(page.get_by_role('dialog').get_by_role('alert')).to_contain_text('no points charged')
    assert fixture.wallets[ADMIN]['spades_points'] == 800 and ITEM not in fixture.wallets[ADMIN]['owned']
    page.get_by_role('button', name='Confirm partnership unlock', exact=True).click()
    expect(page.get_by_role('button', name='Spades Partnerships owned', exact=True)).to_be_disabled()
    expect(page.get_by_test_id('spades-balance')).to_have_text('0')
    assert fixture.wallets[ADMIN]['rummy_points'] == fixture.wallets[ADMIN]['lifetime_points'] == 1000
    assert fixture.wallets[ADMIN]['points'] == 0
    checks.append('a confirmed permanent unlock debits exactly 800 Spades points; failed attempts preserve the wallet')
    page.reload()
    expect(page.get_by_role('button', name='Spades Partnerships owned', exact=True)).to_be_disabled()
    assert len(fixture.purchases) == 2
    page.get_by_role('link', name='Play partnership Spades', exact=True).click()
    expect(page.get_by_label('Spades scoring mode', exact=True)).to_have_value('teams')
    assert not page.get_by_label('Spades scoring mode', exact=True).locator('option[value="teams"]').evaluate('option => option.disabled')
    checks.append('ownership survives reload and enables partnership mode with zero remaining points')
    page.set_viewport_size({'width': 320, 'height': 740})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    checks.append('the store, purchase confirmation, and mode controls fit a 320-pixel phone')
    context.close()

    fixture = PartnershipFixture(); fixture.hold = True
    context = fixture.context(browser, ADMIN, width=390)
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/store')
    page.get_by_role('button', name='Unlock Spades Partnerships · 800 points', exact=True).click()
    page.get_by_role('button', name='Confirm partnership unlock', exact=True).click()
    expect(page.get_by_role('button', name='Unlocking partnerships…', exact=True)).to_be_disabled()
    assert len(fixture.pending) == 1
    switch_account(page, MEMBER)
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_test_id('spades-balance')).to_have_text('799')
    fixture.hold = False
    for route, user in fixture.pending:
        fixture.purchase(route, user)
    expect(page.get_by_role('button', name='Unlock Spades Partnerships · 800 points', exact=True)).to_be_disabled()
    expect(page.get_by_role('button', name='Spades Partnerships owned', exact=True)).to_have_count(0)
    expect(page.get_by_text('Spades Partnerships unlocked permanently.', exact=False)).to_have_count(0)
    page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='Games', exact=True).click()
    page.get_by_role('link', name='Play Spades', exact=True).click()
    expect(page.get_by_label('Spades scoring mode', exact=True)).to_have_value('solo')
    assert page.get_by_label('Spades scoring mode', exact=True).locator('option[value="teams"]').evaluate('option => option.disabled')
    assert fixture.wallets[ADMIN]['owned'] == [ITEM] and fixture.wallets[MEMBER]['owned'] == []
    checks.append('a late purchase cannot unlock 2v2 or show success for a different signed-in account')
    assert not fixture.unhandled, fixture.unhandled
    assert not errors, errors
    context.close(); browser.close()
print(json.dumps({'mode': 'fictional/intercepted Supabase APIs', 'checks': checks, 'browser_errors': errors}))
