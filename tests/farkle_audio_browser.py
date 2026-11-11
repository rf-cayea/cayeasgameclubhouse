"""Check real Web Audio output, sound preferences, move synchronization, and cleanup locally."""
import argparse, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5180')
base = parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost', '127.0.0.1')
out = Path('/workspace/work/farkle-audio-qa'); out.mkdir(exist_ok=True)
instrument = '''(() => {
 const Native=window.AudioContext;if(!Native)return;
 const qa=window.__audioQA={contexts:[],sources:[],oscillators:[],analysers:[]};
 window.AudioContext=new Proxy(Native,{construct(Target,args){
  const ctx=Reflect.construct(Target,args);qa.contexts.push(ctx);
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;qa.analysers.push(analyser);
  const makeCompressor=ctx.createDynamicsCompressor.bind(ctx);
  ctx.createDynamicsCompressor=()=>{const node=makeCompressor(),connect=node.connect.bind(node);node.connect=(target,...rest)=>{if(target===ctx.destination){connect(analyser);return analyser.connect(target);}return connect(target,...rest);};return node;};
  const makeBuffer=ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource=()=>{const node=makeBuffer(),start=node.start.bind(node);node.start=(...args)=>{qa.sources.push(node);return start(...args);};return node;};
  const makeOscillator=ctx.createOscillator.bind(ctx);
  ctx.createOscillator=()=>{const node=makeOscillator(),start=node.start.bind(node);node.start=(...args)=>{qa.oscillators.push(node);return start(...args);};return node;};
  return ctx;
 }});
})();'''

def peak(page):
    return page.evaluate('''async()=>{const a=window.__audioQA.analysers.at(-1),d=new Float32Array(a.fftSize);let peak=0;for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,30));a.getFloatTimeDomainData(d);for(const n of d)peak=Math.max(peak,Math.abs(n));}return peak;}''')

def source_count(page):
    return page.evaluate('window.__audioQA.sources.length')

