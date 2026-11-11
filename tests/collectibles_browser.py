"""Original album UI against isolated real server transactions, never production users.
Start collectibles-preview.ts on 8812 and the built Worker on 8811.
"""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture
from social_browser import ADMIN,MEMBER
base='http://127.0.0.1:8811';out=Path('/tmp/collectibles-qa');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']);fx=EconomyFixture();contexts=[];errors=[];state={'drop':False,'posts':[]}
 def context(user,width=390):
  c=fx.context(browser,user,width);contexts.append(c)
  c.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
  c.add_init_script('''window.__boosterAudio=0;const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(...args){window.__boosterAudio++;return original.apply(this,args);};''')
  def api(route):
   response=route.fetch(url='http://127.0.0.1:8812'+urlparse(route.request.url).path)
   if route.request.method=='POST':
    command=route.request.post_data_json;state['posts'].append(command)
    if state['drop'] and command['operation']=='open_booster':state['drop']=False;route.abort('failed');return
   route.fulfill(response=response)
  c.route('**/api/economy**',api);c.route('**/api/collectibles**',api)
  return c
 c=context(ADMIN);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/collectibles');expect(page.get_by_role('heading',name='Harvest & Hearth',exact=True)).to_be_visible();expect(page.locator('.ccol-album-seal strong')).to_have_text('2/100');expect(page.locator('.ccol-card-grid .ccol-card')).to_have_count(12)
 # Every generated atlas decodes using the real Worker MIME response.
 art=page.evaluate('''async()=>Promise.all(Array.from({length:10},async(_,i)=>{const im=new Image();im.src=`/collectible-art/harvest-hearth-${i+1}.avif`;await im.decode();return [im.naturalWidth,im.naturalHeight];}))''');assert all(x==[1536,1024] for x in art),art
 expansion=page.evaluate('''async()=>Promise.all(Array.from({length:40},async(_,i)=>{const im=new Image();im.src=`/collectible-art/hh-${i+61}.webp`;await im.decode();return im.naturalWidth>0;}))''');assert all(expansion)
 # Existing image URLs now embed optimized AVIF bytes, with correct MIME and no gzip.
 response=page.request.get(base+'/card-art/atlas.webp');assert response.headers['content-type']=='image/avif';assert 'content-encoding' not in response.headers
 assert page.evaluate('''async()=>{const im=new Image();im.src='/card-art/atlas.webp';await im.decode();return im.naturalWidth>0}''')
 for w,h in[(320,568),(390,844),(768,1024),(1280,800)]:
  page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'album-{w}.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.get_by_label('Season',exact=True).select_option('fall');expect(page.locator('.ccol-pages')).to_contain_text('45 cards');page.get_by_label('Season',exact=True).select_option('winter');expect(page.locator('.ccol-pages')).to_contain_text('55 cards');page.get_by_label('Season',exact=True).select_option('all');page.get_by_label('Show',exact=True).select_option('duplicates');expect(page.locator('.ccol-card-grid .ccol-card')).to_have_count(1);page.get_by_label('Show',exact=True).select_option('all')
 # Detailed artwork opens and focuses an accessible modal.
 page.locator('[data-card-id="hh-01"]').click();expect(page.get_by_role('dialog')).to_contain_text('Copper Pumpkin Morning');page.get_by_role('button',name='Back to album',exact=True).click()
 page.get_by_role('button',name='Boosters (4)',exact=True).click();button=page.get_by_role('button',name='Open 4★ booster',exact=True);button.click();expect(page.locator('.ccol-opening')).to_be_in_viewport();assert page.locator('.ccol-opening .ccol-pack-art').evaluate('(e)=>getComputedStyle(e).animationName')=='ccol-pack-tear';page.screenshot(path=str(out/'opening.png'),full_page=True);expect(page.locator('.ccol-reveal .ccol-card')).to_have_count(3);assert page.locator('.ccol-reveal .ccol-card').first.get_attribute('data-stars')=='4';assert page.evaluate('window.__boosterAudio')>=10;page.wait_for_timeout(1250);page.screenshot(path=str(out/'reveal.png'),full_page=True)
 # Sound toggle persists and suppresses both opening and reveal audio.
 page.get_by_role('button',name='Close reveal',exact=True).click();page.get_by_role('button',name='🔊 Sounds on',exact=True).click();before=page.evaluate('window.__boosterAudio');page.get_by_role('button',name='Open 3★ booster',exact=True).click();expect(page.locator('.ccol-reveal .ccol-card')).to_have_count(3);assert page.evaluate('window.__boosterAudio')==before;assert page.evaluate('localStorage.getItem("clubhouse-booster-muted")')=='true'
 # Reduced motion removes the flip but preserves all saved cards. Lost reply retries the same pack.
 page.get_by_role('button',name='Close reveal',exact=True).click();page.emulate_media(reduced_motion='reduce');state['drop']=True;page.get_by_role('button',name='Open 2★ booster',exact=True).click();expect(page.get_by_role('button',name='Retry pending action',exact=True)).to_be_visible();page.get_by_role('button',name='Retry pending action',exact=True).click();expect(page.locator('.ccol-reveal .ccol-card')).to_have_count(3);assert page.locator('.ccol-reveal>div>div').first.evaluate('(e)=>getComputedStyle(e).animationName')=='none';page.reload();page.get_by_role('button',name='Boosters (1)',exact=True).click();expect(page.get_by_role('button',name='🔇 Sounds off',exact=True)).to_be_visible();page.get_by_role('button',name='Show last opened booster',exact=True).click();expect(page.locator('.ccol-reveal .ccol-card')).to_have_count(3);page.get_by_role('button',name='Close reveal',exact=True).click()
 # Booster shop uses an explicit confirmation and updates the real Cash balance.
 page.goto(base+'/store?category=boosters');expect(page.get_by_role('heading',name='Card boosters',exact=True)).to_be_visible();page.get_by_role('button',name='Buy · 20 Cash',exact=True).click();expect(page.get_by_role('dialog')).to_contain_text('20 Clubhouse Cash');page.get_by_role('button',name='Confirm booster purchase',exact=True).click();expect(page.locator('.ccol-shop')).to_contain_text('Your Cash: 1980');page.screenshot(path=str(out/'shop.png'),full_page=True)
 # Same real duplicate sale between two isolated player browser contexts.
 page.goto(base+'/collectibles');page.get_by_role('button',name='Trades (0)',exact=True).click();page.get_by_label('Player’s gamer name',exact=True).fill('@Tester1');page.get_by_label('Your duplicate',exact=True).select_option('hh-01');page.get_by_role('button',name='Review offer',exact=True).click();expect(page.get_by_role('dialog')).to_contain_text('Price: 5 Cash');page.get_by_role('button',name='Confirm offer',exact=True).click();expect(page.locator('.ccol-trade-list')).to_contain_text('pending')
 d=context(MEMBER,768);other=d.new_page();other.on('pageerror',lambda e:errors.append(str(e)));other.goto(base+'/collectibles');other.get_by_role('button',name='Trades (1)',exact=True).click();other.get_by_role('button',name='Review & accept',exact=True).click();expect(other.get_by_role('dialog')).to_contain_text('Pay 5 Clubhouse Cash');other.get_by_role('button',name='Confirm trade',exact=True).click();expect(other.locator('.ccol-trade-list')).to_contain_text('accepted');expect(other.locator('.ccol-section-heading')).to_contain_text('1995 Clubhouse Cash');other.screenshot(path=str(out/'trade.png'),full_page=True)
 page.reload();page.get_by_role('button',name='Trades (0)',exact=True).click();expect(page.locator('.ccol-section-heading')).to_contain_text('1985 Clubhouse Cash');assert not errors,errors
 opens=[r['packId'] for r in state['posts'] if r['operation']=='open_booster'];assert len(opens)==4 and len(set(opens))==3
 for x in contexts:x.close()
 guest=browser.new_context(viewport={'width':320,'height':568});pg=guest.new_page();pg.goto(base+'/collectibles');expect(pg.locator('.ccol-card-grid .ccol-card')).to_have_count(12);expect(pg.locator('.ccol-notice')).to_contain_text('Sign in');assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1');guest.close();browser.close()
 print(json.dumps({'originalArtCards':100,'atlasesDecode':10,'mobileNoOverflow':True,'animationAndAudio':True,'mutePersists':True,'reducedMotion':True,'lostReplyNoDoubleOpen':True,'realBoosterPurchase':True,'realTwoPlayerTrade':True,'browserErrors':errors,'productionWrites':False}),flush=True)
