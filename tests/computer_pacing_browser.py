"""Local real API: visible delays, staged computer actions and Dominoes scoring."""
import json,sqlite3,time
from pathlib import Path
from uuid import uuid4
from playwright.sync_api import sync_playwright,expect
base='http://127.0.0.1:5195';dbpath='/workspace/work/paced-games-qa.sqlite';out=Path('/workspace/work/computer-pacing-qa');out.mkdir(exist_ok=True);errors=[];checks=[]
def edit(table,code,change):
 db=sqlite3.connect(dbpath);row=json.loads(db.execute('SELECT data FROM '+table+' WHERE code=?',(code,)).fetchone()[0]);change(row);row.pop('presentation',None);db.execute('UPDATE '+table+' SET data=? WHERE code=?',(json.dumps(row),code));db.commit();db.close()
def context(browser):
 ctx=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');ctx.add_init_script('localStorage.setItem("clubhouse-card-music-v1",JSON.stringify({enabled:false}));localStorage.setItem("clubhouse-rummy-sound-v1","off");');page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return ctx,page
def create(ctx,game,options):
 ctx.request.get(base+'/api/'+game+'/session');body={'operation':'create','name':'Player','options':options}
 if game=='dominoes':body['requestId']=str(uuid4())
 r=ctx.request.post(base+'/api/'+game,data=body);assert r.ok,r.text();v=r.json();return v.get('view',v)['code']
def resume(ctx,page,game,code):
 key='clubhouse-dominoes:guest:room' if game=='dominoes' else 'cayea-'+game+'-room';ctx.add_init_script('sessionStorage.setItem('+json.dumps(key)+','+json.dumps(code)+')');page.goto(base+'/games/'+game)
