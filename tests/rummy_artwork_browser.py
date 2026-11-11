"""Earned-artwork UI with fictional, intercepted Auth and game API responses.
Run against the local dummy-config Vite server; no real accounts or rewards.
"""
import argparse, base64, copy, json
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, SupabaseFixture, session

DEFAULT = {'background':'rummy-room-classic','table':'rummy-table-classic','deck':'rummy-standard'}
DESIGNS=[('rummy-room-classic',0),('rummy-table-classic',0),('rummy-standard',0),('rummy-deck-atlas',1),('rummy-deck-ember',3),('rummy-deck-grove',5),('rummy-deck-deco',10),('rummy-room-riviera',1),('rummy-table-riviera',2),('rummy-room-moonlit',3),('rummy-table-sapphire',5),('rummy-room-library',7),('rummy-table-burgundy',10)]
def actor(request,fallback=ADMIN):
    try:
        token=request.headers.get('authorization','').removeprefix('Bearer ').split('.')[1]
        return json.loads(base64.urlsafe_b64decode(token+'='*(-len(token)%4)))['sub']
    except (IndexError,ValueError,KeyError):return fallback
class Fixture(SupabaseFixture):
    def __init__(self):
        super().__init__();self.wins={ADMIN:0,MEMBER:0};self.equipped={ADMIN:dict(DEFAULT),MEMBER:dict(DEFAULT)};self.hold=False;self.pending=[]
        self.room={'code':'ABCD1234','mode':'bot','variant':'classic','capacity':2,'status':'playing','revision':1,'owner':True,'mySeat':0,
          'players':[{'id':ADMIN,'name':'Alice','bot':False,'count':10,'score':0,'ready':True,'you':True},{'id':'computer','name':'Computer','bot':True,'count':10,'score':0,'ready':True,'you':False}],
          'hand':['AS','2S','3S','4H','5H','6H','7D','8D','9C','TC'],'discard':['KS'],'stockCount':30,'melds':[],'phase':'draw','turn':0,'dealer':0,'round':1,'target':100,'winner':None,'roundResult':None,'mustUse':None,'drewDiscard':None,'opening':None,'jokers':False,'log':[],'revealedHands':None,'reward':{'status':'eligible','amount':70,'tier':'normal','message':'Win this match to earn 70 Rummy+ points.'}}
    def http(self,route,fallback_user):super().http(route,actor(route.request,fallback_user))
    def appearance(self,user):
        n=self.wins[user];return {'member':True,'wins':n,'owned':[id for id,wins in DESIGNS if wins<=n],'equipped':self.equipped[user]}
    def respond(self,route,data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data))
    def game(self,route):
        path=urlparse(route.request.url).path;user=actor(route.request)
        if path.endswith('/appearance'):
            if route.request.method=='POST':
                if self.hold:self.pending.append((route,user,route.request.post_data_json));return
                self.equip(route,user,route.request.post_data_json);return
            self.respond(route,self.appearance(user))
        elif path.endswith('/events'):route.fulfill(content_type='text/event-stream',body=': fixture\n\n')
        elif '/room/' in path:
            self.respond(route,self.room if user==ADMIN else {'error':'Not your room'},200 if user==ADMIN else 403)
        elif path.endswith('/session'):self.respond(route,{'member':True,'jokers':False})
        else:raise AssertionError(path)
    def equip(self,route,user,body):
        assert set(body)=={'background','table','deck'}
        assert all(id in self.appearance(user)['owned'] for id in body.values())
        self.equipped[user]=dict(body);self.respond(route,self.appearance(user))

parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5174');args=parser.parse_args();assert urlparse(args.base_url).hostname in ('localhost','127.0.0.1')
checks=[];errors=[];fixture=Fixture()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    context=fixture.context(browser,ADMIN,390);context.route('**/api/rummy/**',fixture.game);context.add_init_script("sessionStorage.setItem('cayea-rummy-room','ABCD1234')")
    page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)));page.goto(args.base_url+'/games/rummy')
    expect(page.locator('.rummy-live-table')).to_be_visible();page.get_by_role('button',name='Artwork & rewards',exact=True).click()
    expect(page.locator('.rummy-design')).to_have_count(13);expect(page.get_by_role('button',name='Locked ·',exact=False)).to_have_count(7)
    # The artist-deck showroom moves lazily loaded room swatches below the
    # dialog fold; reveal each swatch before checking its real image decode.
    for image in page.locator('.rummy-design img').all():
        image.scroll_into_view_if_needed()
        expect(image).to_have_js_property('complete',True)
        assert image.evaluate('n=>n.naturalWidth>0')
    checks.append('Collections show decks and tables, including four new purchasable surfaces; room backgrounds are absent')
    page.get_by_role('button',name='Back to game',exact=True).click()
    fixture.wins[ADMIN]=1;fixture.room.update(status='finished',phase='gameOver',revision=2,winner=0,hand=[],roundResult={'winner':0,'points':[105,0],'note':'Alice wins.'},revealedHands=[[],['KH']])
    page.evaluate("dispatchEvent(new Event('focus'))")
    expect(page.get_by_role('dialog',name='Round result',exact=True)).to_be_visible();page.get_by_role('button',name='Back to game',exact=True).click()
    expect(page.get_by_text('Artwork earned: Midnight Atlas.',exact=False)).to_be_visible();page.get_by_role('button',name='View reward',exact=True).click()
    fixture.wins[ADMIN]=2;page.get_by_role('button',name='Back to game',exact=True).click();page.evaluate("dispatchEvent(new Event('focus'))");page.get_by_role('button',name='Artwork & rewards',exact=True).click()
    riviera=page.locator('.rummy-design').filter(has=page.get_by_role('heading',name='Riviera Teal',exact=True));riviera.get_by_role('button',name='Use design',exact=True).click();expect(riviera.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
    assert 'table-riviera.webp' in page.locator('.table-play-stage').evaluate('n=>getComputedStyle(n).backgroundImage')
    checks.append('A completed match refreshes the unlock, announces the earned reward and equips it')
    page.get_by_role('button',name='Back to game',exact=True).click();page.reload();expect(page.get_by_role('dialog',name='Round result',exact=True)).to_be_visible();page.get_by_role('button',name='Back to game',exact=True).click()
    page.wait_for_function("getComputedStyle(document.querySelector('.table-play-stage')).backgroundImage.includes('table-riviera.webp')")
    checks.append('Selected earned table surface survives reload')
    fixture.wins[ADMIN]=10;page.evaluate("dispatchEvent(new Event('focus'))");page.get_by_role('button',name='Artwork & rewards',exact=True).click();expect(page.get_by_text('All 7 rewards collected',exact=False)).to_be_visible()
    burgundy=page.locator('.rummy-design').filter(has=page.get_by_role('heading',name='Royal Burgundy',exact=True));burgundy.get_by_role('button',name='Use design',exact=True).click();expect(burgundy.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
    assert 'table-burgundy.webp' in page.locator('.table-play-stage').evaluate('n=>getComputedStyle(n).backgroundImage')
    assert fixture.equipped[ADMIN]=={'background':'rummy-room-classic','table':'rummy-table-burgundy','deck':'rummy-standard'}
    checks.append('Earned milestones unlock tables and decks while paid surfaces stay separate')
    fixture.hold=True;moonlit=page.locator('.rummy-design').filter(has=page.get_by_role('heading',name='Midnight Sapphire',exact=True));moonlit.get_by_role('button',name='Use design',exact=True).click()
    page.wait_for_timeout(100);assert fixture.pending
    page.evaluate("""async value=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {error}=await supabase.auth.setSession(value);if(error)throw error;}""",session(MEMBER))
    expect(page.locator('.rummy-collection-progress')).to_contain_text('0 verified match wins')
    fixture.hold=False
    for route,user,body in fixture.pending:fixture.equip(route,user,body)
    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    expect(page.get_by_role('button',name='Locked ·',exact=False)).to_have_count(7)
    assert 'table-classic.webp' in page.locator('.table-play-stage').evaluate('n=>getComputedStyle(n).backgroundImage')
    checks.append('Late equip responses cannot transfer the previous account collection or equipment')
    page.screenshot(path='/workspace/work/allgames-qa/rummy-rewards-mobile.png',full_page=True);context.close();browser.close()
assert not errors,errors
print(json.dumps({'checks':checks,'real_accounts_or_rewards_changed':False,'browser_errors':errors}))