def running(page):
    page.wait_for_function('window.__audioQA.contexts.at(-1)?.state==="running"')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    errors, checks = [], []
    def context():
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script(instrument)
        page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e))); page.goto(base + '/games/quintsee')
        return ctx, page
    ctx, page = context()
    assert page.evaluate('window.__audioQA.contexts.length') == 0
    page.get_by_role('button', name='Audio settings', exact=True).click()
    expect(page.get_by_role('heading', name='Music & sounds', exact=True)).to_be_visible()
    assert page.evaluate('window.__audioQA.contexts.length') == 0, 'Opening settings must not autoplay'
    page.get_by_role('button', name='Enable audio', exact=True).click(); running(page)
    music_peak = peak(page); assert .0001 < music_peak < .98, music_peak
    page.get_by_role('button', name='Background music', exact=True).click()
    page.wait_for_timeout(200); assert peak(page) < .00001
    before = source_count(page); page.get_by_role('button', name='Test dice sound', exact=True).click()
    page.wait_for_function('window.__audioQA.sources.length>=25')
    dice_peak = peak(page); assert .001 < dice_peak < .98, dice_peak
    assert source_count(page) - before == 25
    page.get_by_label('Dice volume', exact=True).focus(); page.keyboard.press('Home')
    expect(page.get_by_role('button', name='Test dice sound', exact=True)).to_be_disabled()
    page.keyboard.press('End'); expect(page.get_by_role('button', name='Test dice sound', exact=True)).to_be_enabled()
    page.get_by_role('button', name='Background music', exact=True).click()
    page.get_by_label('Music volume', exact=True).focus(); page.keyboard.press('End')
    assert peak(page) > .0001
    page.get_by_role('button', name='Mute all', exact=True).click()
    page.wait_for_function('window.__audioQA.contexts.at(-1).state==="suspended"')
    page.screenshot(path=str(out / 'audio-controls.png'))
    page.get_by_role('button', name='Back to game', exact=True).click()
    page.get_by_role('button', name='Start a match', exact=True).click()
    expect(page.locator('.fd-live')).to_be_visible()
    before = source_count(page)
    page.get_by_role('button', name='Roll five dice', exact=True).click(); expect(page.locator('.fd-die').first).to_be_enabled()
    assert source_count(page) == before, 'Muted rolls must stay silent'
    page.get_by_role('button', name='Audio settings', exact=True).click()
    page.get_by_role('button', name='Unmute all', exact=True).click(); running(page)
    page.get_by_role('button', name='Background music', exact=True).click()
    page.get_by_role('button', name='Back to game', exact=True).click()
    before = source_count(page); page.locator('.fd-die').first.click()
    page.wait_for_function('(n)=>window.__audioQA.sources.length>n', arg=before)
    assert source_count(page) - before == 1
    before = source_count(page); page.get_by_role('button', name='Roll again', exact=False).click()
    expect(page.get_by_label('2 of 3 rolls used', exact=True)).to_be_visible()
    expect(page.locator('.fd-die').first).to_be_enabled()
    assert source_count(page) - before == 20, 'Four released dice should make four sets of contacts'
    page.reload(); expect(page.locator('.fd-live')).to_be_visible()
    assert page.evaluate('window.__audioQA.contexts.length') == 0
    page.get_by_role('button', name='Audio settings', exact=True).click()
    expect(page.get_by_role('button', name='Background music', exact=True)).to_have_attribute('aria-pressed', 'false')
    expect(page.get_by_label('Dice volume', exact=True)).to_have_value('100')
    page.get_by_role('button', name='Background music', exact=True).click(); running(page)
    page.get_by_role('button', name='Back to game', exact=True).click()
    page.evaluate('''()=>{window.__qaVisible=false;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__qaVisible?'visible':'hidden'});document.dispatchEvent(new Event('visibilitychange'));}''')
    page.wait_for_function('window.__audioQA.contexts.at(-1).state==="suspended"')
    page.evaluate('''()=>{window.__qaVisible=true;document.dispatchEvent(new Event('visibilitychange'));}'''); running(page)
    page.get_by_role('link', name='Back to the Clubhouse', exact=True).click()
    page.wait_for_function('window.__audioQA.contexts.at(-1).state==="closed"')
    checks.append('Real music and dice waveforms, separate volumes, mute, preferences, held dice, visibility pause, and route cleanup')
    ctx.close()

    # Both real players hear the visible roll once; SSE/poll echoes do not replay it.
    contexts, pages = [], []
    for name in ['Alice', 'Bob']:
        guest_ctx, guest_page = context(); contexts.append(guest_ctx); pages.append(guest_page)
        guest_page.get_by_label('Quintsee player name', exact=True).fill(name)
    host, peer = pages
    host.get_by_role('button', name='Play with friends', exact=True).click()
    host.get_by_role('button', name='Create a private table', exact=True).click()
    expect(host.get_by_role('region', name='Quintsee multiplayer lobby', exact=True)).to_be_visible(); running(host)
    code = host.locator('.fd-code').inner_text().split()[0]
    peer.get_by_role('button', name='Join', exact=True).click(); peer.get_by_label('Quintsee room code', exact=True).fill(code)
    peer.get_by_role('button', name='Join table', exact=True).click(); running(peer)
    expect(peer.get_by_role('button', name='I’m ready', exact=True)).to_be_enabled(); peer.get_by_role('button', name='I’m ready', exact=True).click()
    expect(host.get_by_role('button', name='Start the match', exact=True)).to_be_enabled(); host.get_by_role('button', name='Start the match', exact=True).click()
    expect(host.locator('.fd-live')).to_be_visible(); host.get_by_role('button', name='Roll five dice', exact=True).click()
    for guest_page in pages:
        guest_page.wait_for_function('window.__audioQA.sources.length===25')
    host.wait_for_timeout(1800)
    assert source_count(host) == source_count(peer) == 25
    for width, height in [(320, 568), (375, 667), (390, 844), (768, 1024), (1024, 768), (568, 320)]:
        host.set_viewport_size({'width': width, 'height': height})
        assert host.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1')
        assert host.locator('.game-play-header button').evaluate_all('(items)=>items.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})')
        assert host.locator('.fd-category').evaluate_all('(items)=>items.every(e=>e.getBoundingClientRect().bottom<=innerHeight+1)')
        host.screenshot(path=str(out / f'fit-{width}x{height}.png'))
    checks.append('Both online players hear one roll; six phone/tablet layouts fit with audio controls')
    for guest_ctx in contexts: guest_ctx.close()

    fallback = browser.new_context(viewport={'width': 390, 'height': 844})
    fallback.add_init_script("Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true});Object.defineProperty(window,'webkitAudioContext',{value:undefined,configurable:true});")
    page = fallback.new_page(); page.on('pageerror', lambda e: errors.append(str(e))); page.goto(base + '/games/quintsee')
    page.get_by_role('button', name='Start a match', exact=True).click(); expect(page.locator('.fd-live')).to_be_visible()
    page.get_by_role('button', name='Roll five dice', exact=True).click(); expect(page.locator('.fd-die').first).to_be_enabled()
    page.get_by_role('button', name='Audio settings', exact=True).click()
    expect(page.get_by_text('Audio is unavailable in this browser. You can keep playing normally.', exact=True)).to_be_visible()
    checks.append('Unsupported audio never blocks gameplay')
    fallback.close(); browser.close()
    assert not errors, errors
    report = {'checks': checks, 'music_peak': music_peak, 'dice_peak': dice_peak, 'browser_errors': errors}
    (out / 'report.json').write_text(json.dumps(report, indent=2)); print(json.dumps(report))
