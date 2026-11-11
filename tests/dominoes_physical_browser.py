"""Real local room positions for physical chains, spinners and accurate drop targets."""
import json,sqlite3,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base='http://127.0.0.1:5194';dbpath='/workspace/work/domino-physical-qa.sqlite';out=Path('/workspace/work/domino-physical-qa');out.mkdir(exist_ok=True)
positions=json.loads(subprocess.run(['node','--import','tsx','tests/helpers/dominoes-positions.ts'],capture_output=True,text=True,check=True).stdout);errors=[];checks=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for name,state in positions.items():
  ctx=b.new_context(viewport={'width':390,'height':844});ctx.request.get(base+'/api/dominoes/session');response=ctx.request.post(base+'/api/dominoes',data={'operation':'create','requestId':__import__('uuid').uuid4().hex[:8]+'-1111-4111-8111-111111111111','name':'Player','options':{'mode':'bot','variant':state['variant'],'level':'normal','target':200}});assert response.ok,response.text();code=response.json()['view']['code']
  db=sqlite3.connect(dbpath);room=json.loads(db.execute('SELECT data FROM domino_rooms WHERE code=?',(code,)).fetchone()[0]);state['players']=room['state']['players'];room['state']=state;db.execute('UPDATE domino_rooms SET data=? WHERE code=?',(json.dumps(room),code));db.commit();db.close()
  ctx.add_init_script("sessionStorage.setItem('clubhouse-dominoes:guest:room','"+code+"')");page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/dominoes');expect(page.locator('.dm-live')).to_be_visible();expect(page.locator('[data-domino-tile]')).to_have_count(len(state['board']))
  for w,h in [(320,568),(390,844),(768,1024),(1024,768),(568,320)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1');assert page.locator('.dm-actions').evaluate('(e)=>e.getBoundingClientRect().bottom<=innerHeight+1')
   assert page.locator('[data-domino-tile]').evaluate_all('(es)=>es.every(e=>{const r=e.getBoundingClientRect();return r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})')
   page.screenshot(path=str(out/(name+'-'+str(w)+'x'+str(h)+'.png')))
  view=ctx.request.get(base+'/api/dominoes/room/'+code).json();branches=[o for o in view['legal'] if o['end'] in ('up','down')]
  if branches:
   page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);choice=branches[0];tile=page.locator('[data-tile="'+choice['tile']+'"]');r=tile.bounding_box();target=page.locator('[data-domino-drop="'+choice['end']+'"]').bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();page.mouse.move(r['x']+r['width']/2+10,r['y']-10,steps=4);page.mouse.move(target['x']+target['width']/2,target['y']+target['height']/2,steps=12);expect(page.locator('[data-domino-drop="'+choice['end']+'"]')).to_have_attribute('data-over','true');expect(page.locator('[data-domino-drop="'+choice['end']+'"]')).to_have_attribute('data-allowed','true')
   with page.expect_response(lambda r:r.url.endswith('/api/dominoes') and r.request.method=='POST') as reply:page.mouse.up()
   assert reply.value.ok;after=ctx.request.get(base+'/api/dominoes/room/'+code).json();assert any(t['id']==choice['tile'] and t.get('arm')==choice['end'] for t in after['board']);expect(page.locator('[data-tile="'+choice['tile']+'"]')).to_have_count(0)
  checks.append({'position':name,'tiles':len(state['board']),'branch_drop':bool(branches),'fits':True});ctx.close()
 assert not errors,errors;b.close();print(json.dumps({'checks':checks,'errors':errors}))
