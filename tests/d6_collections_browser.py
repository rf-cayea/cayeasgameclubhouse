"""Original D6 artwork and collection shopping against an isolated local build."""
import argparse,json,subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
import economy_browser
from economy_browser import EconomyFixture
from social_browser import ADMIN
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8811');base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1')
root=Path(__file__).resolve().parents[1];out=Path('/tmp/d6-collection-qa');out.mkdir(exist_ok=True)
data=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',"import {COLLECTION_D6_DICE,D6_COLLECTIONS} from './src/lib/d6-collections.ts';import {ECONOMY_CATALOG} from './src/lib/economy-protocol.ts';import {newFiveDice,applyFiveDiceMove} from './src/lib/five-dice.ts';const start=newFiveDice([{id:'one',name:'JadeAce',bot:false},{id:'two',name:'Computer',bot:true,level:'normal'}]);console.log(JSON.stringify({designs:COLLECTION_D6_DICE,groups:D6_COLLECTIONS,catalog:ECONOMY_CATALOG,initial:start,rolled:applyFiveDiceMove(start,0,{t:'roll'},()=>.99)}));"],cwd=root,text=True))
economy_browser.CATALOG=data['catalog']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);fx=EconomyFixture();fx.wallets[ADMIN].update(dice_points=20000,points=10000,domino_points=0)
 c=fx.context(b,ADMIN,width=1280);c.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
 page=c.new_page();page.set_viewport_size({'width':1280,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/store?category=dice');expect(page.get_by_label('Dice collection',exact=True)).to_be_visible()
 for group,label in data['groups']:
  page.get_by_label('Dice collection',exact=True).select_option(group);expect(page.locator('.fd-dice-products article')).to_have_count(6);names=page.locator('.fd-dice-products h3').all_text_contents();page.screenshot(path=str(out/(group+'.png')),full_page=True)
  page.get_by_role('button',name='Next dice',exact=True).click();expect(page.locator('.fd-dice-products article')).to_have_count(2);names+=page.locator('.fd-dice-products h3').all_text_contents();assert set(names)=={d['name'] for d in data['designs'] if d['collection']==group}
  page.get_by_role('button',name='Previous dice',exact=True).click();design=next(d for d in data['designs'] if d['collection']==group);card=page.get_by_role('article',name=design['name'],exact=True);card.get_by_role('button',name=f"Buy · {design['price']} points",exact=True).click();page.get_by_role('button',name='Confirm purchase',exact=True).click();expect(card).to_contain_text('Owned permanently');card.get_by_role('button',name='Equip dice',exact=True).click();expect(card.get_by_role('button',name='Equipped',exact=True)).to_be_disabled();assert fx.wallets[ADMIN]['equipped']['d6_dice']==design['id']
  for width,height in [(320,568),(390,844),(768,1024)]:
   page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');assert card.locator('svg').evaluate_all('(els)=>els.every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right<=innerWidth+1})')
  page.set_viewport_size({'width':1280,'height':1050})
  print(json.dumps({'collection':group,'allEightVisibleViaPages':True,'purchaseEquip':True}),flush=True)
 # A finish from every collection renders on five Quintsee dice, including all six physical faces.
 fx.wallets[ADMIN]['owned']+= [d['id'] for d in data['designs'] if d['id'] not in fx.wallets[ADMIN]['owned']]
 model={'state':'initial'}
 def view():
  s=data[model['state']];return {'code':'D6D6D6D6','revision':s['actionSequence']+1,'owner':True,'status':'playing','options':{'mode':'bot','seats':2,'level':'normal'},'mySeat':0,'players':[{**v,'ready':True,'you':i==0,'occupied':True} for i,v in enumerate(s['players'])],'state':s,'reward':{'status':'ineligible','tier':None,'amount':0,'message':'Local artwork fixture'}}
 def command(r):
  model['state']='initial' if r.request.post_data_json['operation']=='create' else 'rolled';r.fulfill(content_type='application/json',body=json.dumps({'view':view(),'changed':True}))
 c.route('**/api/five-dice',command);c.route('**/api/five-dice/room/D6D6D6D6',lambda r:r.fulfill(content_type='application/json',body=json.dumps(view())));c.route('**/api/five-dice/room/D6D6D6D6/events',lambda r:r.fulfill(status=503,body='fixture'))
 for group,label in data['groups']:
  design=next(d for d in data['designs'] if d['collection']==group);fx.wallets[ADMIN]['equipped']['d6_dice']=design['id'];page.goto(base+'/games/quintsee');expect(page.get_by_role('button',name='Start a match',exact=True)).to_be_enabled();page.get_by_role('button',name='Start a match',exact=True).click();expect(page.locator('.fd-die')).to_have_count(5);expect(page.locator('.fd-die svg[data-dice-design="'+design['id']+'"]')).to_have_count(30);page.get_by_role('button',name='Roll five dice',exact=True).click();expect(page.get_by_role('button',name='Roll again · 2 left',exact=True)).to_be_enabled();page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/(group+'-quintsee.png')));page.set_viewport_size({'width':1280,'height':1050});page.evaluate('sessionStorage.clear()');model['state']='initial'
 assert not errors,errors
 print(json.dumps({'quintseeCollections':7,'mobileOverflow':False,'browserErrors':errors,'productionWrites':False}),flush=True);c.close();b.close()
