"""Browser purchase/equip lifecycle with intercepted fictional Supabase APIs.
The SQL suite separately tests real PostgreSQL permissions and wallet atomicity.
"""
import argparse
import copy
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, SupabaseFixture, session

SKINS = [('faith3-skin-celestial', 'Moonlit Celestial', 300), ('faith3-skin-jade', 'Jade Sanctuary', 450), ('faith3-skin-rose', 'Rose Quartz', 600)]
class Fixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.wallets[ADMIN]['points'] = 1400
    def http(self, route, fallback_user):
        request = route.request
        path = urlparse(request.url).path
        token = request.headers.get('authorization', '').removeprefix('Bearer ')
        try:
            import base64
            payload = token.split('.')[1]
            user = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
        except (ValueError, KeyError, IndexError):
            user = fallback_user
        body = request.post_data_json if request.post_data else {}
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'}
        def respond(value, status=200):
            route.fulfill(status=status, content_type='application/json', headers=headers, body=json.dumps(value))
        if request.method == 'OPTIONS':
            respond({}); return
        if path == '/auth/v1/logout':
            respond({}); return
        if path == '/rest/v1/store_catalog' and 'faith3-skin-' in request.url:
            respond([{'id': id, 'name': name, 'price': price, 'currency': 'points', 'slot': 'faith3_skin'} for id, name, price in SKINS]); return
        if path == '/rest/v1/rpc/purchase_store_item' and body.get('_item_id', '').startswith('faith3-skin-'):
            self.calls.append((user, path, copy.deepcopy(body)))
            skin = next(item for item in SKINS if item[0] == body['_item_id']); wallet = self.wallets[user]
            owned = skin[0] in wallet['owned']
            if not owned and wallet['points'] < skin[2]:
                respond({'message': 'Not enough Clubhouse Cash.', 'code': '22023'}, 400); return
            if not owned:
                wallet['points'] -= skin[2]; wallet['owned'].append(skin[0])
            respond({'item_id': skin[0], 'owned': True, 'already_owned': owned, 'balance': wallet['points'], 'currency': 'points', 'price': skin[2]}); return
        if path == '/rest/v1/rpc/equip_store_item' and body.get('_slot') == 'faith3_skin':
            self.calls.append((user, path, copy.deepcopy(body)))
            id = body['_item_id']; wallet = self.wallets[user]
            if id != 'faith3-classic' and id not in wallet['owned']:
                respond({'message': 'Collect this skin first.', 'code': '22023'}, 400); return
            wallet['equipped']['faith3_skin'] = id
            respond({'item_id': id, 'slot': 'faith3_skin'}); return
        super().http(route, user)

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
parser.add_argument('--screenshots', default='test-results/faith-skins')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('127.0.0.1', 'localhost')
images = Path(args.screenshots); images.mkdir(parents=True, exist_ok=True)
fixture, errors = Fixture(), []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = fixture.context(browser, ADMIN, 1440)
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/games/faith-3')
    page.get_by_role('button', name='Tiles & settings', exact=True).click()
    expect(page.get_by_label('Tile skin', exact=True)).to_be_enabled()
    expect(page.get_by_label('Tile skin', exact=True).locator('option')).to_have_count(1)
    page.goto(args.base_url + '/store')
    store = page.get_by_role('region', name='The Faith 3 atelier')
    expect(store.get_by_test_id('faith-skin-cash')).to_have_text('1,400')
    expect(store.locator('.faith-skin-card')).to_have_count(3)
    for collection in ['0', '3', '9']:
        page.get_by_label('Skin preview collection', exact=True).select_option(collection)
        expect(store.locator('.faith-skin-frame')).to_have_count(9)
    assert not any(path.endswith('purchase_store_item') for _, path, _ in fixture.calls)
    page.get_by_label('Skin preview collection', exact=True).select_option('0')
    store.screenshot(path=str(images / 'store-desktop.png'))
    # Cancelling costs nothing. Two rapid confirms must still send one purchase.
    first = page.get_by_role('article', name='Moonlit Celestial', exact=True)
    first.get_by_role('button', name='Buy · 300 Cash', exact=True).click()
    page.get_by_role('dialog').get_by_role('button', name='Cancel', exact=True).click()
    assert fixture.wallets[ADMIN]['points'] == 1400
    for id, name, price in SKINS:
        page.goto(args.base_url + '/store')
        card = page.get_by_role('article', name=name, exact=True)
        expect(card.get_by_role('button', name=f'Buy · {price} Cash', exact=True)).to_be_enabled()
        card.get_by_role('button', name=f'Buy · {price} Cash', exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Confirm purchase', exact=True).evaluate('(node) => {node.click(); node.click();}')
        expect(card.get_by_role('button', name='Equip skin', exact=True)).to_be_enabled()
        card.get_by_role('button', name='Equip skin', exact=True).click()
        expect(card.get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
        page.goto(args.base_url + '/games/faith-3')
        page.get_by_role('button', name='Tiles & settings', exact=True).click()
        expect(page.get_by_label('Tile skin', exact=True)).to_have_value(id)
        page.get_by_role('button', name='Back to game', exact=True).click()
        expect(page.locator(f'.faith-tile svg[data-skin="{id}"]')).to_have_count(18)
        page.locator('.faith-tile:enabled').first.click()
        expect(page.locator('.faith-tray-filled svg')).to_have_attribute('data-skin', id)
        page.reload()
        page.get_by_role('button', name='Tiles & settings', exact=True).click()
        expect(page.get_by_label('Tile skin', exact=True)).to_have_value(id)
    assert fixture.wallets[ADMIN]['points'] == 50
    assert fixture.wallets[ADMIN]['rummy_points'] == 1000
    purchases = [body for user, path, body in fixture.calls if path.endswith('purchase_store_item') and body.get('_item_id', '').startswith('faith3-skin-')]
    assert purchases == [{'_item_id': id} for id, _, _ in SKINS], purchases
    page.get_by_role('button', name='Back to game', exact=True).click()
    page.locator('.faith-tile:enabled').first.click()
    page.get_by_role('button', name='Tiles & settings', exact=True).click()
    page.get_by_label('Tile skin', exact=True).select_option(SKINS[0][0])
    expect(page.locator('.faith-tray-filled svg')).to_have_attribute('data-skin', SKINS[0][0])
    expect(page.locator('.faith-tile')).to_have_count(17)
    page.get_by_label('Tile collection', exact=True).select_option('8')
    expect(page.locator(f'.faith-tile svg[data-skin="{SKINS[0][0]}"]')).to_have_count(17)
    page.get_by_label('Tile skin', exact=True).select_option('faith3-classic')
    expect(page.locator('.faith-tray-filled svg')).to_have_attribute('data-skin', 'faith3-classic')
    # Another account cannot inherit the first account's ownership or equipment.
    page.evaluate("""async value => {const {supabase}=await import('/src/integrations/supabase/client.ts'); const {error}=await supabase.auth.setSession(value); if(error) throw error;}""", session(MEMBER))
    expect(page.get_by_label('Tile skin', exact=True).locator('option')).to_have_count(1)
    expect(page.locator('.faith-tray-filled svg')).to_have_attribute('data-skin', 'faith3-classic')
    expect(page.get_by_role('link', name='Moderation', exact=True)).to_have_count(0)
    context.close()
    context = fixture.context(browser, MEMBER, 1440)
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/store')
    expect(page.get_by_role('article', name='Moonlit Celestial', exact=True).get_by_role('button', name='Buy · 300 Cash', exact=True)).to_be_disabled()
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page.get_by_role('region', name='The Faith 3 atelier').get_by_role('link', name='Sign in to collect')).to_have_count(3)
    context.close()
    mobile = fixture.context(browser, ADMIN, 390)
    page = mobile.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/store')
    store = page.get_by_role('region', name='The Faith 3 atelier')
    expect(store.locator('.faith-skin-card')).to_have_count(3)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    store.screenshot(path=str(images / 'store-mobile.png'))
    page.goto(args.base_url + '/games/faith-3')
    page.get_by_role('button', name='Tiles & settings', exact=True).click()
    page.get_by_label('Tile skin', exact=True).select_option(SKINS[1][0])
    page.get_by_role('button', name='Back to game', exact=True).click()
    expect(page.locator(f'.faith-tile svg[data-skin="{SKINS[1][0]}"]')).to_have_count(18)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(images / 'game-mobile.png'), full_page=True)
    mobile.close(); browser.close()
assert not errors, errors
assert not fixture.unhandled, fixture.unhandled
print(json.dumps({'purchase_equip_persistence_account_isolation_and_mobile': 'passed', 'real_purchases': False, 'browser_errors': errors}))
