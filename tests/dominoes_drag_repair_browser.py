"""Regression: direct touch drags and drops on actual tile faces, across every skin."""
import copy,json
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture,ADMIN
base='http://127.0.0.1:5198';skins=['classic','numbers','ruby','sapphire','emerald','amethyst','onyx','sunburst'];checks=[];errors=[]
fixture_view={'code':'ABCDEF12','revision':1,'owner':True,'status':'playing','options':{'mode':'bot','variant':'draw','level':'normal','target':100},'mySeat':0,'players':[{'id':'p0','name':'Player','bot':False,'ready':True,'you':True,'occupied':True,'count':2,'score':0},{'id':'p1','name':'CPU','bot':True,'ready':True,'you':False,'occupied':True,'count':7,'score':0}],'hand':['6-6','0-1'],'board':[],'stockCount':19,'turn':0,'round':1,'phase':'play','scores':[0,0],'legal':[{'tile':'6-6','end':'right','points':0}],'canDraw':False,'canPass':False,'forcedOpening':'6-6','activity':[],'result':None,'winner':None,'revealedHands':None,'reward':{'status':'ineligible','tier':None,'amount':0,'message':'Isolated input fixture'}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for skin in skins:
  for position in ['opening','face','spinner']:
   fixture=EconomyFixture();fixture.wallets[ADMIN].update(domino_points=2000,equipped={'domino_skin':'domino-skin-'+skin},owned=['domino-skin-'+s for s in skins]);ctx=fixture.context(b,ADMIN,390 if position!='face' else 1024);ctx.route('**/clubhouse-config.js',lambda r:r.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'));ctx.add_init_script('sessionStorage.setItem("clubhouse-dominoes:'+ADMIN+':room","ABCDEF12")')
   view=copy.deepcopy(fixture_view);expected='right';tile='6-6'
   if position=='face':
    view.update(board=[{'id':'2-4','a':2,'b':4,'seat':1,'placement':0}],hand=['1-2','4-5'],forcedOpening=None,legal=[{'tile':'1-2','end':'left','points':0},{'tile':'4-5','end':'right','points':0}]);expected='left';tile='1-2'
   elif position=='spinner':
    view['options']['variant']='muggins';view.update(board=[{'id':'1-6','a':1,'b':6,'seat':1,'placement':1},{'id':'6-6','a':6,'b':6,'seat':0,'placement':0,'spinner':True},{'id':'2-6','a':6,'b':2,'seat':1,'placement':2}],hand=['3-6','4-6'],forcedOpening=None,legal=[{'tile':t,'end':end,'points':0} for t in ['3-6','4-6'] for end in ['up','down']]);tile='3-6';expected='up' if skins.index(skin)%2==0 else 'down'
   posts=[]
   ctx.route('**/api/dominoes/room/ABCDEF12',lambda r:r.fulfill(content_type='application/json',body=json.dumps(view)));ctx.route('**/api/dominoes/room/ABCDEF12/events',lambda r:r.fulfill(content_type='text/event-stream',body='data: {"revision":1}\n\n'))
   def command(r):
    posts.append(r.request.post_data_json);view['revision']+=1;view['hand'].remove(posts[-1]['move']['tile']);view['players'][0]['count']=len(view['hand']);view['legal']=[];r.fulfill(content_type='application/json',body=json.dumps({'view':view,'changed':True}))
   ctx.route('**/api/dominoes',command);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base+'/games/dominoes');source=page.locator('[data-tile="'+tile+'"]');expect(source).to_be_enabled();expect(source.locator('svg')).to_have_attribute('data-domino-skin','domino-skin-'+skin)
   def begin_mouse():
    r=source.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();page.mouse.move(r['x']+r['width']/2+12,r['y']-10,steps=4);expect(page.locator('.dm-drag-ghost')).to_be_visible()
   if position=='face':
    # Wrong-end and outside-table releases must not auto-correct or submit.
    begin_mouse();r=page.locator('[data-domino-drop="right"]').bounding_box();page.mouse.move(r['x']+28,r['y']+28,steps=8);page.mouse.up();assert not posts
    begin_mouse();page.mouse.move(5,48,steps=8);page.mouse.up();assert not posts
   r=source.bounding_box();x=r['x']+r['width']/2;y=r['y']+r['height']/2
   if position=='opening':
    r=page.locator('.dm-board-surface').bounding_box();tx=r['x']+r['width']*.2;ty=r['y']+r['height']*.25
   else:
    r=page.locator('[data-domino-tile="'+('2-4' if position=='face' else '6-6')+'"]').bounding_box();tx=r['x']+r['width']*(.15 if position=='face' else .5);ty=r['y']+r['height']*(.5 if position=='face' else .1 if expected=='up' else .9)
   # Synthetic PointerEvents exercise an immediate touch/pen drag without a hold.
   if position!='face':
    source.dispatch_event('pointerdown',{'pointerId':1,'pointerType':'touch','isPrimary':True,'button':0,'buttons':1,'clientX':x,'clientY':y,'bubbles':True});page.dispatch_event('body','pointermove',{'pointerId':1,'pointerType':'touch','isPrimary':True,'buttons':1,'clientX':x+12,'clientY':y-12,'bubbles':True});page.dispatch_event('body','pointermove',{'pointerId':1,'pointerType':'touch','isPrimary':True,'buttons':1,'clientX':tx,'clientY':ty,'bubbles':True})
   else:begin_mouse();page.mouse.move(tx,ty,steps=12)
   expect(page.locator('.dm-drag-ghost [data-domino-skin="domino-skin-'+skin+'"]').first).to_be_visible();expect(page.locator('[data-domino-drop="'+expected+'"]').first).to_have_attribute('data-over','true')
   if skin=='onyx':page.evaluate('window.dispatchEvent(new Event("focus"))');page.wait_for_timeout(200)
   if position!='face':page.dispatch_event('body','pointerup',{'pointerId':1,'pointerType':'touch','isPrimary':True,'button':0,'buttons':0,'clientX':tx,'clientY':ty,'bubbles':True})
   else:page.mouse.up()
   expect(source).to_have_count(0);assert len(posts)==1,posts;assert posts[0]['move']=={'t':'play','tile':tile,'end':expected};assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1');checks.append({'skin':skin,'position':position,'move':posts[0]['move']});ctx.close()
 assert not errors,errors;b.close();print(json.dumps({'checks':len(checks),'all_skins':skins,'errors':errors}))
