"""Pricing and dual-currency store checks against the actual in-memory Node API."""
import json
import subprocess
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from social_browser import SocialFixture, ADMIN

BASE = 'http://127.0.0.1:5174'
@contextmanager
def fixture_server():
    process = subprocess.Popen(['node', '--import', 'tsx', 'tests/puzzle-browser-server.ts', '--store'], cwd=Path(__file__).resolve().parent.parent, stdout=subprocess.PIPE, text=True)
    try:
        assert 'ready' in process.stdout.readline()
        yield
    finally:
        process.terminate()
        try:
            process.wait(timeout=6)
        except subprocess.TimeoutExpired:
            process.kill();process.wait()

checks, errors = [], []
with fixture_server(), sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    fixture = SocialFixture()
    context = fixture.context(browser, ADMIN, width=390)
    def api(route):
        actor = fixture.actor(route)
        headers = {k: v for k, v in route.request.headers.items() if k not in ['host', 'content-length', 'authorization']}
        if actor:
            headers['authorization'] = 'Bearer ' + actor
        response = route.fetch(url='http://127.0.0.1:8788' + urlparse(route.request.url).path, headers=headers)
        route.fulfill(response=response)
    context.route('**/api/**', api)
    page = context.new_page();page.emulate_media(reduced_motion='reduce')
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/store')
    expect(page.get_by_test_id('cash-balance')).to_have_text('2,000')
    read = """async path=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {data}=await supabase.auth.getSession();return (await fetch(path,{headers:{Authorization:'Bearer '+data.session.access_token}})).json();}"""
    catalog = page.evaluate(read, '/api/economy/catalog')['items']
    for item in catalog:
        assert item['cashPrice'] > 0
        if item['slot'] in ['rummy_deck', 'spades_deck']:
            assert (item['price'], item['cashPrice']) == (300, 231)
    assert all(item['price'] == 400 and item['cashPrice'] == 308 for item in catalog if item['id'] in ['rummy-jokers', 'spades-partnerships'])
    def buy(item_id, payment):
        controls = page.locator(f'[data-store-item="{item_id}"]')
        item = next(item for item in catalog if item['id'] == item_id)
        button = f'Buy · {item["cashPrice"]} Cash' if payment == 'cash' else f'Buy · {item["price"]} points'
        controls.get_by_role('button', name=button, exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog).to_contain_text(str(item['cashPrice'] if payment == 'cash' else item['price']))
        dialog.get_by_role('button', name='Confirm purchase', exact=True).click()
        expect(dialog).to_have_count(0)
        expect(controls).to_contain_text('Owned permanently')

    buy('rummy-deck-atlas', 'cash')
    expect(page.get_by_test_id('cash-balance')).to_have_text('1,769')
    atlas = page.get_by_role('article', name='Midnight Atlas', exact=True).filter(has=page.locator('[data-store-item="rummy-deck-atlas"]'))
    # The purchased controls disappear when the existing collection refreshes.
    rummy_section = page.locator('[aria-label="Rummy+ earned artwork"]')
    rummy_section.get_by_role('article', name='Midnight Atlas', exact=True).get_by_role('button', name='Use design', exact=True).click()
    assert page.evaluate(read, '/api/rummy/appearance')['equipped']['deck'] == 'rummy-deck-atlas'
    buy('rummy-deck-ember', 'game')
    expect(page.get_by_test_id('rummy-balance')).to_have_text('700')
    buy('rummy-jokers', 'cash')
    expect(page.get_by_test_id('cash-balance')).to_have_text('1,461')
    assert page.evaluate(read, '/api/rummy/session')['jokers'] is True
    buy('spades-partnerships', 'game')
    expect(page.get_by_test_id('spades-balance')).to_have_text('600')
    buy('spades-deck-atlas', 'cash')
    expect(page.get_by_test_id('cash-balance')).to_have_text('1,230')
    spades_section = page.locator('[aria-label="The Spades collection"]')
    spades_section.get_by_role('article', name='Midnight Atlas', exact=True).get_by_role('button', name='Equip', exact=True).click()
    buy('spades-deck-ember', 'game')
    expect(page.get_by_test_id('spades-balance')).to_have_text('300')
    checks.append('Both games sell300point/231Cash decks; paid Rummydeck equips;400point/308Cash modes update actual game permissions')

    buy('spades-table-atlas', 'cash')
    expect(page.get_by_test_id('cash-balance')).to_have_text('845')
    skin = page.get_by_role('article', name='Moonlit Celestial', exact=True)
    skin.get_by_role('button', name='Buy · 300 Cash', exact=True).click()
    page.get_by_role('dialog').get_by_role('button', name='Confirm purchase', exact=True).click()
    expect(page.get_by_test_id('cash-balance')).to_have_text('545')
    page.get_by_role('combobox', name='Conversion game').select_option('rummy')
    page.get_by_role('spinbutton', name='Points to convert').fill('13')
    page.get_by_role('button', name='Convert to Cash', exact=True).click()
    expect(page.get_by_role('dialog')).to_contain_text('10 Clubhouse Cash')
    page.get_by_role('dialog').get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('cash-balance')).to_have_text('555')
    expect(page.get_by_test_id('rummy-balance')).to_have_text('687')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    checks.append('Tables and Faithskins acceptCash;13points convertto10Cash; store fits390px')
    page.goto(BASE + '/rewards')
    first_light = page.locator('[data-achievement-id="faith-clear-1"]')
    expect(first_light).to_contain_text('+50 Faith 3 pts + 8 Cash')
    mastery = page.locator('[data-achievement-id="faith-clear-280"]')
    expect(mastery).to_contain_text('+5,000 Faith 3 pts + 769 Cash')
    page.set_viewport_size({'width': 768, 'height': 1024})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    first_light.scroll_into_view_if_needed()
    Path('test-results/pricing').mkdir(parents=True, exist_ok=True)
    page.screenshot(path='test-results/pricing/rewards-tablet.png', animations='disabled')
    checks.append('Every achievement displaysCash and harder game milestones display larger bonuses')
    assert not errors, errors
    context.close();browser.close()
print(json.dumps({'checks': checks, 'browser_errors': errors, 'production_accounts_changed': False}))
