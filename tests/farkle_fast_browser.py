"""Built Worker UI + isolated real Node HTTP/economy; fictional members only."""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture
from member_features_browser import ADMIN,MEMBER,TARGET,POST,session
base='http://127.0.0.1:8811';api='http://127.0.0.1:8813';out=Path('/tmp/farkle-fast-qa');out.mkdir(exist_ok=True)
def call(ctx,uid,body,path='/api/farkle'):
 r=ctx.request.post(api+path,headers={'Authorization':'Bearer '+session(uid)['access_token'],'Origin':api},data=body);assert r.ok,r.text();return r.json()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);errors=[]
 guest=b.new_context(viewport={'width':320,'height':568});page=guest.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/farkle');page.get_by_label('Farkle match length',exact=True).select_option('5000');expect(page.locator('.fk-setup-note')).to_contain_text('Fast Match · 5,000 target')
 for w,h in [(320,568),(390,844),(768,1024),(1024,768),(844,390),(568,320)]:
  page.set_viewport_size({'width':w,'height':h});expect(page.get_by_role('button',name='Start Farkle',exact=True)).to_be_in_viewport();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/f'setup-{w}x{h}.png'))
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Start Farkle',exact=True).click();expect(page.locator('.fk-round')).to_contain_text('TARGET 5,000 · Fast Match')
 for w,h in [(320,568),(390,844),(768,1024),(1024,768),(844,390),(568,320)]:
  page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1');expect(page.locator('.fk-actions')).to_be_in_viewport();assert page.locator('.fk-table>.fk-dice-grid .fk-die-slot').count()==6
 guest.close();fx=EconomyFixture();ctx=fx.context(b,ADMIN,width=390);ctx.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
 def real(route):
  path=urlparse(route.request.url).path
  if path.endswith('/events'):route.fulfill(status=503,body='Use polling in isolated QA');return
  headers={**route.request.headers,'Origin':api};route.fulfill(response=route.fetch(url=api+path,headers=headers))
 ctx.route('**/api/economy**',real);ctx.route('**/api/farkle**',real);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/farkle');page.get_by_role('button',name='Play with friends',exact=True).click();page.get_by_label('Farkle table size',exact=True).select_option('4');expect(page.get_by_role('button',name='Create a private table',exact=True)).to_be_disabled();expect(page.get_by_role('link',name='Unlock 3–4 players · 600 Dice points or 462 Cash →')).to_be_visible()
 page.goto(base+'/store?category=modes');item=page.locator('#farkle-party');expect(item).to_contain_text('Every participant needs this unlock');item.get_by_role('button',name='Buy · 600 points',exact=True).click();page.get_by_role('button',name='Confirm purchase',exact=True).click();expect(item).to_contain_text('Owned permanently');page.screenshot(path=str(out/'party-purchased.png'))
 for uid in [MEMBER,TARGET,POST]:call(ctx,uid,{'operation':'purchase','itemId':'farkle-party'},'/api/economy')
 page.goto(base+'/games/farkle');page.get_by_role('button',name='Play with friends',exact=True).click();page.get_by_label('Farkle table size',exact=True).select_option('4');page.get_by_label('Farkle match length',exact=True).select_option('5000');page.get_by_role('button',name='Create a private table',exact=True).click();expect(page.locator('.multiplayer-lobby')).to_contain_text('Fast Match');code=page.evaluate('sessionStorage.getItem("clubhouse-farkle:'+ADMIN+':room")');assert code
 import uuid
 for n,uid in enumerate([MEMBER,TARGET,POST]):
  call(ctx,uid,{'operation':'join','code':code,'name':'Peer '+str(n),'requestId':str(uuid.uuid4())});call(ctx,uid,{'operation':'ready','code':code,'ready':True,'requestId':str(uuid.uuid4())})
 page.reload();page.get_by_role('button',name='Start match',exact=True).click();expect(page.locator('.fk-table')).to_be_visible();expect(page.locator('.fk-round')).to_contain_text('TARGET 5,000');expect(page.locator('.fk-players article')).to_have_count(4)
 for w,h in [(320,568),(390,844),(768,1024),(844,390),(568,320)]:
  page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1');page.screenshot(path=str(out/f'four-player-{w}x{h}.png'))
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Table',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Leave table',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Leave table',exact=True).click();expect(page.get_by_label('Farkle match length',exact=True)).to_be_visible();page.get_by_label('Farkle match length',exact=True).select_option('5000');page.get_by_role('link',name='Match Making',exact=True).click();expect(page.get_by_label('Match Making target',exact=True)).to_have_value('5000');page.get_by_label('Match Making mode',exact=True).select_option('3');expect(page.get_by_role('button',name='Host public match',exact=True)).to_be_enabled();page.get_by_role('button',name='Host public match',exact=True).click();expect(page.locator('.multiplayer-lobby')).to_contain_text('3 players · six dice · Fast Match · 5,000 target')
 locked=b.new_context(viewport={'width':390,'height':844});locked.route('**/api/farkle**',real);lp=locked.new_page();lp.goto(base+'/matchmaking?game=farkle');expect(lp.get_by_role('region',name='Open matches')).to_contain_text('Farkle Party unlock required');lp.get_by_label('Match Making mode',exact=True).select_option('3');expect(lp.get_by_role('button',name='Host public match',exact=True)).to_be_disabled();lp.get_by_label('Match Making mode',exact=True).select_option('2');expect(lp.get_by_role('button',name='Host public match',exact=True)).to_be_enabled()
 assert not errors,errors;print(json.dumps({'fastComputerMatch':True,'fourPlayerFastMatch':True,'storeUnlockPurchase':True,'lockedGroupModes':True,'publicMatchmakingTarget':True,'sixDiceOneRowAndNoScroll':True,'browserErrors':errors,'productionWrites':False}),flush=True);locked.close();ctx.close();b.close()
