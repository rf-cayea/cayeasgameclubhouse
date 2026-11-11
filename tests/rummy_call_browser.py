"""Real local API with server-owned positions for call timing and meld ownership."""
import json,sqlite3
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base='http://127.0.0.1:5193';dbpath='/workspace/work/rummy-call-qa.sqlite';out=Path('/workspace/work/rummy-call-qa');out.mkdir(exist_ok=True)
errors=[];checks=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for variant in ['classic','r500']:
  for action in ['call','pass']:
   ctx=b.new_context(viewport={'width':390,'height':844});ctx.add_init_script('localStorage.setItem("clubhouse-card-music-v1",JSON.stringify({enabled:false,volume:.4}))')
   ctx.request.get(base+'/api/rummy/session');response=ctx.request.post(base+'/api/rummy',data={'operation':'create','name':'Alice','options':{'mode':'bot','variant':variant,'seats':3,'level':'normal','jokers':False}});assert response.ok,response.text();value=response.json();view=value.get('view',value);code=view['code']
   db=sqlite3.connect(dbpath);row=json.loads(db.execute('SELECT data FROM rooms WHERE code=?',(code,)).fetchone()[0]);s=row['state'];s.update(variant=variant,turn=2,phase='draw',hands=[['2H','KS'],['9D'],['4H','8C']],discard=['AC','6S'],melds=[{'cards':[{'c':c,'by':0} for c in ['3S','4S','5S']]},{'cards':[{'c':c,'by':1} for c in ['8H','8S','8D']]}],laid=[15,24,0],rummyClaim={'card':'6S','discarder':1,'declined':[]},roundResult=None,winner=None,opening=None,mustUse=None,drewDiscard=None,activity=[{'id':1,'seat':1,'kind':'discard','cards':['6S']}]);used=s['discard']+[c for h in s['hands'] for c in h]+[item['c'] for meld in s['melds'] for item in meld['cards']];s['deck']=[r+su for r in 'A23456789TJQK' for su in 'SHDC' if r+su not in used];db.execute('UPDATE rooms SET data=? WHERE code=?',(json.dumps(row),code));db.commit();db.close()
   ctx.add_init_script("sessionStorage.setItem('cayea-rummy-room','"+code+"')");page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/rummy');expect(page.get_by_role('region',name='Rummy call available')).to_be_visible()
   for w,h in [(320,568),(375,667),(768,1024),(1024,768),(568,320)]:
    page.set_viewport_size({'width':w,'height':h});offer=page.locator('.rummy-call-offer').bounding_box();assert offer['y']>=0 and offer['y']+offer['height']<=h,(w,h,offer);assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1');assert page.locator('.table-action-bar').evaluate('(e)=>e.getBoundingClientRect().bottom<=innerHeight+1')
   page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/(variant+'-'+action+'-offer.png')))
   page.get_by_role('button',name='Call Rummy!' if action=='call' else 'Pass call',exact=True).click();expect(page.locator('.rummy-call-offer')).to_have_count(0);expect(page.locator('.rummy-live-table')).to_be_visible()
   fresh=ctx.request.get(base+'/api/rummy/room/'+code).json();assert fresh['turn']==0;assert fresh['rummyClaim'] is None
   if action=='call':assert {'c':'6S','by':0} in fresh['melds'][0]['cards'];assert fresh['activity'][-1]['kind']=='discard';assert any(a['kind']=='rummy' for a in fresh['activity'])
   page.get_by_role('button',name='Melds & discard',exact=False).click();expect(page.get_by_role('dialog')).to_be_visible();expect(page.locator('.rummy-meld-owner')).to_have_count(2);expect(page.locator('.rummy-meld-owner[data-owner="0"]')).to_contain_text('Run #1');expect(page.locator('.rummy-meld-owner[data-owner="1"]')).to_contain_text('Set #2')
   # Layoff attribution belongs to its contributor while the run stays with its founder.
   page.screenshot(path=str(out/(variant+'-'+action+'-melds.png')));page.get_by_role('button',name='Back to game',exact=True).click();page.reload();expect(page.locator('.rummy-live-table')).to_be_visible();expect(page.locator('.rummy-call-offer')).to_have_count(0)
   checks.append({'variant':variant,'action':action,'mobile_layout':True,'owners_and_types':True,'reconnect':True});ctx.close()
 assert not errors,errors;b.close();print(json.dumps({'checks':checks,'errors':errors}))
