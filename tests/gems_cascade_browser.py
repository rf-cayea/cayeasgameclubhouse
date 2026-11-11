"""Observe real rendered frames, DOM identities and gravity rather than only saved state.
Fixtures are local guest saves; no accounts or production rewards are changed.
"""
import argparse
import json
import re
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from gems_effects_browser import FIXTURE, KEY, VISIBLE_EFFECT, activate, fitted

OBSERVE = """()=>{
  const nodes=new Map(),svgs=new Map();window.cascadeReport={phases:[],remounts:[],fadedSurvivors:[],damagedCrateFades:[],movingSamples:0,frames:0};
  window.cascadeStop=false;
  function tick(){
    const board=document.querySelector('.gems-board'),report=window.cascadeReport;if(!board||window.cascadeStop)return;
    const phase=board.dataset.playbackPhase;
    if(report.phases.at(-1)!==phase)report.phases.push(phase);
    for(const node of board.querySelectorAll('.gems-moving-gem')){
      const id=node.dataset.gemId,inner=node.querySelector('.gems-gem-inner'),svg=node.querySelector('svg');
      if(nodes.has(id)&&(nodes.get(id)!==node||svgs.get(id)!==svg))report.remounts.push(id);
      nodes.set(id,node);svgs.set(id,svg);
      if(node.dataset.removing!=='true'&&Number(getComputedStyle(inner).opacity)<.98)report.fadedSurvivors.push(id);
      if(['swap','fall','shuffle'].includes(phase)&&node.getAnimations().some(a=>a.playState==='running'))report.movingSamples++;
    }
    for(const crate of board.querySelectorAll('.gems-cell-damaged>.gem-art'))if(Number(getComputedStyle(crate).opacity)<.98)report.damagedCrateFades.push(phase);
    report.frames++;requestAnimationFrame(tick);
  }
  tick();
}"""

def aligned(page):
    return page.evaluate("""()=>[...document.querySelectorAll('.gems-moving-gem')].every(node=>{
      const a=node.getBoundingClientRect(),b=document.querySelector('[data-index="'+node.dataset.cellIndex+'"]').getBoundingClientRect();
      return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width),Math.abs(a.height-b.height))<1;
    })""")

def run(base):
    checks, errors = [], []
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        for width,height in [(390,844),(768,1024),(844,390)]:
            context=browser.new_context(viewport={'width':width,'height':height},reduced_motion='no-preference',has_touch=True)
            page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            for scenario in ['tool-row','combo-lantern+burst','combo-orb+row','tool-shuffle']:
                page.goto(base+'/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
                fixture=page.evaluate(FIXTURE,scenario)
                if scenario=='tool-row':
                    # A two-layer crate ABOVE the hammer's row is damaged by
                    # its neighboring match, but must never disappear.
                    fixture=page.evaluate("""async()=>{
                      const {playGemsJourney}=await import('/src/lib/gems-progress.ts');
                      const journey=JSON.parse(localStorage.getItem('clubhouse-three-gems-v1'));
                      journey.play.board[17]={gem:null,crate:2,frost:0,chain:false};
                      localStorage.setItem('clubhouse-three-gems-v1',JSON.stringify(journey));
                      const action={type:'booster',kind:'row',target:27},next=playGemsJourney(journey,action);
                      return {action,expected:next.journey};
                    }""")
                page.reload();expect(page.get_by_role('gridcell')).to_have_count(64)
                assert aligned(page),(width,scenario,'initial artwork alignment')
                page.evaluate(OBSERVE);activate(page,fixture['action'],touch=True)
                if scenario=='tool-row':
                    expect(page.locator('[data-index="17"]')).to_have_class(re.compile('gems-cell-damaged'))
                    expect(page.locator('[data-index="17"]')).not_to_have_class(re.compile('gems-cell-clear'))
                expect(page.get_by_role('grid')).to_have_attribute('aria-busy','false',timeout=8000)
                page.wait_for_timeout(40);page.evaluate('window.cascadeStop=true')
                report=page.evaluate('window.cascadeReport')
                assert not report['remounts'],(scenario,'surviving gem SVG replaced',report)
                assert not report['fadedSurvivors'],(scenario,'surviving gems blink',report)
                assert not report['damagedCrateFades'],(scenario,'damaged crates disappear',report)
                assert report['movingSamples']>0,(scenario,'no actual gem movement',report)
                assert report['phases'][1]==('swap' if fixture['action']['type']=='swap' else 'clear'),report
                assert report['phases'][-1]=='idle',report
                assert aligned(page),(width,scenario,'final artwork alignment')
                assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)==fixture['expected']
                fitted(page)
                checks.append(f'{width}px {scenario}: stable surviving artwork, visible damage, real movement and exact final state')
            context.close()

        # A second activation must mount a fresh effect timeline instead of
        # reusing an already-finished beam/hammer animation.
        context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='no-preference')
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(base+'/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
        fixture=page.evaluate(FIXTURE,'tool-row');page.reload();expect(page.get_by_role('gridcell')).to_have_count(64)
        for remaining in [2,1]:
            page.get_by_role('button',name=f'Row hammer · {remaining} available',exact=True).click();page.locator('[data-index="27"]').click()
            page.wait_for_function(VISIBLE_EFFECT,arg='hammer-row',polling='raf')
            expect(page.get_by_role('grid')).to_have_attribute('aria-busy','false',timeout=8000)
        assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).inventory.row',KEY)==0
        checks.append('Consecutive hammers visibly restart and consume one charge each')
        context.close()

        # A newer save arriving during playback must cancel the obsolete
        # picture and release the input guard as well as update the board.
        context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='no-preference')
        a=context.new_page();a.on('pageerror',lambda error:errors.append(str(error)))
        a.goto(base+'/games/3-gems');expect(a.get_by_role('gridcell')).to_have_count(64)
        fixture=a.evaluate(FIXTURE,'tool-row');a.reload();expect(a.get_by_role('gridcell')).to_have_count(64)
        b=context.new_page();b.on('pageerror',lambda error:errors.append(str(error)))
        b.goto(base+'/games/3-gems');expect(b.get_by_role('gridcell')).to_have_count(64)
        activate(a,fixture['action'])
        expect(a.get_by_role('grid')).to_have_attribute('aria-busy','true')
        expect(b.locator('.gems-notice')).to_contain_text('updated in another tab')
        activate(b,{'type':'booster','kind':'column','target':27})
        expect(a.get_by_role('grid')).to_have_attribute('aria-busy','false')
        expect(a.locator('.gems-notice')).to_contain_text('updated in another tab')
        expect(b.get_by_role('grid')).to_have_attribute('aria-busy','false',timeout=8000)
        a.get_by_role('button',name='Row hammer · 1 available',exact=True).click();a.locator('[data-index="27"]').click()
        expect(a.get_by_role('grid')).to_have_attribute('aria-busy','false',timeout=8000)
        assert a.evaluate('(key)=>JSON.parse(localStorage.getItem(key)).revision',KEY)==3
        checks.append('A newer tab update cancels obsolete playback and leaves the garden playable')
        context.close();browser.close()
    assert not errors,errors
    print(json.dumps({'checks':len(checks),'surviving_gems_stay_visible':True,'smooth_cascades':True,'browser_errors':errors}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5173');args=parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost','127.0.0.1')
    run(args.base_url.rstrip('/'))
