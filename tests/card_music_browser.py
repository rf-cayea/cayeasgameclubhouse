"""Check real yacht-rock audio, independent mute, saved settings, and teardown in both card games."""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5180');base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ['localhost','127.0.0.1']
out=Path('/workspace/work/yacht-music-qa');out.mkdir(exist_ok=True)
instrument='''(()=>{const Native=window.AudioContext;const qa=window.__musicQA={contexts:[],analysers:[],drums:0,notes:0};window.AudioContext=new Proxy(Native,{construct(Target,args){const ctx=Reflect.construct(Target,args);qa.contexts.push(ctx);const analyser=ctx.createAnalyser();analyser.fftSize=2048;qa.analysers.push(analyser);const compressor=ctx.createDynamicsCompressor.bind(ctx);ctx.createDynamicsCompressor=()=>{const node=compressor(),connect=node.connect.bind(node);node.connect=(target)=>{if(target===ctx.destination){connect(analyser);return analyser.connect(target);}return connect(target);};return node;};for(const[key,counter]of[['createBufferSource','drums'],['createOscillator','notes']]){const make=ctx[key].bind(ctx);ctx[key]=()=>{const node=make(),start=node.start.bind(node);node.start=(...args)=>{qa[counter]++;return start(...args);};return node;};}return ctx;}});})();'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);ctx=b.new_context(viewport={'width':390,'height':844});ctx.add_init_script(instrument);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));checks=[]
 for game,start in [('rummy','Start game'),('spades','Deal me in')]:
  page.goto(base+'/games/'+game);assert page.evaluate('window.__musicQA.contexts.length')==0
  page.get_by_role('button',name=start,exact=True).click();expect(page.locator(f'.{game}-live-table')).to_be_visible()
  page.wait_for_function('window.__musicQA.contexts.at(-1)?.state==="running"&&window.__musicQA.drums>0&&window.__musicQA.notes>0')
  peak=page.evaluate('''async()=>{const a=window.__musicQA.analysers.at(-1),d=new Float32Array(a.fftSize);let max=0;for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,40));a.getFloatTimeDomainData(d);for(const n of d)max=Math.max(max,Math.abs(n));}return max;}''');assert .0001<peak<.98,peak
  page.get_by_role('button',name='Yacht rock music settings',exact=True).click();expect(page.get_by_role('heading',name='Yacht rock radio',exact=True)).to_be_visible();page.screenshot(path=str(out/(game+'-music.png')))
  page.get_by_role('button',name='Yacht rock music',exact=True).click();page.wait_for_function('window.__musicQA.contexts.at(-1).state==="suspended"')
  if game=='rummy':assert page.evaluate('window.__musicQA.contexts[0].state')=='running','Music mute must preserve announcement audio'
  page.get_by_role('button',name='Yacht rock music',exact=True).click();page.wait_for_function('window.__musicQA.contexts.at(-1).state==="running"')
  slider=page.get_by_label('Yacht rock volume',exact=True);slider.focus();page.keyboard.press('Home');page.wait_for_function('window.__musicQA.contexts.at(-1).state==="suspended"')
  page.keyboard.press('End');page.wait_for_function('window.__musicQA.contexts.at(-1).state==="running"')
  page.get_by_role('button',name='Back to game',exact=True).click()
  for w,h in [(375,667),(390,844),(768,1024),(1024,768),(568,320)]:
   page.set_viewport_size({'width':w,'height':h});assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1');assert page.get_by_role('button',name='Yacht rock music settings',exact=True).evaluate('(e)=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}')
  page.set_viewport_size({'width':390,'height':844})
  page.evaluate('''()=>{window.__qaHidden=true;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__qaHidden?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'));}''');page.wait_for_function('window.__musicQA.contexts.every(c=>c.state==="suspended")')
  page.evaluate('''()=>{window.__qaHidden=false;document.dispatchEvent(new Event('visibilitychange'));}''');page.wait_for_function('window.__musicQA.contexts.at(-1).state==="running"')
  page.get_by_role('link',name='Back to the Clubhouse',exact=True).click();page.wait_for_function('window.__musicQA.contexts.every(c=>c.state==="closed")')
  checks.append({'game':game,'real_music_peak':peak,'drums_and_keys':'audible','music_mute':'independent','background_pause_and_route_cleanup':'passed','viewports':5})
 # The shared saved music choice applies when switching games.
 page.goto(base+'/games/rummy');page.get_by_role('button',name='Yacht rock music settings',exact=True).click();page.get_by_role('button',name='Yacht rock music',exact=True).click()
 page.goto(base+'/games/spades');expect(page.locator('.spades-live-table')).to_be_visible();assert page.evaluate('window.__musicQA.contexts.length')==0
 page.get_by_role('button',name='Yacht rock music settings',exact=True).click();expect(page.get_by_role('button',name='Yacht rock music',exact=True)).to_have_attribute('aria-pressed','false')
 assert not errors,errors;ctx.close();b.close();print(json.dumps({'checks':checks,'shared_preference':'passed','browser_errors':errors}))
