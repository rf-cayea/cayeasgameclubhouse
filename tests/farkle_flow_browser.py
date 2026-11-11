"""Sequential kept rows, committed opponent playback and full score records."""
import argparse,json,subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture
from social_browser import ADMIN
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8811');base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1')
root=Path(__file__).resolve().parents[1];out=Path('/tmp/farkle-flow-qa');out.mkdir(exist_ok=True)
fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',"""
import {newFarkle,applyFarkleMove} from './src/lib/farkle.ts';
const players=[{id:'one',name:'JadeAce',bot:false},{id:'two',name:'Opponent',bot:true,level:'normal'}];let s=newFarkle(players);const result=[s];
const roll=values=>{let i=0;s=applyFarkleMove(s,s.turn,{t:'roll'},()=>(values[i++]-.5)/6);result.push(s)};
const keep=dice=>{s=applyFarkleMove(s,s.turn,{t:'keep',dice});result.push(s)};
roll([1,1,1,5,2,3]);keep([0,1,2,3]);roll([5,1]);keep([4]);roll([1]);keep([5]);s=applyFarkleMove(s,0,{t:'bank'});result.push(s);
roll([1,1,1,2,3,4]);keep([0,1,2]);s=applyFarkleMove(s,1,{t:'bank'});result.push(s);console.log(JSON.stringify(result));
"""],cwd=root,text=True))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);fx=EconomyFixture();c=fx.context(b,ADMIN,width=390);c.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
 model={'index':0}
 def view():
  s=fixtures[model['index']];return {'code':'A1B2C3D4','revision':s['actionSequence']+1,'owner':True,'status':'playing','options':{'mode':'bot','seats':2,'level':'normal'},'mySeat':0,'players':[{**v,'you':i==0,'ready':True,'occupied':True}for i,v in enumerate(s['players'])],'state':s,'reward':{'status':'ineligible','tier':None,'amount':0,'message':'Local flow fixture'}}
 def command(r):
  data=r.request.post_data_json
  if data['operation']=='create':model['index']=0
  elif data['operation']=='move':model['index']=len(fixtures)-1 if data['move']['t']=='bank' else model['index']+1
  r.fulfill(content_type='application/json',body=json.dumps({'view':view(),'changed':True}))
 c.route('**/api/farkle',command);c.route('**/api/farkle/room/A1B2C3D4',lambda r:r.fulfill(content_type='application/json',body=json.dumps(view())));c.route('**/api/farkle/room/A1B2C3D4/events',lambda r:r.fulfill(status=503,body='fixture'))
 page=c.new_page();page.set_viewport_size({'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/farkle');page.get_by_role('button',name='Start Farkle',exact=True).click();page.get_by_role('button',name='Smart Roll · 6 dice',exact=True).click();expect(page.get_by_role('button',name='Smart pick',exact=True)).to_be_enabled();page.get_by_role('button',name='Smart pick',exact=True).click();page.get_by_role('button',name='Keep 1050 points',exact=True).click();expect(page.get_by_role('button',name='Roll 2 dice',exact=True)).to_be_enabled();expect(page.locator('.fk-kept-row[data-filled=true]')).to_have_count(1)
 page.get_by_role('button',name='Roll 2 dice',exact=True).click();expect(page.get_by_role('button',name='Smart pick',exact=True)).to_be_enabled();page.locator('.fk-die-slot').nth(4).get_by_role('button').click();page.get_by_role('button',name='Keep 50 points',exact=True).click();expect(page.get_by_role('button',name='Roll 1 die',exact=True)).to_be_enabled();assert page.locator('.fk-kept-row').evaluate_all('(els)=>els.flatMap((e,i)=>e.dataset.filled==="true"?[i]:[])')==[4,5]
 page.get_by_role('button',name='Roll 1 die',exact=True).click();expect(page.get_by_role('button',name='Smart pick',exact=True)).to_be_enabled();page.get_by_role('button',name='Smart pick',exact=True).click();page.get_by_role('button',name='Keep 100 points',exact=True).click();expect(page.get_by_role('button',name='Bank 1,200',exact=True)).to_be_enabled();assert page.locator('.fk-kept-row').evaluate_all('(els)=>els.flatMap((e,i)=>e.dataset.filled==="true"?[i]:[])')==[3,4,5]
 for w,h in [(320,568),(375,667),(390,844),(768,1024),(1024,768),(844,390),(568,320)]:
  page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1');expect(page.get_by_role('button',name='Bank 1,200',exact=True)).to_be_in_viewport();page.screenshot(path=str(out/f'rows-{w}x{h}.png'))
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Bank 1,200',exact=True).click();expect(page.locator('.fk-roll-message>strong')).to_have_text('JadeAce banked 1,200');expect(page.locator('.fk-players article').nth(1).locator('b')).to_have_text('0')
 expect(page.locator('.fk-roll-message>strong')).to_have_text('Opponent rolled');page.wait_for_timeout(450);expect(page.locator('.fk-roll-message>strong')).to_have_text('Opponent rolled');expect(page.locator('.fk-die-slot [data-rolling=true]')).to_have_count(0);expect(page.locator('.fk-players article').nth(1).locator('b')).to_have_text('0')
 expect(page.locator('.fk-roll-message>strong')).to_have_text('Opponent kept Three 1s');expect(page.locator('.fk-players article').nth(1).locator('b')).to_have_text('0');expect(page.locator('.fk-roll-message>strong')).to_have_text('Opponent banked 1,000');expect(page.locator('.fk-players article').nth(1).locator('b')).to_have_text('1,000');expect(page.get_by_role('button',name='Smart Roll · 6 dice',exact=True)).to_be_enabled()
 page.get_by_role('button',name='Moves',exact=True).click();record=page.get_by_role('region',name='Match score record');expect(record.locator('tbody tr')).to_have_count(2);expect(record).to_contain_text('+1,200');expect(record).to_contain_text('+1,000');page.screenshot(path=str(out/'record.png'));page.get_by_role('button',name='Back to game',exact=True).click();page.reload();page.get_by_role('button',name='Moves',exact=True).click();expect(page.get_by_role('region',name='Match score record').locator('tbody tr')).to_have_count(2)
 assert not errors,errors
 print(json.dumps({'consecutiveRowsAfterMultiDieKeeps':True,'sevenViewports':True,'opponentSettlePause':True,'bankTotalsOnlyAtTheirStep':True,'scoreRecordSurvivesReload':True,'browserErrors':errors}));c.close();b.close()
