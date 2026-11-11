"""Real gem engine and animation integration using explicit local-save positions.
No Supabase accounts, purchases, or remote game rewards are used.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

KEY = 'clubhouse-three-gems-v1'
FIXTURE = """async scenario => {
  const {newGemsJourney,playGemsJourney}=await import('/src/lib/gems-progress.ts');
  const journey=newGemsJourney(),state=journey.play;
  state.board=Array.from({length:64},(_,i)=>({gem:{id:i+1,color:(Math.floor(i/8)*2+i%8)%6},crate:0,frost:0,chain:false}));state.nextId=65;
  let action;
  if(scenario.startsWith('tool-')){
    const kind=scenario.slice(5);action={type:'booster',kind,target:27};
    if(kind==='row'){state.board[26].frost=1;state.board[28].chain=true;state.board[24]={gem:null,crate:1,frost:0,chain:false};}
    if(kind==='column'){state.board[19].frost=1;state.board[35].chain=true;}
  }else if(scenario.startsWith('combo-')){
    const kinds=scenario.slice(6).split('+');
    kinds.forEach((special,n)=>{state.board[27+n].gem.special=special;state.board[27+n].gem.color=special==='orb'?-1:n+2});
    state.board[0].frost=1;action={type:'swap',a:27,b:28};
  }else if(scenario==='orb'){
    state.board[27].gem.special='orb';state.board[27].gem.color=-1;action={type:'swap',a:27,b:28};
  }else if(scenario==='bloom'){
    for(const i of [0,1,3,10])state.board[i].gem.color=1;state.board[2].gem.color=2;action={type:'swap',a:2,b:10};
  }else{
    state.board[27].gem.special=scenario;state.board[27].gem.color=1;
    state.board[25].gem.color=3;state.board[26].gem.color=1;state.board[28].gem.color=2;state.board[20].gem.color=1;
    if(scenario==='lantern')state.board[0].frost=1;
    action={type:'swap',a:20,b:28};
  }
  localStorage.setItem('clubhouse-three-gems-v1',JSON.stringify(journey));
  const next=playGemsJourney(journey,action);if(!next)throw new Error('Invalid visual fixture '+scenario);
  const {buildGemsPlayback}=await import('/src/lib/gems-presentation.ts');
  const playback=buildGemsPlayback(state,next.outcome,action,1,false),impactDuration=playback.find(frame=>frame.phase==='clear').durationMs;
  return {action,impactDuration,expected:next.journey,combo:next.outcome.frames[0]?.combo?.kind,kinds:[...new Set(next.outcome.frames.flatMap(frame=>(frame.effects||[]).map(effect=>effect.kind)))]};
}"""


def fitted(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1')


def watch(page):
    page.evaluate("""()=>{window.gemEffectHistory=[];window.gemEffectObserver=new MutationObserver(()=>{
      for(const node of document.querySelectorAll('.gems-fx [data-effect-kind]'))window.gemEffectHistory.push(node.dataset.effectKind);
    });window.gemEffectObserver.observe(document.querySelector('.gems-board'),{childList:true,subtree:true});}""")


VISIBLE_EFFECT = """kind=>{
  const group=document.querySelector('.gems-fx [data-effect-kind="'+kind+'"]');if(!group)return false;
  const board=group.closest('svg').getBoundingClientRect();
  return [...group.querySelectorAll('path,circle,rect,ellipse')].some(node=>{
    let opacity=1;for(let parent=node;parent&&parent!==group.parentElement;parent=parent.parentElement){
      const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden')return false;opacity*=Number(style.opacity);
    }
    const box=node.getBoundingClientRect(),style=getComputedStyle(node);
    return opacity>.15&&(box.width>2||box.height>2)&&box.right>=board.left&&box.left<=board.right&&box.bottom>=board.top&&box.top<=board.bottom&&(style.fill!=='none'||style.stroke!=='none');
  });
}"""


def activate(page, action, touch=False):
    if action['type'] == 'booster':
        names = {'row': 'Row hammer', 'column': 'Column hammer', 'burst': 'Lotus blessing', 'shuffle': 'Fresh breeze'}
        button = page.get_by_role('button', name=names[action['kind']] + (' · 2 available' if action['kind'] in ['row', 'column'] else ' · 1 available'), exact=True)
        button.tap() if touch else button.click()
        if action['kind'] != 'shuffle':
            target = page.locator(f'[data-index="{action["target"]}"]')
            target.tap() if touch else target.click()
    else:
        for index in [action['a'], action['b']]:
            target = page.locator(f'[data-index="{index}"]')
            target.tap() if touch else target.click()


def run(base, output):
    checks, errors = [], []
    output.mkdir(parents=True, exist_ok=True)
    cases = ['row', 'column', 'burst', 'orb', 'lantern', 'bloom', 'tool-row', 'tool-column', 'tool-burst', 'tool-shuffle']
    specials = ['row', 'column', 'burst', 'orb', 'lantern']
    combos = [f'combo-{a}+{b}' for i,a in enumerate(specials) for b in specials[i:]]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        for width, height in [(390, 844), (768, 1024)]:
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True, reduced_motion='no-preference')
            page = context.new_page();page.on('pageerror', lambda error: errors.append(str(error)))
            page.clock.install()
            for scenario in cases + (combos if width == 390 else []):
                page.goto(base + '/games/3-gems')
                expect(page.get_by_role('gridcell')).to_have_count(64)
                fixture = page.evaluate(FIXTURE, scenario)
                page.reload();expect(page.get_by_role('gridcell')).to_have_count(64)
                watch(page)
                # Start paused, then play through the swap and into a real
                # impact. Assertions cannot accidentally advance into gravity.
                page.clock.pause_at((page.evaluate('Date.now()') + 50) / 1000)
                activate(page, fixture['action'], touch=True)
                grid = page.get_by_role('grid', name='Gem garden', exact=True)
                # Web Locks resolve outside the virtual clock. Advance small
                # steps so their callback can commit before timing the impact.
                for _ in range(20):
                    if grid.get_attribute('data-playback-phase') == 'clear':
                        break
                    page.clock.run_for(30)
                expect(grid).to_have_attribute('data-playback-phase', 'clear')
                page.clock.run_for(round(fixture['impactDuration'] * .35))
                expect(grid).to_have_attribute('aria-busy', 'true')
                kind = {'tool-row': 'hammer-row', 'tool-column': 'hammer-column', 'tool-burst': 'blessing', 'tool-shuffle': 'shuffle'}.get(scenario, fixture['kinds'][0])
                expect(page.locator(f'.gems-fx [data-effect-kind="{kind}"]').first).to_be_attached()
                # An attached SVG is insufficient: real animation must bring
                # painted shapes into view without forcing a screenshot pose.
                page.wait_for_function(VISIBLE_EFFECT, arg=kind, polling='raf', timeout=2000)
                fx = page.locator('.gems-fx')
                expect(fx).to_have_attribute('aria-hidden', 'true')
                assert fx.evaluate('node=>getComputedStyle(node).pointerEvents') == 'none'
                assert fx.evaluate('node=>{const a=node.getBoundingClientRect(),b=node.parentElement.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom}')
                if fixture.get('combo'):
                    expect(page.locator(f'[data-combo-kind="{fixture["combo"]}"]')).to_be_attached()
                    expect(page.locator('.gem-fx-fusion-title')).to_contain_text('2-LAYER POWER')
                if scenario == 'lantern':
                    expect(page.locator('[data-effect-kind="lantern"] [data-effect-target="0"]')).to_be_attached()
                    assert page.locator('animateMotion').first.evaluate('node=>Number.isFinite(node.getStartTime())')
                if scenario == 'tool-row':
                    expect(page.locator('[data-hit-material="wood"]')).to_have_count(1)
                    expect(page.locator('[data-hit-material="ice"]')).to_have_count(1)
                    expect(page.locator('[data-hit-material="chain"]')).to_have_count(1)
                # CSS animations pause only for the screenshot. The real game
                # playback timer and subsequent cascade frames continue normally.
                if width == 390:
                    fx.evaluate("""node=>{node.pauseAnimations();node.setCurrentTime(.3);for(const animation of node.getAnimations({subtree:true})){animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)*.42}}""")
                    page.screenshot(path=str(output / (scenario + '.png')))
                # Extra input during a visual burst must not spend another tool.
                page.locator('[data-index="27"]').evaluate('node=>{node.click();node.click()}')
                fitted(page)
                page.clock.resume()
                expect(grid).to_have_attribute('aria-busy', 'false', timeout=7000)
                expect(page.locator('.gems-fx')).to_have_count(0)
                saved = page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)
                assert saved == fixture['expected'], (scenario, saved['revision'])
                assert 'effects' not in saved['play']
                history = page.evaluate('[...new Set(window.gemEffectHistory)]')
                assert set(fixture['kinds']) <= set(history), (scenario, fixture['kinds'], history)
                checks.append(f'{width}px {scenario}: effects, targets, cleanup, saved state and input guard')
            context.close()

        context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        page = context.new_page();page.on('pageerror', lambda error: errors.append(str(error)))
        page.clock.install()
        page.goto(base + '/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
        fixture = page.evaluate(FIXTURE, 'tool-row');page.reload();expect(page.get_by_role('gridcell')).to_have_count(64)
        watch(page);page.clock.pause_at((page.evaluate('Date.now()') + 50) / 1000);activate(page, fixture['action']);page.clock.run_for(30)
        expect(page.locator('.gems-fx')).to_have_attribute('data-reduced', 'true')
        assert page.locator('.gems-fx').evaluate('node=>node.getAnimations({subtree:true}).length') == 0
        assert page.locator('animateMotion').count() == 0
        page.wait_for_function(VISIBLE_EFFECT, arg='hammer-row', polling='raf')
        page.clock.resume()
        expect(page.get_by_role('grid')).to_have_attribute('aria-busy', 'false')
        expect(page.locator('.gems-fx')).to_have_count(0)
        assert 'hammer-row' in page.evaluate('window.gemEffectHistory')
        assert page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY) == fixture['expected']
        fitted(page);context.close()
        checks.append('Reduced motion shows steady special feedback without motion, with identical gameplay and inventory')
        browser.close()
    assert not errors, errors
    print(json.dumps({'checks': len(checks), 'phone_and_tablet': True, 'all_specials_and_tools': True, 'browser_errors': errors}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('--base-url', default='http://127.0.0.1:5173');parser.add_argument('--screenshots', default='test-results/gems-effects');args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
    run(args.base_url.rstrip('/'), Path(args.screenshots))
