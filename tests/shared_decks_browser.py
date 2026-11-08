"""Shared deck checkout, full previews and live renderer QA with fictional APIs.
Real atomic accounting and legacy migration are covered by economy-store.test.ts.
"""
import argparse, copy, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from store_navigation_browser import StoreFixture
from artist_decks_browser import ArtistFixture
from social_browser import ADMIN

DECKS = [('standard', 'Everyday Standard'), ('fantasy', 'Realms of Legend'),
         ('scifi', 'Stellar Dominion'), ('sultanate', 'Sultan’s Court'),
         ('four-color', 'Four-Suit Regalia'), ('chinese', 'Chinese Imperial Courts'), ('egypt', 'Pharaoh’s Court'), ('merfolk', 'Merfolk Kingdoms')]

class SharedFixture(StoreFixture):
    def __init__(self, catalog):
        super().__init__(catalog)
        art = ArtistFixture()
        self.rummy, self.spades = art.rummy, art.spades
        self.wallets[ADMIN].update(points=6000, rummy_points=6000, spades_points=6000)
        self.rummy['jokers'] = True
        self.rummy['hand'] = ['AS', 'JS', 'QH', 'KD', 'KC', '6H', '7D', 'X1', 'X2', 'TC']
        self.wallets[ADMIN]['owned'].append('rummy-jokers')

    def game(self, route):
        path = urlparse(route.request.url).path
        if path.endswith('/events'):
            route.fulfill(content_type='text/event-stream', body=': isolated fixture\n\n')
        elif path.startswith('/api/rummy/room/'):
            self.respond(route, self.rummy)
        elif path.startswith('/api/spades/room/'):
            self.spades['options']['deck'] = self.wallets[ADMIN]['equipped'].get('spades_deck', 'spades-deck-classic')
            self.respond(route, self.spades)
        elif path.endswith('/session'):
            self.respond(route, {'member': True, 'jokers': True})
        else:
            super().game(route)


