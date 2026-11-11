"""Production-build Farkle rendering with real engine fixtures and fictional member APIs."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from economy_browser import EconomyFixture
from social_browser import ADMIN
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8811')
base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1')
root=Path(__file__).resolve().parents[1];out=Path('/tmp/classic-farkle-qa');out.mkdir(exist_ok=True)
fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e','''
import {newFarkle,applyFarkleMove} from './src/lib/farkle.ts';
import {D6_DICE_SETS,CLASSIC_D6_DICE} from './src/lib/d6-dice.ts';
const result={skins:[CLASSIC_D6_DICE,...D6_DICE_SETS].map(d=>d.id)};
for(const seats of [2,4]){
 const players=Array.from({length:seats},(_,i)=>({id:String(i),name:i?'Opponent '+i:'JadeAce',bot:i===1&&seats===2,level:'normal'}));
 const initial=newFarkle(players),roll=(s,values)=>{let i=0;return applyFarkleMove(s,s.turn,{t:'roll'},()=>(values[i++]-.5)/6)};
 const first=roll(initial,[1,5,2,3,4,2]),kept=applyFarkleMove(first,0,{t:'keep',dice:[0,1]}),bust=roll(kept,[2,2,3,4]);
 const bankRoll=roll(initial,[1,1,1,2,3,4]),banked=applyFarkleMove(bankRoll,0,{t:'bank',dice:[0,1,2]});
 result[seats]={initial,first,kept,bust,bankRoll,banked};
}console.log(JSON.stringify(result));
'''],cwd=root,text=True))

instrument='''(()=>{const Native=window.AudioContext;window.__farkleQA={oscillators:0,bursts:0};if(Native)window.AudioContext=new Proxy(Native,{construct(Target,args){const ctx=Reflect.construct(Target,args),make=ctx.createOscillator.bind(ctx);ctx.createOscillator=()=>{const node=make(),start=node.start.bind(node);node.start=(...a)=>{window.__farkleQA.oscillators++;return start(...a)};return node};return ctx}});document.addEventListener('DOMContentLoaded',()=>new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('.fk-farkle-callout'))window.__farkleQA.bursts++}).observe(document.body,{childList:true,subtree:true}));})();'''

def fit(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1')
    assert page.locator('.fk-dice-grid .fd-die').evaluate_all('(nodes)=>nodes.every(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight})')
    assert page.locator('.fk-actions button').evaluate_all('(nodes)=>nodes.every(e=>{const r=e.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight+1})')
    # Scores and reference stay above a single bottom row of six dice.
    scoreboard=page.locator('.fk-scoreboard').bounding_box();tray=page.locator('.fk-dice-grid').bounding_box()
    centers=page.locator('.fk-die-slot').evaluate_all('(els)=>els.map(e=>{const r=e.getBoundingClientRect();return r.y+r.height/2})')
    assert len(centers)==6 and max(centers)-min(centers)<1,('Dice must share one row',centers)
    assert scoreboard['y']+scoreboard['height']<=tray['y']+1
    assert page.locator('.fk-score-reference').is_visible()
    message=page.locator('.fk-roll-message').bounding_box();actions=page.locator('.fk-actions').bounding_box()
    assert tray['y']+tray['height']<=actions['y']+1
    assert message['y']+message['height']<=tray['y']+1

    assert message['y']+message['height']<=actions['y']+1,(message,actions)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    errors=[];checks=[]
    def setup(seats=2,viewport=(390,844),muted=False,reduced=False,bank=False):
        economy=EconomyFixture();economy.wallets[ADMIN]['owned']+=fixtures['skins'];economy.wallets[ADMIN].update(dice_points=1000,domino_points=0)
        economy.wallets[ADMIN]['equipped']['d6_dice']='farkle-dice-onyx'
        ctx=economy.context(browser,ADMIN,width=viewport[0]);ctx.add_init_script(instrument);ctx.set_default_timeout(10000)
        ctx.add_init_script('localStorage.setItem("clubhouse-farkle-audio-v1",'+json.dumps(json.dumps({'music':False,'effects':True,'musicVolume':.4,'effectsVolume':.65,'muted':muted}))+');')
        ctx.route('**/clubhouse-config.js',lambda route:route.fulfill(content_type='application/javascript',body='window.__CLUBHOUSE_CONFIG__={supabaseUrl:"https://clubhouse.test.invalid",supabaseKey:"public-test-key"};'))
        model={'state':'initial','seats':seats}
        def view():
            s=fixtures[str(seats)][model['state']]
            return {'code':'A1B2C3D4','revision':s['actionSequence']+1,'owner':True,'status':'playing','options':{'mode':'bot' if seats==2 else 'online','seats':seats,'level':'normal'},'mySeat':0,'players':[{'id':v['id'],'name':v['name'],'bot':v['bot'],'ready':True,'you':i==0,'occupied':True} for i,v in enumerate(s['players'])],'state':s,'reward':{'status':'ineligible','tier':None,'amount':0,'message':'Fictional local presentation test'}}
        def command(route):
            data=route.request.post_data_json
            if data['operation']=='create':model['state']='initial'
            elif data['operation']=='move':
                move=data['move']['t'];model['state']=('bankRoll' if bank else 'first') if move=='roll' and model['state']=='initial' else 'bust' if move=='roll' else 'kept' if move=='keep' else 'banked'
            route.fulfill(content_type='application/json',body=json.dumps({'view':view(),'changed':True}))
        ctx.route('**/api/farkle',command)
        ctx.route('**/api/farkle/room/A1B2C3D4',lambda route:route.fulfill(content_type='application/json',body=json.dumps(view())))
        ctx.route('**/api/farkle/room/A1B2C3D4/events',lambda route:route.fulfill(status=503,body='Polling fixture'))
        page=ctx.new_page();page.set_viewport_size({'width':viewport[0],'height':viewport[1]});page.on('pageerror',lambda e:errors.append(str(e)))
        if reduced:page.emulate_media(reduced_motion='reduce')
        page.goto(base+'/games/farkle');expect(page.get_by_role('button',name='Start Farkle',exact=True)).to_be_enabled()
        return ctx,page,economy

    ctx,page,economy=setup()
    # Every already-owned D6 design equips before the match and renders exactly six dice.
    for skin in fixtures['skins']:
        page.get_by_label('Dice set',exact=True).select_option(skin)
        expect(page.locator('.fk-six-art svg[data-dice-design="'+skin+'"]')).to_have_count(6)
    page.get_by_label('Dice set',exact=True).select_option('farkle-dice-onyx')
    page.get_by_role('button',name='Start Farkle',exact=True).click();expect(page.locator('.fk-table')).to_be_visible()
    expect(page.locator('.fk-dice-grid .fd-die')).to_have_count(6)
    expect(page.locator('.fk-dice-grid svg[data-dice-design="farkle-dice-onyx"]')).to_have_count(36)
    page.get_by_role('button',name='Smart Roll · 6 dice',exact=True).click()
    expect(page.get_by_role('button',name='Smart pick',exact=True)).to_be_enabled()
    expect(page.locator('.fk-die-slot[data-scores=true]')).to_have_count(2)
    expect(page.get_by_role('button',name='Bank 0',exact=True)).to_be_disabled()
    page.get_by_role('button',name='Smart pick',exact=True).click()
    expect(page.locator('.fk-die-slot[data-selected=true]')).to_have_count(2)
    expect(page.get_by_role('button',name='Bank 150',exact=True)).to_be_disabled()
    for w,h in [(320,568),(375,667),(390,844),(768,1024),(1024,768),(844,390),(568,320)]:
        page.set_viewport_size({'width':w,'height':h});fit(page);page.screenshot(path=str(out/f'scoring-{w}x{h}.png'))
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_role('button',name='Keep 150 points',exact=True).click()
    expect(page.locator('.fk-die-slot[data-kept=true]')).to_have_count(2)
    page.get_by_role('button',name='Roll 4 dice',exact=True).click()
    expect(page.locator('.fk-farkle-callout')).to_be_visible()
    expect(page.locator('.fk-farkle-callout strong')).to_have_text('Farkle')
    expect(page.locator('.fk-farkle-callout')).to_contain_text('150 lost')
    assert page.locator('.fk-farkle-callout strong').evaluate('(e)=>getComputedStyle(e).color')=='rgb(255, 99, 107)'
    assert page.locator('.fk-farkle-callout').evaluate('(e)=>e.getAnimations().some(a=>a.playState==="running")')
    assert page.evaluate('window.__farkleQA.oscillators')==12
    page.screenshot(path=str(out/'onyx-red-farkle.png'))
    expect(page.locator('.fk-farkle-callout')).to_have_count(0,timeout=4500)
    for _ in range(3):page.evaluate('window.dispatchEvent(new Event("focus"))');page.wait_for_timeout(80)
    assert page.evaluate('window.__farkleQA.bursts')==1
    assert page.evaluate('window.__farkleQA.oscillators')==12
    page.reload();expect(page.locator('.fk-table')).to_be_visible();page.wait_for_timeout(1000)
    expect(page.locator('.fk-farkle-callout')).to_have_count(0)
    checks.append(f'All {len(fixtures["skins"])} shared D6 finishes equip on six dice; smart hints/selection are correct; red animated Farkle and sound play once after landing, without poll/reload replay')
    ctx.close()
    for label,kwargs in [('bank',{'bank':True}),('muted',{'muted':True}),('reduced',{'reduced':True})]:
        ctx,page,_=setup(**kwargs);page.get_by_role('button',name='Start Farkle',exact=True).click();page.get_by_role('button',name='Smart Roll · 6 dice',exact=True).click()
        expect(page.get_by_role('button',name='Smart pick',exact=True)).to_be_enabled();page.get_by_role('button',name='Smart pick',exact=True).click()
        if label=='bank':
            page.get_by_role('button',name='Bank 1,000',exact=True).click();expect(page.locator('.fk-players article').first.locator('b')).to_have_text('1,000')
        else:
            page.get_by_role('button',name='Keep 150 points',exact=True).click();page.get_by_role('button',name='Roll 4 dice',exact=True).click();expect(page.locator('.fk-farkle-callout')).to_be_visible()
            if label=='muted':assert page.evaluate('window.__farkleQA.oscillators')==0
            else:assert page.locator('.fk-farkle-callout').evaluate('(e)=>e.getAnimations().length')==0
        checks.append(label+' controls work');ctx.close()
    ctx,page,_=setup(seats=4,viewport=(320,568));page.get_by_role('button',name='Start Farkle',exact=True).click();expect(page.locator('.fk-players article')).to_have_count(4);fit(page);ctx.close()
    checks.append('Four-player scores stay visible on a small phone')
    ctx,page,_=setup()
    for code in ['12345678','1e234567']:
        page.goto(base+'/games/farkle?room='+code)
        expect(page.get_by_role('button',name='Join Farkle table',exact=True)).to_be_visible()
        expect(page.get_by_label('Farkle room code',exact=True)).to_have_value(code.upper())
    ctx.close();checks.append('Numeric and scientific-looking invitation codes remain exact strings')
    assert not errors,errors
    browser.close();report={'checks':checks,'browser_errors':errors,'production_writes':False};(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
