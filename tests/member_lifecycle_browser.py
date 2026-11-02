"""Account-switch lifecycle regressions with intercepted, fictional Supabase APIs.

Uses the same dummy-config Vite server as member_features_browser.py (port5174).
No real accounts, credentials, or purchases are used.
"""
import argparse
import base64
import json
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, SupabaseFixture, session


class LifecycleFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.hold_purchase = False
        self.hold_wallet = False
        self.pending_purchases = []
        self.pending_wallets = []

    def http(self, route, fallback_user):
        token = route.request.headers.get('authorization', '').removeprefix('Bearer ')
        try:
            payload = token.split('.')[1]
            user_id = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
        except (IndexError, KeyError, ValueError):
            user_id = fallback_user
        path = urlparse(route.request.url).path
        if self.hold_purchase and path.endswith('/rpc/purchase_store_item'):
            self.pending_purchases.append((route, user_id))
            return
        if self.hold_wallet and user_id == ADMIN and path.endswith('/wallets'):
            self.pending_wallets.append((route, user_id))
            return
        super().http(route, user_id)

    def release_purchases(self):
        self.hold_purchase = False
        pending, self.pending_purchases = self.pending_purchases, []
        for route, user_id in pending:
            super().http(route, user_id)

    def release_wallets(self):
        self.hold_wallet = False
        pending, self.pending_wallets = self.pending_wallets, []
        for route, user_id in pending:
            super().http(route, user_id)


def switch_account(page, user_id):
    page.evaluate("""async session => {
      const {supabase} = await import('/src/integrations/supabase/client.ts');
      const {error} = await supabase.auth.setSession(session);
      if (error) throw error;
    }""", session(user_id))


parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5174')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
checks = []
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    fixture = LifecycleFixture()
    context = fixture.context(browser, ADMIN)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/store')
    unlock = page.get_by_role('button', name='Unlock Joker Mode · 800 points', exact=True)
    expect(unlock).to_be_enabled()
    fixture.hold_purchase = True
    unlock.click()
    page.get_by_role('button', name='Confirm unlock', exact=True).click()
    expect(page.get_by_role('button', name='Unlocking…', exact=True)).to_be_disabled()
    assert fixture.pending_purchases
    switch_account(page, MEMBER)
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_text('Your balance: 1,000 Rummy+ points', exact=True)).to_be_visible()
    fixture.release_purchases()
    expect(unlock).to_be_enabled()
    expect(page.get_by_role('button', name='Joker Mode owned', exact=True)).to_have_count(0)
    expect(page.get_by_text('Joker Mode unlocked! It is yours permanently.', exact=True)).to_have_count(0)
    expect(page.get_by_text('Your balance: 1,000 Rummy+ points', exact=True)).to_be_visible()
    assert fixture.wallets[ADMIN]['rummy_points'] == 200
    assert fixture.wallets[MEMBER]['rummy_points'] == 1000
    checks.append('late purchase completion cannot mark the next account as owning the item or show its success notice')

    context.close()
    fixture = LifecycleFixture()
    fixture.hold_wallet = True
    fixture.wallets[ADMIN]['rummy_points'] = 200
    context = fixture.context(browser, ADMIN)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/store')
    expect(page.get_by_text('Loading your membership…', exact=True)).to_be_visible()
    switch_account(page, MEMBER)
    expect(page.get_by_text('Your balance: 1,000 Rummy+ points', exact=True)).to_be_visible()
    assert fixture.pending_wallets
    fixture.release_wallets()
    expect(page.get_by_role('button', name='Unlock Joker Mode · 800 points', exact=True)).to_be_enabled()
    expect(page.get_by_text('Your balance: 200 Rummy+ points', exact=True)).to_have_count(0)
    expect(page.get_by_text('Your balance: 1,000 Rummy+ points', exact=True)).to_be_visible()
    checks.append('late wallet responses cannot overwrite the next account balance')
    context.close()
    browser.close()
assert not errors, errors
print(json.dumps({'mode': 'intercepted lifecycle fixtures', 'passed_checks': checks, 'uncaught_browser_errors': errors}))
