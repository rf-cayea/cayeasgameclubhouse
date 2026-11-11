"""Built Farkle UI with actual engine snapshots; fictional browser identity only."""
import json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture
from social_browser import ADMIN
base='http://127.0.0.1:8811';out=Path('/tmp/farkle-immediate-qa');out.mkdir(exist_ok=True)
fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e','''
import {newFarkle,applyFarkleMove} from './src/lib/farkle.ts';
console.log(JSON.stringify([5000,10000].flatMap(target=>[2,3,4].map(seats=>{
const players=Array.from({length:seats},(_,n)=>({id:`p${n}`,name:`Player ${n+1}`,bot:false}));
const before={...newFarkle(players,target),scores:players.map((_,n)=>n===0?target-100:1000),dice:[1,2,3,4,6,2],step:'choose',rolls:1};
return {target,seats,before,after:applyFarkleMove(before,0,{t:'bank',dice:[0]})};
}))));'''],text=True))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);errors=[]
 for f in fixtures:
  fx=EconomyFixture();fx.wallets[ADMIN]['owned'].append('farkle-party');ctx=fx.context(b,ADMIN,width=390);ctx.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'));model={'won':False,'moves':[]}
  def view():
   s=f['after'] if model['won'] else f['before'];return {'code':'A1B2C3D4','revision':2 if model['won'] else 1,'owner':True,'status':'finished' if model['won'] else 'playing','options':{'mode':'online','seats':f['seats'],'level':'normal','target':f['target']},'mySeat':0,'players':[{'id':v['id'],'name':v['name'],'bot':False,'ready':True,'you':n==0,'occupied':True} for n,v in enumerate(s['players'])],'state':s,'reward':{'status':'ineligible','tier':None,'amount':0,'message':'Isolated engine presentation test'}}
  def command(r):
   data=r.request.post_data_json
   if data['operation']=='move':model['moves'].append(data['move']);assert data['move']['t']=='bank';model['won']=True
   r.fulfill(content_type='application/json',body=json.dumps({'view':view(),'changed':True}))
  ctx.route('**/api/farkle',command);ctx.route('**/api/farkle/room/A1B2C3D4',lambda r:r.fulfill(content_type='application/json',body=json.dumps(view())));ctx.route('**/api/farkle/room/A1B2C3D4/events',lambda r:r.fulfill(status=503,body='Use polling in isolated QA'))
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/farkle');page.get_by_role('button',name='Play with friends',exact=True).click();page.get_by_label('Farkle table size',exact=True).select_option(str(f['seats']));page.get_by_label('Farkle match length',exact=True).select_option(str(f['target']));page.get_by_role('button',name='Create a private table',exact=True).click();expect(page.locator('.fk-table')).to_be_visible();page.locator('.fk-dice-grid .fd-die').first.click();page.get_by_role('button',name='Bank 100',exact=True).click();expect(page.get_by_role('dialog')).to_contain_text('Player 1 wins!',timeout=5000);expect(page.locator('.fk-round')).to_contain_text('Match complete');assert f['after']['scores']==[f['target']]+[1000]*(f['seats']-1);assert len(model['moves'])==1
  page.set_viewport_size({'width':320,'height':568});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1');page.screenshot(path=str(out/f"{f['target']}-{f['seats']}-win.png"));page.get_by_role('button',name='Back to game',exact=True).click();expect(page.get_by_role('button',name='View results',exact=True)).to_be_enabled();assert not page.locator('.fk-table').get_by_role('button',name='Smart Roll · 6 dice',exact=True).count();ctx.close()
 assert not errors,errors;print(json.dumps({'instantResultsBothTargetsAllTableSizes':True,'noOpponentActionsAfterWinningBank':True,'mobileResultsFit':True,'browserErrors':errors,'productionWrites':False}),flush=True);b.close()
