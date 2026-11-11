"""Local mouse and touch drag checks against real private Dominoes matches."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5191');base=parser.parse_args().base_url.rstrip('/')
assert __import__('urllib.parse',fromlist=['urlparse']).urlparse(base).hostname in ('localhost','127.0.0.1')
errors=[];checks=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for variant in ['draw','block','muggins']:
  for touch in [False,True]:
   ctx=b.new_context(viewport={'width':390,'height':844},has_touch=touch,reduced_motion='reduce');page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base+'/games/dominoes');expect(page.get_by_role('button',name='Start match',exact=True)).to_be_enabled();page.get_by_label('Dominoes variant',exact=True).select_option(variant);page.get_by_role('button',name='Start match',exact=True).click();expect(page.locator('.dm-live')).to_be_visible()
   code=page.evaluate('sessionStorage.getItem("clubhouse-dominoes:guest:room")')
   def view():return ctx.request.get(base+'/api/dominoes/room/'+code).json()
   current=view()
   for attempt in range(30):
    if current['legal']:break
    label='Next hand' if current['phase']=='roundOver' else 'Draw' if current['canDraw'] else 'Pass'
    with page.expect_response(lambda r:r.url.endswith('/api/dominoes') and r.request.method=='POST') as reply:
     page.locator('.dm-actions').get_by_role('button',name=label,exact=label!='Draw').click()
    assert reply.value.ok
    current=view()
   assert current['legal'],current
   expect(page.locator('.dm-hand>button[data-playable=true]').first).to_be_enabled()
   option=current['legal'][0];source=page.locator('[data-tile="'+option['tile']+'"]');rect=source.bounding_box();x=rect['x']+rect['width']/2;y=rect['y']+rect['height']/2
   # A drop outside the board leaves the authoritative hand and revision unchanged.
   page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+9,y-10,steps=4);expect(page.locator('.dm-drag-ghost')).to_be_visible();page.mouse.move(5,48,steps=8);page.mouse.up();expect(page.locator('.dm-drag-ghost')).to_have_count(0);assert view()['revision']==current['revision']
   # A tile with only one matching end must not play on the other end.
   if current['board']:
    sides={o['end'] for o in current['legal'] if o['tile']==option['tile']}
    if len(sides)==1:
     wrong='right' if option['end']=='left' else 'left';target=page.locator('[data-domino-drop="'+wrong+'"]').bounding_box()
     page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+9,y-10,steps=4);page.mouse.move(target['x']+target['width']/2,target['y']+target['height']/2,steps=10);page.mouse.up();assert view()['revision']==current['revision']
   target=page.locator('[data-domino-drop="'+option['end']+'"]').bounding_box();tx=target['x']+target['width']/2;ty=target['y']+target['height']/2
   if touch:
    cdp=ctx.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});page.wait_for_timeout(220)
    for i in range(1,11):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+(tx-x)*i/10,'y':y+(ty-y)*i/10}]})
   else:
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+9,y-10,steps=4);page.mouse.move(tx,ty,steps=10)
   expect(page.locator('[data-domino-drop="'+option['end']+'"]').first).to_have_attribute('data-over','true');expect(page.locator('[data-domino-drop="'+option['end']+'"]').first).to_have_attribute('data-allowed','true')
   with page.expect_response(lambda r:r.url.endswith('/api/dominoes') and r.request.method=='POST') as response:
    if touch:cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    else:page.mouse.up()
   assert response.value.ok;expect(page.locator('[data-tile="'+option['tile']+'"]')).to_have_count(0);after=view();assert after['revision']==current['revision']+1;assert any(t['id']==option['tile'] for t in after['board'])
   # Tap selection and Play buttons remain available after dragging.
   if after['legal']:
    tile=after['legal'][0];page.locator('[data-tile="'+tile['tile']+'"]').click();expect(page.locator('[data-tile="'+tile['tile']+'"]').first).to_have_attribute('aria-pressed','true')
   for w,h in [(320,568),(768,1024),(1024,768),(568,320)]:
    page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1');assert page.locator('.dm-actions').evaluate('(e)=>e.getBoundingClientRect().bottom<=innerHeight+1')
   checks.append({'variant':variant,'input':'touch' if touch else 'mouse','server_move':True,'outside_cancel':True,'fits':True});ctx.close()
 assert not errors,errors
 b.close();print(json.dumps({'checks':checks,'errors':errors}))
