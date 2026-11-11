"""Real economy transactions in a loopback TestD1 database; fictional identity only.
Start tests/helpers/dice-crates-preview.ts on 8812 and the production build on 8811.
"""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture
from social_browser import ADMIN
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8811');base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1')
out=Path('/tmp/dice-crate-qa');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);fx=EconomyFixture();c=fx.context(b,ADMIN,width=390)
 c.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
 state={'drop':False,'posts':[]}
 def economy(route):
  path=urlparse(route.request.url).path
  response=route.fetch(url='http://127.0.0.1:8812'+path)
  if route.request.method=='POST':
   state['posts'].append(route.request.post_data_json)
   if state['drop'] and route.request.post_data_json['operation']=='open_dice_crate':state['drop']=False;route.abort('failed');return
  route.fulfill(response=response)
 c.route('**/api/economy**',economy)
 page=c.new_page();page.set_viewport_size({'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/games/farkle');page.get_by_role('button',name='Rewards crates',exact=True).click();panel=page.get_by_role('dialog');expect(panel).to_contain_text('3 unopened');expect(panel).to_contain_text('0 Clubhouse Cash');expect(panel.get_by_role('button',name='Open reward crate',exact=True)).to_be_enabled()
 for w,h in [(320,568),(390,844),(768,1024),(844,390)]:
  page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');assert panel.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1');page.screenshot(path=str(out/f'crates-{w}x{h}.png'))
 page.set_viewport_size({'width':390,'height':844});panel.get_by_role('button',name='Open reward crate',exact=True).click();expect(panel.locator('.dice-crate-reveal')).to_contain_text('+10 Clubhouse Cash');expect(panel.locator('.dice-crate-reveal')).to_contain_text('Fragment 1 of 3');expect(panel).to_contain_text('2 unopened');page.screenshot(path=str(out/'fragment-1.png'))
 page.reload();page.get_by_role('button',name='Rewards crates',exact=True).click();panel=page.get_by_role('dialog');expect(panel.get_by_role('article',name='Ruby Red fragments',exact=True)).to_contain_text('1 / 3 fragments')
 # Lose the reply after the real server committed. The pending crate is recovered by its receipt.
 state['drop']=True;panel.get_by_role('button',name='Open reward crate',exact=True).click();expect(panel.locator('.dice-crate-reveal')).to_contain_text('Fragment 2 of 3');expect(panel).to_contain_text('1 unopened');expect(panel.locator('.dice-crate-actions')).to_contain_text('20 Clubhouse Cash')
 panel.get_by_role('button',name='Open reward crate',exact=True).click();expect(panel.locator('.dice-crate-reveal')).to_contain_text('Set complete!');expect(panel).to_contain_text('0 unopened');expect(panel.locator('.dice-crate-actions')).to_contain_text('30 Clubhouse Cash');expect(panel.get_by_role('article',name='Ruby Red fragments',exact=True)).to_contain_text('Owned permanently');panel.get_by_role('button',name='Equip unlocked dice',exact=True).click();expect(panel.get_by_role('button',name='Equipped in both games',exact=True)).to_be_disabled();page.screenshot(path=str(out/'unlocked.png'))
 page.get_by_role('button',name='Back to game',exact=True).click();page.goto(base+'/games/quintsee');page.get_by_role('button',name='Rewards crates',exact=True).click();panel=page.get_by_role('dialog');expect(panel).to_contain_text('0 unopened');expect(panel.get_by_role('article',name='Ruby Red fragments',exact=True)).to_contain_text('Owned permanently');page.get_by_role('button',name='Back to game',exact=True).click();page.get_by_role('button',name='Dice',exact=True).click();expect(page.get_by_role('article',name='Ruby Red',exact=True)).to_contain_text('Equipped');page.get_by_role('button',name='Back to game',exact=True).click()
 page.goto(base+'/rewards#dice-crates');expect(page.get_by_role('region',name='Dice reward crates')).to_contain_text('30 Clubhouse Cash');expect(page.get_by_role('region',name='Dice reward crates').get_by_role('article',name='Ruby Red fragments',exact=True)).to_contain_text('Owned permanently')
 opened=[r['crateId'] for r in state['posts'] if r['operation']=='open_dice_crate'];assert len(opened)==3 and len(set(opened))==3
 assert not errors,errors
 print(json.dumps({'realCashCredits':30,'threeFragmentsUnlock':True,'crossGameEquip':True,'lostReplyRecovery':True,'threeCratesOnly':True,'mobileNoOverflow':True,'browserErrors':errors,'productionWrites':False}),flush=True)
 c.close()
 guest=b.new_context(viewport={'width':320,'height':568});pg=guest.new_page()
 for slug in ['farkle','quintsee']:
  pg.goto(base+'/games/'+slug);expect(pg.get_by_role('button',name='Rewards crates',exact=True)).to_be_in_viewport();pg.get_by_role('button',name='Rewards crates',exact=True).click();expect(pg.get_by_role('dialog')).to_contain_text('Sign in before');pg.get_by_role('button',name='Back to game',exact=True).click();assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 print(json.dumps({'guestCratesRequireSignIn':True}),flush=True);guest.close();b.close()