def fits(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    assert page.evaluate('document.documentElement.scrollHeight <= innerHeight+1')
    expect(page.locator('.game-hand-section')).to_be_visible()


def run(base):
    out = Path('/workspace/work/shared-decks-qa');out.mkdir(parents=True, exist_ok=True)
    checks, errors, failed_assets = [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
        api = p.request.new_context();catalog = api.get(base+'/api/economy/catalog').json()['items'];api.dispose()
        decks = [item for item in catalog if item['slot']=='card_deck']
        assert len(decks)==12 and len({item['id'] for item in decks})==12
        assert all(item['price']==450 and item['cashPrice']==347 for item in decks)
        assert not any(item['id'].startswith(('rummy-deck-', 'spades-deck-')) for item in catalog)
        fixture=SharedFixture(catalog);ctx=fixture.context(browser,ADMIN,1440)
        ctx.route('**/api/spades/**',fixture.game)
        ctx.add_init_script("sessionStorage.setItem('cayea-rummy-room','ABCD1234');sessionStorage.setItem('cayea-spades-room','DEFA1234');")
        page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('response',lambda response:failed_assets.append((response.url,response.status)) if '/card-art/' in response.url and response.status!=200 else None)
        before=copy.deepcopy(fixture.wallets[ADMIN])
        page.goto(base+'/store?category=decks&game=rummy')
        expect(page.get_by_role('heading',name='Shared card decks',exact=True)).to_be_visible()
        page.evaluate("""async themes=>{await Promise.all(themes.map(async theme=>{const image=new Image();image.src='/card-art/'+theme+'.webp';await image.decode();if(image.naturalWidth<600||image.naturalHeight<900)throw new Error('Invalid painted atlas '+theme)}))}""", [key for key,_ in DECKS])
        for key,name in DECKS:
            page.get_by_label('Search decks',exact=True).fill(name)
            card=page.get_by_role('article',name=name,exact=True)
            expect(card).to_contain_text('450 game points or 347 Clubhouse Cash')
            card.get_by_role('button',name='Preview '+name,exact=True).click()
            page.get_by_role('button',name='See every face',exact=True).click()
            contact=page.get_by_role('dialog',name=name+' · 54 illustrated faces',exact=True)
            expect(contact.locator('.artist-deck-contact-sheet > div')).to_have_count(55)
            panels=contact.locator('[data-painted-panel]').evaluate_all('nodes=>[...new Set(nodes.map(n=>Number(n.dataset.paintedPanel)))].sort((a,b)=>a-b)')
            assert panels==list(range(20)),panels
            assert contact.locator('.card-artwork').evaluate_all('(nodes,id)=>nodes.every(n=>n.dataset.deck===id)','card-deck-'+key)
            contact.locator('.artist-deck-contact-sheet').screenshot(path=str(out/(key+'-all-54-faces.png')))
            contact.locator('.artist-deck-contact-sheet > div').evaluate_all("nodes=>nodes.forEach(node=>{const label=node.querySelector('[role=img]')?.getAttribute('aria-label')||'';if(!/^(Jack|Queen|King) of /.test(label))node.style.display='none'})")
            expect(contact.locator('.artist-deck-contact-sheet > div:visible')).to_have_count(12)
            contact.locator('.artist-deck-contact-sheet').screenshot(path=str(out/(key+'-courts.png')))
            page.get_by_role('button',name='Back to preview',exact=True).click();page.get_by_role('button',name='Close preview',exact=True).click()
        assert fixture.wallets[ADMIN]==before and not fixture.economy_calls
        checks.append('Eight distinct decks preview all 54 faces and their independent backs without changing ownership or balances')
        page.set_viewport_size({'width':390,'height':844})
        for index,(key,name) in enumerate(DECKS):
            page.goto(base+'/store?category=decks&game=rummy');expect(page.locator('.store-wallet-link')).to_be_visible();page.get_by_label('Search decks',exact=True).fill(name)
            card=page.get_by_role('article',name=name,exact=True);controls=card.locator('[data-store-item]')
            game='rummy' if index%2==0 else 'spades';payment='cash' if key=='scifi' else 'game'
            controls.get_by_label('Deck points source',exact=True).select_option(game)
            field='points' if payment=='cash' else game+'_points';before=copy.deepcopy(fixture.wallets[ADMIN]);price=347 if payment=='cash' else 450
            controls.get_by_role('button',name=f'Buy · {price} '+('Cash' if payment=='cash' else 'points'),exact=True).click()
            expect(page.get_by_role('dialog')).to_contain_text('Buy once for all compatible 52-card games')
            page.get_by_role('button',name='Confirm purchase',exact=True).click()
            expect(controls.get_by_text('Owned permanently',exact=True)).to_be_visible()
            assert fixture.wallets[ADMIN][field]==before[field]-price
            assert len([id for id in fixture.wallets[ADMIN]['owned'] if id=='card-deck-'+key])==1
            card.get_by_role('button',name='Use design',exact=True).click();expect(card.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
            balance=copy.deepcopy(fixture.wallets[ADMIN])
            page.get_by_role('group',name='Card game',exact=True).get_by_role('button',name='Spades',exact=True).click()
            page.get_by_label('Search decks',exact=True).fill(name);card=page.get_by_role('article',name=name,exact=True)
            expect(card.get_by_text('Owned permanently',exact=True)).to_be_visible();expect(card.get_by_role('button',name='Buy',exact=False)).to_have_count(0)
            card.get_by_role('button',name='Equip',exact=True).click();expect(card.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
            assert {k:v for k,v in fixture.wallets[ADMIN].items() if k!='equipped'}=={k:v for k,v in balance.items() if k!='equipped'}
            for game,count in [('rummy',10),('spades',13)]:
                page.goto(base+'/games/'+game);expect(page.locator('.'+game+'-live-table')).to_be_visible()
                hand=page.locator('.game-hand-section .clubhouse-playing-card .card-artwork');expect(hand).to_have_count(count)
                expect(page.locator('.game-hand-section .clubhouse-playing-card .card-artwork[data-deck="card-deck-'+key+'"]')).to_have_count(count)
                for width,height in [(390,844),(768,1024),(1024,768)]:
                    page.set_viewport_size({'width':width,'height':height});fits(page)
                    if width==390:page.screenshot(path=str(out/(key+'-'+game+'-phone.png')))
                page.set_viewport_size({'width':390,'height':844})
        assert len([call for actor,call in fixture.economy_calls if call['operation']=='purchase'])==len(DECKS)
        checks.append('Eight single purchases charge 450 from the chosen card game or 347 Cash and equip in both games with no second checkout')
        checks.append('All eight decks render in both live hands and piles, including Rummy jokers, and fit phones and both tablet orientations')
        page.goto(base+'/store?category=decks&game=spades');expect(page.locator('.store-wallet-link')).to_be_visible();page.get_by_label('Search decks',exact=True).fill(DECKS[-1][1]);expect(page.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
        assert not errors and not failed_assets and not fixture.unhandled,(errors,failed_assets,fixture.unhandled)
        ctx.close();browser.close()
    report={'checks':checks,'browser_errors':errors,'failed_art_assets':failed_assets,'production_accounts_changed':False}
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5181');args=parser.parse_args();assert urlparse(args.base_url).hostname in ['127.0.0.1','localhost'];run(args.base_url.rstrip('/'))
