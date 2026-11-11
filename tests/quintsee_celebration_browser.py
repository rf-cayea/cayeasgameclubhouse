"""Check Quintsee celebrations using committed engine fixtures and real browser audio."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8811')
base = parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost', '127.0.0.1'), 'Run only against a local preview'
root = Path(__file__).resolve().parents[1]
out = Path('/tmp/quintsee-celebration-qa')
out.mkdir(exist_ok=True)
fixtures = json.loads(subprocess.check_output(['node', '--import', 'tsx', '--input-type=module', '-e', '''
import {newFiveDice,applyFiveDiceMove} from './src/lib/five-dice.ts';
const players=[{id:'a',name:'Alice',bot:false},{id:'b',name:'Normal Computer',bot:true}];
const initial=newFiveDice(players),move=(state,input,random=()=>.99)=>applyFiveDiceMove(state,state.turn,input,random);
let face=0;const mixed=move(initial,{t:'roll'},()=>((face++%5)+.5)/6),five=move(mixed,{t:'roll'}),held=move(five,{t:'hold',index:0});
const scored=move(held,{t:'score',category:'five-kind'}),botRoll=move(scored,{t:'roll'},()=>.8),botBatch=move(botRoll,{t:'score',category:'five-kind'});
const onlineRoll=move(initial,{t:'roll'}),onlineBatch=move(onlineRoll,{t:'score',category:'five-kind'});
console.log(JSON.stringify({initial,mixed,five,held,scored,botBatch,onlineBatch}));
'''], cwd=root, text=True))

instrument = '''(() => {
 const Native=window.AudioContext;if(!Native)return;
 const qa=window.__quintseeQA={oscillators:[],analysers:[],bursts:0};
 window.AudioContext=new Proxy(Native,{construct(Target,args){
  const ctx=Reflect.construct(Target,args),analyser=ctx.createAnalyser();analyser.fftSize=2048;qa.analysers.push(analyser);
  const makeCompressor=ctx.createDynamicsCompressor.bind(ctx);
  ctx.createDynamicsCompressor=()=>{const node=makeCompressor(),connect=node.connect.bind(node);node.connect=(target,...rest)=>{if(target===ctx.destination){connect(analyser);return analyser.connect(target);}return connect(target,...rest);};return node;};
  const makeOscillator=ctx.createOscillator.bind(ctx);
  ctx.createOscillator=()=>{const node=makeOscillator(),start=node.start.bind(node);node.start=(...args)=>{qa.oscillators.push(node);return start(...args);};return node;};
  return ctx;
 }});
 document.addEventListener('DOMContentLoaded',()=>new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('.fd-quintsee-burst'))qa.bursts++;
 }).observe(document.body,{childList:true,subtree:true}));
})();'''

def wave_peak(page):
    return page.evaluate('''async()=>{const a=window.__quintseeQA.analysers.at(-1),d=new Float32Array(a.fftSize);let peak=0;for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,25));a.getFloatTimeDomainData(d);for(const n of d)peak=Math.max(peak,Math.abs(n));}return peak;}''')

def fit(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1')
    assert page.locator('.fd-die-visual').evaluate_all('(items)=>items.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})')
    assert page.locator('.fd-category').evaluate_all('(items)=>items.every(e=>e.getBoundingClientRect().bottom<=innerHeight+1)')

def glow(page, player):
    expect(page.locator('.fd-quintsee-word')).to_have_text('Quintsee')
    expect(page.locator('.fd-quintsee-burst')).to_contain_text(player)
    expect(page.locator('.fd-quintsee-burst')).to_contain_text('Five of a kind!')
    expect(page.locator('.fd-dice-arena[data-quintsee=true] .fd-die')).to_have_count(5)
    assert page.locator('.fd-die-visual').evaluate_all('(items)=>items.every(e=>getComputedStyle(e).filter.includes("brightness")&&getComputedStyle(e,":after").borderTopColor==="rgb(255, 243, 191)")')
    assert page.locator('.fd-die').evaluate_all('(items)=>items.every(e=>e.dataset.rolling==="false")')
    fit(page)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    errors, checks, peaks = [], [], []

    def setup(viewport, my_seat=0, mode='bot', state='initial', muted=False, reduced=False, unavailable=False):
        ctx = browser.new_context(viewport={'width':viewport[0], 'height':viewport[1]}, reduced_motion='reduce' if reduced else 'no-preference')
        ctx.add_init_script(instrument)
        settings = {'music':False,'effects':True,'musicVolume':.4,'effectsVolume':.65,'muted':muted}
        ctx.add_init_script('localStorage.setItem("clubhouse-farkle-audio-v1",'+json.dumps(json.dumps(settings))+');sessionStorage.setItem("clubhouse-five-dice:guest:room","A1B2C3D4");')
        if unavailable:
            ctx.add_init_script("Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true});Object.defineProperty(window,'webkitAudioContext',{value:undefined,configurable:true});")
        model = {'state':state}
        def view():
            s = fixtures[model['state']]
            players = [{'id':v['id'],'name':v['name'] if mode=='bot' else ['Alice','Bob'][i], 'bot':v['bot'] if mode=='bot' else False,'ready':True,'occupied':True,'you':i==my_seat} for i,v in enumerate(s['players'])]
            return {'code':'A1B2C3D4','revision':s['actionSequence']+1,'owner':my_seat==0,'status':'playing','options':{'mode':mode,'seats':2,'level':'normal'},'mySeat':my_seat,'players':players,'state':s,'reward':{'status':'ineligible','message':'Local presentation fixture'}}
        ctx.route('**/api/five-dice/room/A1B2C3D4', lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(view())))
        ctx.route('**/api/five-dice/room/A1B2C3D4/events', lambda route:route.fulfill(status=503,body='Polling fixture'))
        def command(route):
            data = route.request.post_data_json
            if data['operation']=='move':
                t=data['move']['t']
                model['state'] = ('mixed' if model['state']=='initial' else 'five') if t=='roll' else 'held' if t=='hold' else 'scored'
            route.fulfill(status=200,content_type='application/json',body=json.dumps({'view':view(),'changed':True}))
        ctx.route('**/api/five-dice', command)
        page = ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/games/quintsee');expect(page.locator('.fd-live')).to_be_visible()
        expect(page.locator('.fd-quintsee-burst')).to_have_count(0)
        if not muted and not unavailable:
            page.get_by_role('button',name='Audio settings',exact=True).click()
            page.get_by_role('button',name='Enable audio',exact=True).click()
            page.get_by_role('button',name='Back to game',exact=True).click()
        return ctx,page,model

    # A real UI roll, a near miss, then five equal faces. Score/hold/poll echoes do not retrigger.
    ctx,page,model=setup((390,844))
    page.get_by_role('button',name='Roll five dice',exact=True).click()
    expect(page.get_by_role('button',name='Roll again · 2 left',exact=True)).to_be_enabled()
    expect(page.locator('.fd-quintsee-burst')).to_have_count(0)
    assert page.evaluate('window.__quintseeQA.oscillators.length')==0
    page.get_by_role('button',name='Roll again · 2 left',exact=True).click()
    expect(page.locator('.fd-die[data-rolling=true]')).to_have_count(5)
    page.wait_for_timeout(250);expect(page.locator('.fd-quintsee-burst')).to_have_count(0)
    expect(page.locator('.fd-quintsee-burst')).to_be_visible();glow(page,'You')
    assert page.locator('.fd-quintsee-burst').evaluate('(e)=>e.getAnimations().some(a=>a.playState==="running")')
    assert page.evaluate('window.__quintseeQA.oscillators.length')==33
    peak=wave_peak(page);assert .001<peak<.98,peak;peaks.append(peak)
    page.screenshot(path=str(out/'phone-quintsee.png'))
    expect(page.locator('.fd-quintsee-burst')).to_have_count(0,timeout=4500)
    page.locator('.fd-die').first.click();expect(page.locator('.fd-die').first).to_have_attribute('aria-pressed','true')
    for _ in range(3):page.evaluate('window.dispatchEvent(new Event("focus"))');page.wait_for_timeout(90)
    expect(page.locator('.fd-quintsee-burst')).to_have_count(0)
    assert page.evaluate('window.__quintseeQA.bursts')==1
    assert page.evaluate('window.__quintseeQA.oscillators.length')==33
    page.get_by_role('button',name='Five of a kind: 50 available',exact=True).click()
    page.get_by_role('button',name='Score 50',exact=True).click()
    model['state']='botBatch';page.evaluate('window.dispatchEvent(new Event("focus"))')
    expect(page.locator('.fd-quintsee-burst')).to_be_visible(timeout=6000);glow(page,'Normal Computer')
    assert page.locator('.fd-die').first.get_attribute('aria-label').startswith('Die 1: 5')
    page.screenshot(path=str(out/'computer-quintsee.png'))
    expect(page.locator('.fd-quintsee-burst')).to_have_count(0,timeout=4500)
    expect(page.get_by_role('button',name='Roll five dice',exact=True)).to_be_enabled(timeout=4000)
    page.reload();expect(page.locator('.fd-live')).to_be_visible();page.wait_for_timeout(1100)
    expect(page.locator('.fd-quintsee-burst')).to_have_count(0)
    assert page.evaluate('window.__quintseeQA.bursts')==0
    checks.append('Player and computer five-of-a-kind: synchronized landing, one audible fanfare, all five dice glow; no hold/poll/reload replay')
    ctx.close()

    for viewport in [(768,1024),(844,390),(320,568)]:
        ctx,page,model=setup(viewport,my_seat=1,mode='online')
        model['state']='onlineBatch';page.evaluate('window.dispatchEvent(new Event("focus"))')
        expect(page.locator('.fd-quintsee-burst')).to_be_visible();glow(page,'Alice')
        assert page.evaluate('window.__quintseeQA.oscillators.length')==33
        page.screenshot(path=str(out/f'online-{viewport[0]}x{viewport[1]}.png'))
        checks.append(f'Online opponent celebration with queued score fits {viewport[0]}x{viewport[1]} without scrolling')
        ctx.close()

    for label, options in [('muted',{'muted':True}),('reduced-motion',{'reduced':True}),('no-audio',{'unavailable':True})]:
        ctx,page,model=setup((390,844),my_seat=1,mode='online',**options)
        model['state']='onlineBatch';page.evaluate('window.dispatchEvent(new Event("focus"))')
        expect(page.locator('.fd-quintsee-burst')).to_be_visible();glow(page,'Alice')
        if label=='muted':assert page.evaluate('window.__quintseeQA.oscillators.length')==0
        if label=='reduced-motion':assert page.locator('.fd-quintsee-burst,.fd-quintsee-word,.fd-die-visual').evaluate_all('(items)=>items.every(e=>e.getAnimations().length===0)')
        checks.append(f'Celebration remains visible with {label} preferences')
        ctx.close()
    browser.close()
    assert not errors, errors
    report={'checks':checks,'fanfare_peak':peaks,'browser_errors':errors}
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
