"""Loopback built Worker UI and real isolated economy transactions; no production writes."""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture
from social_browser import ADMIN
base='http://127.0.0.1:8811';out=Path('/tmp/shared-crate-qa');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);fx=EconomyFixture();c=fx.context(b,ADMIN,width=390)
 c.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
 def economy(r):r.fulfill(response=r.fetch(url='http://127.0.0.1:8812'+urlparse(r.request.url).path))
 c.route('**/api/economy**',economy);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_viewport_size({'width':390,'height':844})
 for slug,collection in [('dominoes','dominoes'),('rummy','cards')]:
  page.goto(base+'/games/'+slug);page.get_by_role('button',name='Rewards crates',exact=True).click();panel=page.get_by_role('dialog');expect(panel).to_contain_text('3 unopened')
  for w,h in [(320,568),(375,667),(390,844),(768,1024),(1024,768),(844,390),(568,320)]:
   page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');assert panel.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1');page.screenshot(path=str(out/f'{slug}-{w}x{h}.png'))
  page.set_viewport_size({'width':390,'height':844})
  for n in range(1,4):
   panel.get_by_role('button',name='Open reward crate',exact=True).click();expect(panel.locator('.dice-crate-reveal')).to_contain_text('+10 Clubhouse Cash');expect(panel).to_contain_text(str(3-n)+' unopened');expect(panel.locator('.dice-crate-reveal')).to_contain_text('Set complete!' if n==3 else f'Fragment {n} of 3')
  page.screenshot(path=str(out/f'{slug}-unlocked.png'))
  if slug=='dominoes':
   panel.get_by_role('button',name='Equip unlocked tiles',exact=True).click();expect(panel.locator('.dice-crate-reveal').get_by_role('button',name='Equipped',exact=True)).to_be_disabled();page.get_by_role('button',name='Back to game',exact=True).click();expect(page.locator('.dm-setup-art [data-domino-skin="domino-skin-ruby"]').first).to_be_visible()
  else:page.get_by_role('button',name='Back to game',exact=True).click()
 page.goto(base+'/games/spades');page.get_by_role('button',name='Rewards crates',exact=True).click();panel=page.get_by_role('dialog');expect(panel).to_contain_text('0 unopened');expect(panel.get_by_role('article',name='Everyday Standard fragments',exact=True)).to_contain_text('Owned permanently');page.get_by_role('button',name='Back to game',exact=True).click()
 page.get_by_role('button',name='Collection',exact=True).click();deck=page.get_by_role('article',name='Everyday Standard',exact=True);expect(deck).to_be_visible();deck.get_by_role('button',name='Equip',exact=True).click();expect(deck.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
 page.goto(base+'/store?category=dominoes');page.get_by_role('button',name='Desserts',exact=True).click();expect(page.locator('.dm-skin-products article')).to_have_count(6);expect(page.locator('.dm-skin-products svg [data-finish]').first).to_be_visible();page.screenshot(path=str(out/'dessert-dominoes.png'))
 for w in [320,390,768]:
  page.set_viewport_size({'width':w,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 page.goto(base+'/rewards');page.get_by_role('group',name='Reward crate collections').get_by_role('button',name='Dominoes',exact=True).click();expect(page.get_by_role('region',name='Dominoes reward crates')).to_contain_text('Owned permanently');page.get_by_role('button',name='Card decks',exact=True).click();expect(page.get_by_role('region',name='Card-deck reward crates')).to_contain_text('Owned permanently')
 c.close();guest=b.new_context(viewport={'width':320,'height':568});pg=guest.new_page()
 for slug in ['dominoes','rummy','spades']:
  pg.goto(base+'/games/'+slug);expect(pg.get_by_role('button',name='Rewards crates',exact=True)).to_be_in_viewport();pg.get_by_role('button',name='Rewards crates',exact=True).click();expect(pg.get_by_role('dialog')).to_contain_text('Sign in before');pg.get_by_role('button',name='Back to game',exact=True).click();assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1')
 pg.goto(base+'/games/dominoes');pg.get_by_role('button',name='Start match',exact=True).click();expect(pg.locator('.dm-live')).to_be_visible()
 pg.wait_for_function("document.querySelector('[data-domino-tile]')||document.querySelector('.dm-hand>button[data-playable=true]:not([disabled])')")
 if pg.locator('[data-domino-tile]').count()==0:
  pg.locator('.dm-hand>button[data-playable=true]').first.click();pg.get_by_role('button',name='Open table',exact=True).click()
 expect(pg.locator('[data-domino-tile]').first).to_be_visible(timeout=12000)
 # The actual board uses one portrait print physically turned inside each horizontal tile.
 face=pg.locator('[data-domino-tile] [data-domino-orientation="horizontal"]').first;expect(face).to_have_attribute('transform','translate(0 52) rotate(-90)');assert pg.locator('[data-domino-print="fixed"]').count()>0
 pg.screenshot(path=str(out/'domino-board.png'));assert not errors,errors
 print(json.dumps({'dominoCratesUnlockAndEquip':True,'cardDecksSharedBetweenGames':True,'matchingThemedDominoArt':True,'mobileAndTabletFits':True,'physicalPipRotation':True,'browserErrors':errors,'productionWrites':False}),flush=True);guest.close();b.close()
