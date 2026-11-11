"""Real loopback economy openings, collectible unlocks and browser audio/motion checks."""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture
from social_browser import ADMIN
base='http://127.0.0.1:8811';out=Path('/tmp/crate-animation-qa');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);fx=EconomyFixture();ctx=fx.context(b,ADMIN,width=390)
 ctx.add_init_script('''(()=>{const Native=window.AudioContext;window.__crateTones=0;if(Native)window.AudioContext=new Proxy(Native,{construct(T,a){const c=Reflect.construct(T,a),make=c.createOscillator.bind(c);c.createOscillator=()=>{window.__crateTones++;return make();};return c;}});})();''')
 ctx.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
 ctx.route('**/api/economy**',lambda r:r.fulfill(response=r.fetch(url='http://127.0.0.1:8812'+urlparse(r.request.url).path)))
 ctx.route('**/api/backgammon**',lambda r:r.fulfill(response=r.fetch(url='http://127.0.0.1:8812'+urlparse(r.request.url).path)))
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/backgammon');page.get_by_role('button',name='Rewards crates',exact=True).click();panel=page.get_by_role('dialog');expect(panel).to_contain_text('6 unopened');expect(panel).to_contain_text('10–45 Cash');expect(panel).to_contain_text('30–75 Cash');expect(panel).to_contain_text('0/7 computer matches')
 for n in range(1,7):
  if n==2:panel.get_by_role('button',name='Mute crate sounds',exact=True).click()
  tones=page.evaluate('window.__crateTones');panel.get_by_role('button',name='Open reward crate',exact=True).click();expect(panel.locator('.dice-crate-opening')).to_be_visible();assert panel.locator('.dice-crate-opening .dice-crate-art').evaluate('(e)=>e.getAnimations().length')>0;page.screenshot(path=str(out/f'opening-{n}.png'));expect(panel.locator('.dice-crate-reveal')).to_contain_text('+10 Clubhouse Cash');expect(panel).to_contain_text(f'{6-n} unopened');expect(panel.locator('.dice-crate-opening')).to_have_count(0)
  if n==1:assert page.evaluate('window.__crateTones')>tones
  else:assert page.evaluate('window.__crateTones')==tones
  if n in [3,6]:
   expect(panel.locator('.dice-crate-reveal')).to_contain_text('Set complete!');panel.locator('.dice-crate-reveal').get_by_role('button',name='Equip unlocked set',exact=True).click();expect(panel.locator('.dice-crate-reveal').get_by_role('button',name='Equipped',exact=True)).to_be_disabled();page.screenshot(path=str(out/f'unlocked-{n}.png'))
 for w,h in [(320,568),(390,844),(768,1024),(844,390)]:
  page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');assert panel.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Back to game',exact=True).click();page.get_by_role('button',name='Start Backgammon',exact=True).click();expect(page.locator('.bg-board-art[data-bg-board="bg-board-admiralty"]')).to_be_visible();expect(page.locator('.bg-board-art [data-bg-checkers="bg-checkers-admiralty"]').first).to_be_visible();page.screenshot(path=str(out/'equipped-board-checkers.png'))
 page.goto(base+'/games/quintsee');page.get_by_role('button',name='Rewards crates',exact=True).click();panel=page.get_by_role('dialog');expect(panel).to_contain_text('3 unopened');expect(panel.get_by_role('button',name='Enable crate sounds',exact=True)).to_be_visible();page.emulate_media(reduced_motion='reduce');panel.get_by_role('button',name='Open reward crate',exact=True).click();expect(panel.locator('.dice-crate-opening')).to_be_visible();assert panel.locator('.dice-crate-opening .dice-crate-art').evaluate('(e)=>e.getAnimations().length')==0;expect(panel.locator('.dice-crate-reveal')).to_contain_text('+10 Clubhouse Cash');assert not errors,errors
 print(json.dumps({'realCrateCashCredits':70,'boardAndCheckerUnlocks':True,'equipmentAppliesInGame':True,'openingAnimationAndSounds':True,'mutePersistsAcrossGames':True,'reducedMotion':True,'mobilePanelsFit':True,'browserErrors':errors,'productionWrites':False}),flush=True);ctx.close();b.close()
