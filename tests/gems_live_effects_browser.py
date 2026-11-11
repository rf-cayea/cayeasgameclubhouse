"""Production-bundle effects at real speed, including pixels between gem cells.

Start Vite preview on 5180 after build:sites. No virtual clock, animation pause,
or forced screenshot pose is used. All boards and rewards are guest fixtures.
"""
import argparse
import io
import json
import math
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image, ImageChops, ImageDraw
from playwright.sync_api import expect, sync_playwright
from gems_effects_browser import FIXTURE, KEY, activate, fitted

ROOT = Path(__file__).resolve().parent.parent
CASES = ['row', 'column', 'burst', 'orb', 'lantern', 'combo-row+burst', 'tool-row']

def fixtures():
    source = FIXTURE.replace("'/src/lib/", "'" + str(ROOT / 'src/lib') + '/')
    script = 'globalThis.localStorage={data:null,setItem(k,v){this.data=v}};const make=' + source + ';const values={};'
    script += 'for(const name of ' + json.dumps(CASES) + '){const next=await make(name);values[name]={...next,initial:JSON.parse(localStorage.data)}};process.stdout.write(JSON.stringify(values));'
    return json.loads(subprocess.check_output(['node', '--import', 'tsx', '--input-type=module', '-'], input=script, text=True, cwd=ROOT))

OBSERVE = """()=>{
  window.impactSamples=[];window.stopImpactSamples=false;
  function tick(){
    if(window.stopImpactSamples)return;
    const fx=document.querySelector('.gems-fx'),mark=fx?.querySelector('[data-activation-mark]');
    if(mark){
      let opacity=1;for(let n=mark;n&&n!==fx.parentElement;n=n.parentElement){const s=getComputedStyle(n);opacity*=Number(s.opacity);if(s.visibility==='hidden'||s.display==='none')opacity=0;}
      window.impactSamples.push({time:performance.now(),opacity,phase:document.querySelector('.gems-board').dataset.playbackPhase,kind:mark.dataset.activationMark});
    }
    requestAnimationFrame(tick);
  }
  tick();
}"""

def run(base, output):
    values, checks, errors = fixtures(), [], []
    output.mkdir(parents=True, exist_ok=True)
    modes = [('normal', 390, CASES), ('normal', 768, ['row', 'burst', 'orb']),
             ('reduced', 390, ['row', 'orb', 'tool-row']), ('finished-decoration', 390, ['row', 'burst', 'lantern'])]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        for mode, width, names in modes:
            for name in names:
                fixture = values[name]
                context = browser.new_context(viewport={'width':width,'height':844 if width==390 else 1024}, has_touch=True, reduced_motion='reduce' if mode=='reduced' else 'no-preference')
                context.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(fixture['initial']))+');')
                page = context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
                page.goto(base+'/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
                if mode=='finished-decoration':
                    # Main impact must remain visible when the decorative
                    # animated groups have already faded or failed to paint.
                    page.add_style_tag(content='.gems-fx [data-effect-kind]>:not(.gem-fx-steady-impact){visibility:hidden!important}')
                page.evaluate(OBSERVE);activate(page,fixture['action'],touch=True)
                mark=page.locator('[data-activation-mark]').first
                expect(mark).to_be_attached()
                assert mark.evaluate('node=>node.getAnimations({subtree:true}).length')==0
                start=page.evaluate('window.impactSamples[0]?.time ?? performance.now()')
                duration=page.locator('.gems-fx').evaluate('node=>parseFloat(node.style.getPropertyValue("--gem-fx-duration"))')
                assert duration>=800,(mode,name,duration)
                # Observe near the latter half of the real impact, after the
                # old particle animation would already be almost transparent.
                page.wait_for_timeout(max(0,start+duration*.6-page.evaluate('performance.now()')))
                expect(mark).to_be_attached()
                geometry=page.get_by_role('gridcell').evaluate_all('nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})')
                visible=page.screenshot(animations='allow')
                page.locator('.gems-fx').evaluate('node=>node.style.visibility="hidden"')
                hidden=page.screenshot(animations='allow')
                page.evaluate('document.querySelector(".gems-fx")?.style.removeProperty("visibility")')
                # Compare only board gaps: changing gem opacity cannot satisfy
                # this assertion. A real rendered beam, trail or bloom must.
                a,b=Image.open(io.BytesIO(visible)).convert('RGB'),Image.open(io.BytesIO(hidden)).convert('RGB')
                diff=ImageChops.difference(a,b)
                minx,miny=geometry[0]['x'],geometry[0]['y'];maxx,maxy=geometry[-1]['right'],geometry[-1]['bottom']
                gaps=Image.new('L',a.size);draw=ImageDraw.Draw(gaps)
                def bounds(x,y,right,bottom):
                    return (math.ceil(x-.5),math.ceil(y-.5),math.ceil(right-.5)-1,math.ceil(bottom-.5)-1)
                draw.rectangle(bounds(minx,miny,maxx,maxy),fill=255)
                for cell in geometry:draw.rectangle(bounds(cell['x'],cell['y'],cell['right'],cell['bottom']),fill=0)
                red,green,blue=diff.split();bright=ImageChops.lighter(ImageChops.lighter(red,green),blue).point(lambda value:255 if value>35 else 0)
                changed=ImageChops.multiply(bright,gaps).histogram()[255]
                assert changed>=25,(mode,width,name,'no painted impact in board gaps',changed)
                (output/f'{mode}-{width}-{name}.png').write_bytes(visible)
                fitted(page)
                expect(page.get_by_role('grid')).to_have_attribute('aria-busy','false',timeout=10000)
                page.evaluate('window.stopImpactSamples=true')
                samples=page.evaluate('window.impactSamples')
                # Hidden samples belong to our pixel baseline only; all other
                # observed impact samples must remain fully opaque.
                assert all(s['opacity']>=.95 for s in samples if s['opacity']>0),(mode,name,samples)
                assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)==fixture['expected']
                expect(page.locator('.gems-fx')).to_have_count(0)
                checks.append({'mode':mode,'width':width,'case':name,'painted_gap_pixels':changed})
                context.close()
        browser.close()
    assert not errors,errors
    print(json.dumps({'checks':len(checks),'production_bundle':True,'normal_speed':True,'painted_pixels_verified':True,'browser_errors':errors}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5180');parser.add_argument('--screenshots',default='test-results/gems-live-effects');args=parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost','127.0.0.1')
    run(args.base_url.rstrip('/'),Path(args.screenshots))
