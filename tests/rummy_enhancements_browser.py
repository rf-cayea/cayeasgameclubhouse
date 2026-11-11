"""UI fixtures check Rummy callouts and real audio output; engine tests independently check scoring."""
import argparse, copy, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from rummy_ace_runs_browser import RoomFixture

parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5180');base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1']
out=Path('/workspace/work/rummy-enhancements-qa');out.mkdir(exist_ok=True)
class CallFixture(RoomFixture):
    def __init__(self,kind,opponent=False):
        super().__init__('gin' if kind in ['knock','gin'] else 'classic',['3S','4S','5S'])
        self.kind=kind;self.opponent=opponent
        self.room['hand']=['3S','4S','5S','6S','7S','8S','9S','TS','2H','AC'] if kind=='knock' else ['AS','2S','3S','4H','5H','6H','7D','8D','9D','KC'] if kind=='gin' else ['3S'] if not opponent else self.room['hand']
        self.room['players'][0]['count']=len(self.room['hand']);self.room['activity']=[]
    def route(self,route):
        if urlparse(route.request.url).path=='/api/rummy' and route.request.method=='POST':
            move=route.request.post_data_json['move'];self.moves.append(copy.deepcopy(move))
            assert move['t']=='discard' and move['card'] in self.room['hand']
            if self.kind in ['knock','gin']: assert move.get('knock') is True
            self.room['hand'].remove(move['card']);actor=1 if self.opponent else 0
            self.room.update(phase='roundOver',revision=self.room['revision']+1,roundResult={'winner':1 if self.kind=='knock' else actor,'points':[0,25] if self.kind=='knock' else [35,0], 'note':'Fixture completed round','announcement':{'kind':self.kind,'seat':actor,'deadwood':2 if self.kind=='knock' else 0}})
            self.respond(route,self.room)
        else: super().route(route)
instrument='''(()=>{const Native=window.AudioContext;window.__rummyAudio={contexts:[],buffers:0,tones:0};window.AudioContext=new Proxy(Native,{construct(Target,args){const ctx=Reflect.construct(Target,args),qa=window.__rummyAudio;qa.contexts.push(ctx);for(const[key,counter]of[['createBufferSource','buffers'],['createOscillator','tones']]){const make=ctx[key].bind(ctx);ctx[key]=()=>{const node=make(),start=node.start.bind(node);node.start=(...args)=>{qa[counter]++;return start(...args);};return node;};}return ctx;}});})();'''
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);errors=[];checks=[]
    for kind,opponent,muted in [('knock',False,False),('gin',False,False),('out',False,False),('out',True,False),('gin',False,True)]:
        ctx=b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce' if muted else 'no-preference');ctx.add_init_script(instrument);ctx.add_init_script('localStorage.setItem("clubhouse-card-music-v1",JSON.stringify({enabled:false,volume:.4}))')
        ctx.add_init_script("sessionStorage.setItem('cayea-rummy-room','ABCD1234');localStorage.setItem('clubhouse-rummy-sound-v1','"+('off' if muted else 'on')+"');")
        fixture=CallFixture(kind,opponent);ctx.route('**/api/rummy**',fixture.route)
        page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)));page.goto(base+'/games/rummy');expect(page.locator('.rummy-live-table')).to_be_visible()
        original=page.locator('ol[aria-label="Your hand"] [data-card]').evaluate_all('(es)=>es.map(e=>e.dataset.card)')
        page.get_by_role('button',name='Smart sort',exact=True).click()
        arranged=page.locator('ol[aria-label="Your hand"] [data-card]').evaluate_all('(es)=>es.map(e=>e.dataset.card)')
        assert sorted(original)==sorted(arranged) and not fixture.moves
        page.get_by_role('button',name='Smart sort',exact=True).click();assert page.locator('ol[aria-label="Your hand"] [data-card]').evaluate_all('(es)=>es.map(e=>e.dataset.card)')==arranged
        card='AC' if kind=='knock' else 'KC' if kind=='gin' else '3S'
        page.locator(f'ol[aria-label="Your hand"] [data-card="{card}"] button').click(position={'x':5,'y':16})
        page.get_by_role('button',name='Knock' if kind=='knock' else 'Go Gin' if kind=='gin' else 'Discard selected',exact=True).click()
        banner=page.locator('.rummy-announcement');expect(banner).to_be_visible();expect(banner).to_have_attribute('data-call',kind)
        expect(banner.locator('span')).to_have_text('Computer' if opponent else 'Player')
        if kind=='knock': expect(banner).to_contain_text('Undercut by Computer')
        if muted: assert banner.locator('.rummy-announcement-card').evaluate('(e)=>getComputedStyle(e).animationName')=='none'
        page.screenshot(path=str(out/f'{kind}-opponent{opponent}-muted{muted}.png'))
        page.wait_for_timeout(350)
        audio=page.evaluate('({buffers:window.__rummyAudio.buffers,tones:window.__rummyAudio.tones})')
        assert audio==({'buffers':0,'tones':0} if muted else {'buffers':2,'tones':0} if kind=='knock' else {'buffers':0,'tones':12}),audio
        page.wait_for_timeout(1350);assert page.evaluate('({buffers:window.__rummyAudio.buffers,tones:window.__rummyAudio.tones})')==audio
        page.get_by_role('button',name='View round result →',exact=True).click();expect(page.get_by_role('dialog')).to_be_visible();expect(banner).to_have_count(0)
        page.reload();expect(page.get_by_role('dialog')).to_be_visible();expect(page.locator('.rummy-announcement')).to_have_count(0)
        assert page.evaluate('window.__rummyAudio.buffers+window.__rummyAudio.tones')==0
        page.get_by_role('button',name='Back to game',exact=True).click()
        for w,h in [(375,667),(768,1024),(1024,768),(568,320)]:
            page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1')
        checks.append({'kind':kind,'opponent':opponent,'muted':muted,'audio':audio,'no_duplicate_on_poll_or_reload':True});ctx.close()
    b.close();assert not errors,errors;report={'checks':checks,'smart_sort':'permutation, idempotent, no game commands','browser_errors':errors};(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