def domino_state(row,kind):
 s=row['state'];s.update(turn=0,starter=0,forcedOpening=None,passes=0,result=None,winner=None,round=1,phase='play',scores=[0,0],activity=[],sequence=0)
 if kind=='pace':s.update(board=[],forcedOpening='6-6',hands=[['6-6','0-1','1-2','2-3','3-4','4-5','0-0'],['5-6','1-3','2-4','2-5','3-5','0-2','1-4']])
 else:
  s.update(board=[{'id':'6-6','a':6,'b':6,'seat':1,'placement':0}],hands=[['0-6'],['1-2','3-4','4-4']])
  if kind=='cpu-out':s.update(hands=[['0-6','1-2','3-4'],['3-6']])
  if kind=='blocked':s.update(hands=[['0-1'],['2-3','4-5']],passes=1)
 used=s['hands'][0]+s['hands'][1]+[t['id'] for t in s['board']];s['stock']=[] if kind=='blocked' else [f'{a}-{b}' for a in range(7) for b in range(a,7) if f'{a}-{b}' not in used];row['status']='playing'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 ctx,page=context(b);code=create(ctx,'rummy',{'mode':'bot','variant':'classic','seats':2,'level':'normal','jokers':False})
 def rummy(row):
  s=row['state'];hands=[['AS','2S','3S','4H','5H','7D','9D','JC','QD','KD','AH'],['2C','4D','6H','8S','TH','QC','3D','5C','7H','9C']];used=hands[0]+hands[1]+['2H'];deck=[r+su for r in 'A23456789TJQK' for su in 'SHDC' if r+su not in used];deck.remove('KH');deck.append('KH');s.update(hands=hands,deck=deck,discard=['2H'],melds=[],laid=[0,0],turn=0,phase='play',mustUse=None,drewDiscard=None,opening=None,roundResult=None,winner=None,rummyClaim=None,activity=[],scores=[0,0]);row['status']='playing'
 edit('rooms',code,rummy);resume(ctx,page,'rummy',code);expect(page.locator('.rummy-live-table')).to_be_visible();page.locator('ol[aria-label="Your hand"] [data-card="AS"] button').click(position={'x':5,'y':16})
 with page.expect_response(lambda r:r.url.endswith('/api/rummy') and r.request.method=='POST') as reply:page.get_by_role('button',name='Discard selected',exact=True).click()
 data=reply.value.json();assert len(data['playback']['frames'])>=3;t=time.monotonic();page.wait_for_timeout(300);expect(page.locator('.table-round-bar strong')).to_contain_text('thinking');assert 'Drew from stock' not in page.locator('.rummy-player-list li').nth(1).inner_text();expect(page.get_by_role('button',name='Discard selected',exact=True)).to_be_disabled()
 expect(page.locator('.rummy-player-list li').nth(1)).to_contain_text('Drew from stock',timeout=2500);assert time.monotonic()-t>.7;page.screenshot(path=str(out/'rummy-draw.png'));expect(page.locator('.table-round-bar strong')).to_have_text('Your turn',timeout=6000);checks.append({'game':'rummy','separate_draw_and_discard':True,'delay_ms_at_least':700});ctx.close()
 ctx,page=context(b);code=create(ctx,'spades',{'mode':'bot','variant':'solo','target':100,'humans':2,'level':'normal','table':'spades-table-classic','deck':'spades-deck-classic'})
 def spades(row):row['state'].update(phase='bid',bids=[None]*4,turn=0,dealer=3,round=1,trick=[],completed=[],taken=[0]*4,result=None,winner=None);row.update(status='playing')
 edit('spades_rooms',code,spades);resume(ctx,page,'spades',code);expect(page.get_by_role('button',name='Confirm bid',exact=True)).to_be_enabled();page.get_by_label('Your Spades bid',exact=True).select_option('2')
 with page.expect_response(lambda r:r.url.endswith('/api/spades') and r.request.method=='POST') as reply:page.get_by_role('button',name='Confirm bid',exact=True).click()
 data=reply.value.json();assert len(data['playback']['frames'])==4;page.wait_for_timeout(300);expect(page.locator('.table-round-bar strong')).to_contain_text('thinking');page.wait_for_timeout(1100);page.screenshot(path=str(out/'spades-bidding.png'));expect(page.locator('.table-round-bar strong')).to_have_text('Your play',timeout=6000);checks.append({'game':'spades','three_separate_bids':True});ctx.close()
 for kind,variant in [('pace','draw'),('cpu-out','draw'),('out','draw'),('blocked','block'),('rounded','muggins')]:
  ctx,page=context(b);code=create(ctx,'dominoes',{'mode':'bot','variant':variant,'level':'normal','target':100});edit('domino_rooms',code,lambda row:domino_state(row,kind));resume(ctx,page,'dominoes',code);expect(page.locator('.dm-live')).to_be_visible()
  if kind=='blocked':action=page.locator('.dm-actions').get_by_role('button',name='Pass',exact=True)
  else:
   tile='6-6' if kind=='pace' else '0-6';page.locator('[data-tile="'+tile+'"]').click();action=page.locator('.dm-actions').get_by_role('button',name='Open table' if kind=='pace' else 'Play right',exact=False)
  with page.expect_response(lambda r:r.url.endswith('/api/dominoes') and r.request.method=='POST') as reply:action.click()
  assert reply.value.ok
  if kind=='pace':
   assert len(reply.value.json()['view']['playback']['frames'])==2;page.wait_for_timeout(300);expect(page.locator('[data-domino-tile]')).to_have_count(1);expect(page.locator('.dm-match-line strong')).to_contain_text('thinking');expect(page.locator('[data-domino-tile]')).to_have_count(2,timeout=2500);checks.append({'game':'dominoes','separate_computer_tile':True})
  else:
   dialog=page.get_by_role('dialog');expect(dialog).to_be_visible();expect(dialog).to_contain_text('Where the points come from');expected=13 if kind=='blocked' else 20 if kind=='rounded' else 10 if kind=='cpu-out' else 18;expect(dialog).to_contain_text('+'+str(expected));expect(dialog.locator('.dm-revealed [data-domino-face]')).to_have_count(2 if kind=='cpu-out' else 3)
   if kind=='cpu-out':expect(dialog).to_contain_text('Player held 10 pips')
   if kind=='rounded':expect(dialog).to_contain_text('rounded to the nearest five')
   if kind=='blocked':expect(dialog).to_contain_text('14 − 1 = 13')
   if kind=='out':expect(dialog).to_contain_text('held 18 pips')
   for w,h in [(320,568),(768,1024),(568,320)]:page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1')
   page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/('dominoes-'+kind+'.png')));checks.append({'game':'dominoes','result':kind,'losing_tiles':True,'formula':True})
  ctx.close()
 assert not errors,errors;b.close();print(json.dumps({'checks':checks,'errors':errors}))
