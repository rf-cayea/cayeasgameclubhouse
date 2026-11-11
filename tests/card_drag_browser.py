"""Mouse/touch table gestures with fictional game responses and real guest games.
No production accounts, purchases or wallet rewards are changed.
"""
import argparse, copy, json, uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from rummy_ace_runs_browser import RoomFixture

class RummyFixture(RoomFixture):
    def __init__(self, variant='classic'):
        super().__init__(variant,['3S','4S','5S'])
        self.room['activity']=[]
    def route(self, route):
        if urlparse(route.request.url).path=='/api/rummy' and route.request.method=='POST':
            command=route.request.post_data_json; move=command['move']; self.moves.append(copy.deepcopy(move))
            assert command['revision']==self.room['revision']
            assert self.room['phase']=='play' and self.room['turn']==0
            hand=self.room['hand']
            if move['t']=='discard':
                assert move['card'] in hand and move['card']!=self.room['drewDiscard'] and not self.room['mustUse']
                hand.remove(move['card']);self.room['discard'].append(move['card']);self.room['turn']=1;self.room['phase']='draw'
            elif move['t']=='meld':
                assert len(move['cards'])>=3 and all(c in hand for c in move['cards'])
                self.room['hand']=[c for c in hand if c not in move['cards']]
                self.room['melds'].append({'cards':[{'c':c,'by':0} for c in move['cards']]})
            elif move['t']=='layoff':
                assert move['card'] in hand
                hand.remove(move['card']);self.room['melds'][move['meld']]['cards'].append({'c':move['card'],'by':0})
            else:raise AssertionError(move)
            self.room['revision']+=1;self.room['players'][0]['count']=len(self.room['hand'])
            self.respond(route,self.room)
        else:super().route(route)

class SpadesFixture:
    def __init__(self):
        self.moves=[]
        self.room={'code':'ABCD1234','revision':1,'owner':True,'status':'playing',
          'options':{'mode':'bot','variant':'solo','target':100,'humans':1,'level':'normal','table':'spades-table-classic','deck':'spades-deck-classic'},
          'mySeat':0,'players':[{'id':str(i),'name':'Player' if i==0 else f'Computer {i}','bot':i>0,'ready':True,'occupied':i==0,'you':i==0,'count':13} for i in range(4)],
          'hand':['2H','AS','3C','4C','5D','6D','7H','8H','9H','TC','JC','QD','KD'],'legal':['2H'],
          'bids':[3,3,3,3],'taken':[0]*4,'scores':[0]*4,'bags':[0]*4,'phase':'play','turn':0,'dealer':3,'round':1,'broken':False,
          'trick':[{'seat':3,'card':'KH'}],'completed':[],'result':None,'winner':None,'log':[],
          'reward':{'status':'unranked','amount':0,'message':'Fictional drag check'}}
    def route(self,route):
        path=urlparse(route.request.url).path
        if path.endswith('/session'):data={'member':False}
        elif path.endswith('/events'):route.fulfill(content_type='text/event-stream',body=': fixture\n\n');return
        elif route.request.method=='POST':
            command=route.request.post_data_json;move=command['move'];self.moves.append(copy.deepcopy(move))
            assert command['revision']==self.room['revision'] and move=={'t':'play','card':'2H'}
            self.room['hand'].remove('2H');self.room['legal']=[];self.room['turn']=1;self.room['revision']+=1
            self.room['players'][0]['count']=12;self.room['trick'].append({'seat':0,'card':'2H'});data=self.room
        else:data=self.room
        route.fulfill(content_type='application/json',body=json.dumps(data))

def button(page,card):return page.locator(f'ol[aria-label="Your hand"] [data-card="{card}"] button')
def start_drag(page,card,touch=False):
    button(page,card).scroll_into_view_if_needed()
    r=button(page,card).bounding_box();x,y=r['x']+5,r['y']+16
    if touch:
        c=page.context.new_cdp_session(page)
        c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});page.wait_for_timeout(280)
    else:
        c=None;page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+10,y,steps=3)
    return c,x,y

