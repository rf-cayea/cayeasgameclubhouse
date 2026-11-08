"""Spades collection UI with fictional/intercepted Supabase APIs.
Actual PostgreSQL permissions, ownership and debits are covered by run_local.sh.
"""
import argparse
import base64
import json
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, SupabaseFixture, session

ITEMS = [('spades-table-atlas', 'Moonlit Observatory', 500, 'spades_table'), ('spades-table-ember', 'Rosewood Parlour', 650, 'spades_table'),
         ('spades-table-grove', 'Emerald Conservatory', 800, 'spades_table'), ('spades-table-deco', 'Gilded Grand Hall', 950, 'spades_table'),
         ('spades-deck-atlas', 'Midnight Atlas', 350, 'spades_deck'), ('spades-deck-ember', 'Ember Crown', 500, 'spades_deck'),
         ('spades-deck-grove', 'Verdant Grove', 650, 'spades_deck'), ('spades-deck-deco', 'Ivory Deco', 800, 'spades_deck')]

class CollectionFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.wallets[ADMIN]['spades_points'] = 2000
        self.wallets[MEMBER]['spades_points'] = 55
        self.fail = False
        self.hold = False
        self.pending = []
        self.purchases = []
        self.equips = []

    def http(self, route, fallback):
        try:
            payload = route.request.headers.get('authorization', '').split('.')[1]
            user = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
        except (ValueError, KeyError, IndexError):
            user = fallback
        path = urlparse(route.request.url).path
        body = route.request.post_data_json if route.request.post_data else {}
        def respond(data, status=200):
            route.fulfill(status=status, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(data))
        if path.endswith('/store_catalog') and 'in.' in route.request.url:
            respond([{'id': uid, 'name': name, 'price': price, 'currency': 'spades_points', 'slot': slot} for uid, name, price, slot in ITEMS])
        elif path.endswith('/rpc/purchase_store_item') and body.get('_item_id', '').startswith('spades-'):
            if self.hold:
                self.pending.append((route, user))
            else:
                self.purchase(route, user)
        elif path.endswith('/rpc/equip_store_item'):
            self.equips.append((user, body))
            assert body['_item_id'] in self.wallets[user]['owned']
            slot = next(item[3] for item in ITEMS if item[0] == body['_item_id'])
            assert body['_slot'] == slot
            self.wallets[user]['equipped'][slot] = body['_item_id']
            respond({'slot': slot, 'item_id': body['_item_id']})
        elif path.endswith('/rpc/convert_game_points'):
            assert body['_game'] == 'spades' and body['_amount'] == 50
            self.wallets[user]['spades_points'] -= 50
            self.wallets[user]['points'] += 35
            respond({'amount': 50, 'cash': 35, 'already_converted': False})
        else:
            super().http(route, user)

    def purchase(self, route, user):
        body = route.request.post_data_json
        self.purchases.append((user, body))
        assert set(body) == {'_item_id'}
        if self.fail:
            self.fail = False
            route.fulfill(status=400, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({'message': 'Fixture purchase denied; no points charged', 'code': '22023'}))
            return
        uid, name, price, slot = next(item for item in ITEMS if item[0] == body['_item_id'])
        wallet = self.wallets[user]
        already = uid in wallet['owned']
        if not already:
            assert wallet['spades_points'] >= price
            wallet['spades_points'] -= price
            wallet['owned'].append(uid)
        route.fulfill(content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({'item_id': uid, 'owned': True, 'already_owned': already, 'balance': wallet['spades_points'], 'currency': 'spades_points', 'price': price}))

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5184')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
checks, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    fixture = CollectionFixture()
    context = fixture.context(browser, ADMIN, width=390)
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/games/spades#collection')
    expect(page.get_by_text('Your balance:', exact=False).filter(has_text='2000')).to_be_visible()
    atlas = page.get_by_role('article', name='Midnight Atlas', exact=True)
    atlas.get_by_role('button', name='Collect design', exact=True).click()
    page.get_by_role('button', name='Cancel', exact=True).click()
    assert not fixture.purchases
    atlas.get_by_role('button', name='Collect design', exact=True).click()
    page.get_by_role('button', name='Confirm collection', exact=True).click()
    expect(atlas.get_by_role('button', name='Equip', exact=True)).to_be_enabled()
    assert fixture.wallets[ADMIN]['spades_points'] == 1650
    assert fixture.wallets[ADMIN]['rummy_points'] == fixture.wallets[ADMIN]['lifetime_points'] == 1000
    checks.append('confirmed collection sends only an item ID and debits the server catalog price from Spades points only')
    atlas.get_by_role('button', name='Equip', exact=True).click()
    expect(atlas.get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
    venue = page.get_by_role('article', name='Moonlit Observatory', exact=True)
    venue.get_by_role('button', name='Collect design', exact=True).click()
    page.get_by_role('button', name='Confirm collection', exact=True).click()
    venue.get_by_role('button', name='Equip', exact=True).click()
    expect(venue.get_by_role('button', name='Equipped', exact=True)).to_be_disabled()
    page.get_by_role('button', name='Game table', exact=True).click()
    expect(page.get_by_label('Spades table design', exact=True)).to_have_value('spades-table-atlas')
    expect(page.get_by_label('Spades deck design', exact=True)).to_have_value('spades-deck-atlas')
    assert '/spades-art/room-atlas.webp' in page.locator('.spades-scene').evaluate('node => getComputedStyle(node).backgroundImage')
    page.evaluate("""async()=>{const image=new Image();image.src='/spades-art/room-atlas.webp';await image.decode();if(!image.naturalWidth)throw new Error('Venue painting could not load')}""")
    # Phone setup intentionally hides decorative hero cards so the controls
    # fit; inspect the same equipped art in the collection's visible showroom.
    page.get_by_role('button', name='Collection', exact=True).click()
    page.get_by_role('article', name='Midnight Atlas', exact=True).get_by_role('button', name='Preview Midnight Atlas', exact=True).click()
    expect(page.get_by_role('img', name='Midnight Atlas card back', exact=True).first).to_be_visible()
    checks.append('owned venue and deck equip into the next table, changing the room background and rendered card backs')
    fixture.fail = True
    ember = page.get_by_role('article', name='Ember Crown', exact=True)
    ember.get_by_role('button', name='Collect design', exact=True).click()
    page.get_by_role('button', name='Confirm collection', exact=True).click()
    expect(page.get_by_role('dialog').get_by_role('alert')).to_contain_text('no points charged')
    assert fixture.wallets[ADMIN]['spades_points'] == 1150
    page.get_by_role('button', name='Cancel', exact=True).click()
    checks.append('failed collection leaves points and ownership unchanged')
    fixture.hold = True
    ember.get_by_role('button', name='Collect design', exact=True).click()
    page.get_by_role('button', name='Confirm collection', exact=True).click()
    expect(page.get_by_role('button', name='Collecting…', exact=True)).to_be_disabled()
    assert fixture.pending
    page.evaluate("""async session => { const {supabase} = await import('/src/integrations/supabase/client.ts'); const {error} = await supabase.auth.setSession(session); if (error) throw error; }""", session(MEMBER))
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_text('Your balance:', exact=False).filter(has_text='55')).to_be_visible()
    fixture.hold = False
    for route, user in fixture.pending:
        fixture.purchase(route, user)
    expect(ember.get_by_role('button', name='Collect design', exact=True)).to_be_disabled()
    assert fixture.wallets[MEMBER]['owned'] == []
    expect(page.get_by_text('Design collected permanently.', exact=False)).to_have_count(0)
    checks.append('a late purchase cannot unlock cosmetics or show success for the next signed-in account')
    page.get_by_role('navigation', name='Main navigation').get_by_role('link', name='Store', exact=True).click()
    expect(page.get_by_test_id('spades-balance')).to_have_text('55')
    page.get_by_label('Conversion game', exact=True).select_option('spades')
    page.get_by_label('Points to convert', exact=True).fill('50')
    page.get_by_role('button', name='Convert to Cash', exact=True).click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('spades-balance')).to_have_text('5')
    expect(page.get_by_test_id('cash-balance')).to_have_text('35')
    checks.append('Spades wallet points convert to Cash in the central store at the existing 10-to-7 rate')
    page.set_viewport_size({'width': 320, 'height': 740})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not fixture.unhandled, fixture.unhandled
    assert not errors, errors
    browser.close()
print(json.dumps({'mode': 'fictional/intercepted Supabase APIs', 'checks': checks, 'browser_errors': errors}))