def hover(page,target,state):
    c,x,y=state;r=target.bounding_box();ex,ey=r['x']+r['width']/2,r['y']+r['height']/2
    if c:
        for step in range(1,13):
            c.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+(ex-x)*step/12,'y':y+(ey-y)*step/12}]});page.wait_for_timeout(12)
    else:page.mouse.move(ex,ey,steps=14)
    page.wait_for_timeout(80)

def release(page,state,cancel=False):
    c=state[0]
    if c:c.send('Input.dispatchTouchEvent',{'type':'touchCancel' if cancel else 'touchEnd','touchPoints':[]});c.detach()
    elif cancel:page.keyboard.press('Escape');page.mouse.up()
    else:page.mouse.up()
    page.wait_for_timeout(100)

def drag(page,card,target,touch=False,cancel=False,allowed=True):
    state=start_drag(page,card,touch);hover(page,target,state)
    expect(target).to_have_attribute('data-drag-state','over' if allowed else 'blocked')
    release(page,state,cancel);fitted(page)

def fitted(page):
    assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1')

def fixture_page(browser,base,fixture,game,w,h):
    ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=w<700,has_touch=w<700,reduced_motion='reduce')
    ctx.add_init_script(f"sessionStorage.setItem('cayea-{game}-room','ABCD1234')")
    ctx.route(f'**/api/{game}**',fixture.route)
    page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)));page.goto(base+'/games/'+game)
    expect(page.locator(f'.{game}-live-table')).to_be_visible();return ctx,page

parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5180');args=parser.parse_args();base=args.base_url.rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1']
out=Path('/workspace/work/card-drag-qa');out.mkdir(parents=True,exist_ok=True)
errors=[];checks=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for w,h in [(390,844),(768,1024),(568,320),(1440,1000)]:
        touch=w<700
        for variant in ['classic','r500','gin']:
            f=RummyFixture(variant);ctx,page=fixture_page(b,base,f,'rummy',w,h);pile=page.locator('[data-card-drop="rummy-discard"]')
            drag(page,'3S',pile,touch,cancel=True);assert f.moves==[]
            drag(page,'3S',pile,touch);expect(button(page,'3S'),f'{variant} discard {w}x{h}; moves={f.moves}; status={page.locator("[role=status]").all_text_contents()}').to_have_count(0)
            assert f.moves==[{'t':'discard','card':'3S'}];fitted(page)
            checks.append(f'{variant} discard and cancel {w}x{h}');ctx.close()
        for variant in ['classic','r500']:
            f=RummyFixture(variant);ctx,page=fixture_page(b,base,f,'rummy',w,h)
            for card in ['3S','4S','5S']:button(page,card).click(position={'x':5,'y':16})
            state=start_drag(page,'3S',touch);zone=page.locator('[data-card-drop="rummy-melds"]');hover(page,zone,state)
            expect(zone).to_have_attribute('data-drag-state','over');expect(page.locator('.card-drag-count')).to_have_text('3 selected')
            if w in [390,1440]:page.screenshot(path=str(out/f'meld-highlight-{w}.png'))
            release(page,state)
            expect(button(page,'3S')).to_have_count(0);assert f.moves==[{'t':'meld','cards':['3S','4S','5S']}];fitted(page)
            checks.append(f'{variant} selected meld {w}x{h}');ctx.close()
        f=SpadesFixture();ctx,page=fixture_page(b,base,f,'spades',w,h);zone=page.locator('[data-card-drop="spades-play"]')
        drag(page,'AS',zone,touch,allowed=False);assert f.moves==[]
        drag(page,'2H',zone,touch,cancel=True);assert f.moves==[]
        drag(page,'2H',zone,touch);expect(button(page,'2H')).to_have_count(0);assert f.moves==[{'t':'play','card':'2H'}];fitted(page)
        checks.append(f'Spades suit rule, cancel and play {w}x{h}');ctx.close();print(f'Gesture checks passed at {w}x{h}',flush=True)
    for changed in [{'phase':'draw'},{'turn':1},{'drewDiscard':'3S'},{'mustUse':'4S'}]:
        f=RummyFixture();f.room.update(changed);ctx,page=fixture_page(b,base,f,'rummy',390,844)
        drag(page,'3S',page.locator('[data-card-drop="rummy-discard"]'),True,allowed=False);assert f.moves==[];ctx.close()
    checks.append('Rummy before-draw, out-of-turn, picked-up-card and R500 use restrictions block drops')
    f=RummyFixture();f.room['hand'][0]='6S';f.room['melds']=[{'cards':[{'c':c,'by':1} for c in ['3S','4S','5S']]}]
    ctx,page=fixture_page(b,base,f,'rummy',390,844);drag(page,'6S',page.locator('[data-card-drop="rummy-melds"]'),True)
    expect(button(page,'6S')).to_have_count(0);assert f.moves==[{'t':'layoff','card':'6S','meld':0}];ctx.close();checks.append('Layoff extends a unique eligible meld')
    f=RummyFixture();f.room['hand'][0]='6S';f.room['melds']=[{'cards':[{'c':c,'by':1} for c in ['3S','4S','5S']]},{'cards':[{'c':c,'by':1} for c in ['6H','6D','6C']]}]
    ctx,page=fixture_page(b,base,f,'rummy',390,844);drag(page,'6S',page.locator('[data-card-drop="rummy-melds"]'),True)
    expect(page.get_by_role('heading',name='Table melds & discard pile',exact=True)).to_be_visible();assert f.moves==[]
    page.get_by_role('button',name='Lay off on meld 2',exact=True).click();assert f.moves==[{'t':'layoff','card':'6S','meld':1}];ctx.close();checks.append('Ambiguous layoff requires choosing the intended meld')
    f=RummyFixture();ctx,page=fixture_page(b,base,f,'rummy',390,844);state=start_drag(page,'3S');hover(page,page.locator('[data-card-drop="rummy-discard"]'),state)
    f.room['revision']+=1;f.room['players'][1]['score']=12;page.evaluate("dispatchEvent(new Event('focus'))")
    expect(page.locator('.rummy-player-score').nth(1)).to_have_text('12 pts');release(page,state);assert f.moves==[];ctx.close();checks.append('A server revision arriving mid-drag cancels the stale move')
    # Unmocked authoritative guest games prove the gesture submits standard moves.
    for game in ['rummy','spades']:
        ctx=b.new_context(viewport={'width':390,'height':844});page=ctx.new_page();page.goto(base+'/games/'+game)
        page.get_by_role('button',name='Start game' if game=='rummy' else 'Deal me in',exact=True).click()
        expect(page.locator(f'.{game}-live-table')).to_be_visible()
        if game=='rummy':
            page.get_by_role('button',name='Draw from stock',exact=True).click();expect(page.locator('ol[aria-label="Your hand"] [data-card]')).to_have_count(11)
        else:
            page.get_by_role('button',name='Confirm bid',exact=True).click();expect(page.get_by_role('button',name='Play selected card',exact=True)).to_be_visible()
        code=page.evaluate(f"sessionStorage.getItem('cayea-{game}-room')")
        room=ctx.request.get(base+f'/api/{game}/room/'+code).json()
        card=room['hand'][0] if game=='rummy' else room['legal'][0]
        zone=page.locator('[data-card-drop="rummy-discard"], [data-card-drop="spades-play"]')
        with page.expect_response(lambda response:response.url.endswith('/api/'+game) and response.request.method=='POST') as response:
            drag(page,card,zone)
        assert response.value.ok,response.value.text()
        data=response.value.json();assert card not in data['hand'];fitted(page);ctx.close()
        checks.append('Real guest '+game+' accepts exactly the standard legal move from a drop')
    b.close()
assert not errors,errors
(out/'report.json').write_text(json.dumps({'checks':checks,'browser_errors':errors},indent=2))
print(json.dumps({'checks':len(checks),'mouse_and_touch_verified':True,'browser_errors':errors}))
