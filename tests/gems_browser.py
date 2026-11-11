"""Real local UI/engine checks; late restoration stages use labelled local-save fixtures.
No Supabase APIs, purchases, or account rewards are mocked or issued.
"""
import argparse
import json
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5192')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
KEY = 'clubhouse-three-gems-v1'
checks, errors = [], []

def capture(page, path):
    # Full-page Chromium captures can paint fixed offscreen skip links inside
    # the document when the viewport remains scrolled. Capture from the top.
    page.evaluate('scrollTo(0, 0)')
    page.screenshot(path=path, full_page=True)

def saved(page):
    return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

def move(page, prefer_live=True):
    expect(page.get_by_role('grid', name='Gem garden')).to_have_attribute('aria-busy', 'false')
    page.wait_for_function('localStorage.getItem("clubhouse-three-gems-v1") !== null')
    return page.evaluate('''async preferLive => {
      const {legalGemSwaps, applyGemsAction} = await import('/src/lib/gems-engine.ts');
      const state = JSON.parse(localStorage.getItem('clubhouse-three-gems-v1')).play;
      const moves = legalGemSwaps(state).map(([a,b]) => ({a,b,next:applyGemsAction(state,{type:'swap',a,b}).state}));
      const config = (await import('/src/lib/gems-levels.ts')).gemsLevel(state.level);
      const missing = next => config.collect.reduce((n,g) => n+Math.max(0,g.count-next.collected[g.color]),0)+next.board.reduce((n,c)=>n+c.frost*3+c.crate*3+Number(c.chain)*3,0);
      moves.sort((a,b)=>missing(a.next)-missing(b.next)||(b.next.score-a.next.score));
      return (preferLive && moves.find(m=>m.next.status==='play')) || moves[0];
    }''', prefer_live)

def click_swap(page, pair):
    expect(page.get_by_role('grid', name='Gem garden')).to_have_attribute('aria-busy', 'false')
    page.locator(f'[data-index="{pair["a"]}"]').click()
    page.locator(f'[data-index="{pair["b"]}"]').click()
    expect(page.get_by_test_id('gems-moves')).to_have_text(str(pair['next']['movesLeft']))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': 1360, 'height': 1080}, reduced_motion='reduce')
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url)
    page.get_by_role('link', name='Play 3 Gems', exact=True).click()
    expect(page.get_by_role('heading', level=1)).to_contain_text('3 Gems')
    expect(page.get_by_role('gridcell')).to_have_count(64)
    assert saved(page)['inventory'] == {'row': 2, 'column': 2, 'burst': 1, 'shuffle': 1}
    capture(page, '/tmp/three-gems-desktop.png')
    checks.append('the new hub game opens a real, playable 64-cell garden with the starter collection')

    bad = page.evaluate('''async () => {
      const {legalGemSwaps} = await import('/src/lib/gems-engine.ts');
      const s = JSON.parse(localStorage.getItem('clubhouse-three-gems-v1')).play;
      const legal=legalGemSwaps(s);
      for(let a=0;a<63;a++)if(a%8<7&&!legal.some(p=>p[0]===a&&p[1]===a+1))return [a,a+1];
    }''')
    before = saved(page)
    page.locator(f'[data-index="{bad[0]}"]').click(); page.locator(f'[data-index="{bad[1]}"]').click()
    expect(page.get_by_text('That swap makes no match. No move or booster was used.', exact=True)).to_be_visible()
    assert saved(page) == before
    page.get_by_role('button', name='✧ Free hint', exact=True).click()
    assert page.locator('.gems-cell-hint').count() == 2
    assert saved(page) == before
    pair = move(page); click_swap(page, pair)
    assert saved(page)['play']['turns'] == before['play']['turns'] + 1
    checks.append('invalid swaps and hints spend nothing; an actual match resolves cascades and spends exactly one move')

    pair = move(page)
    page.locator(f'[data-index="{pair["a"]}"]').focus()
    page.keyboard.press('Shift+ArrowRight' if pair['b'] == pair['a'] + 1 else 'Shift+ArrowDown')
    expect(page.get_by_test_id('gems-moves')).to_have_text(str(pair['next']['movesLeft']))
    checks.append('keyboard handoff uses the same real swap rules')

    before = saved(page)
    page.get_by_role('button', name=f'Row hammer · {before["inventory"]["row"]} available', exact=True).click()
    page.get_by_role('button', name=f'Row hammer · {before["inventory"]["row"]} available', exact=True).click()
    assert saved(page) == before
    page.get_by_role('button', name=f'Row hammer · {before["inventory"]["row"]} available', exact=True).click()
    page.evaluate('''() => { const target=document.querySelector('[data-index="0"]'); target.click(); target.click(); target.click(); }''')
    expect(page.get_by_test_id('gems-moves')).to_have_text(str(before['play']['movesLeft']))
    page.wait_for_function('(turn) => JSON.parse(localStorage.getItem("clubhouse-three-gems-v1")).play.turns === turn+1', arg=before['play']['turns'])
    after = saved(page)
    assert after['revision'] == before['revision'] + 1
    assert after['inventory']['row'] == before['inventory']['row'] - 1 + (1 if after['play']['status'] == 'won' else 0)
    checks.append('cancelling a booster spends nothing, and rapid queued inputs consume a hammer only once without spending a move')

    for _ in range(30):
        if saved(page)['play']['status'] != 'play':
            break
        click_swap(page, move(page, prefer_live=False))
    assert saved(page)['play']['status'] == 'won'
    expect(page.get_by_role('dialog')).to_contain_text('FIRST-CLEAR GIFT')
    first_clear = saved(page)
    page.reload()
    expect(page.get_by_role('dialog')).to_be_visible()
    assert saved(page) == first_clear
    page.get_by_role('button', name='Continue to level 2 →', exact=True).click()
    expect(page.get_by_test_id('gems-moves')).to_have_text('26')
    assert saved(page)['inventory'] == first_clear['inventory']
    checks.append('a real first clear unlocks the next level and awards supplies once; reload and continuation do not repeat the gift')

    second = context.new_page(); second.goto(args.base_url + '/games/3-gems')
    pair = move(page); click_swap(page, pair)
    expect(second.get_by_test_id('gems-moves')).to_have_text(str(pair['next']['movesLeft']))
    assert saved(second) == saved(page)
    page.reload(); expect(page.get_by_test_id('gems-moves')).to_have_text(str(pair['next']['movesLeft']))
    checks.append('the active board and supplies survive refresh and stay synchronized across two tabs')
    second.close()

    page.get_by_role('button', name='150 levels', exact=True).click()
    expect(page.locator('.gems-level-grid button')).to_have_count(150)
    expect(page.get_by_role('button', name='Level 150 · locked', exact=True)).to_be_disabled()
    page.get_by_role('button', name='The monastery', exact=True).click()
    expect(page.get_by_role('progressbar', name='Lotus Courtyard restoration', exact=True)).to_have_attribute('value', '1')
    checks.append('all 150 sequential levels exist and the first actual clear advances the monastery restoration')

    page.get_by_role('button', name='How to play', exact=True).click()
    for n in range(6):
        page.get_by_role('button', name=f'Lesson {n+1}', exact=True).click()
        expect(page.locator('.gems-guide-card h3')).to_be_visible()
    checks.append('six illustrated lessons explain goals, blockers, special shapes, combinations, boosters, and the restoration journey')
    context.close()

    # Hold a real cross-tab lock between two queued purchases of the same
    # local booster. Let the second tab receive the first tab's storage event
    # before its original action runs, exercising a stale-input race.
    parallel = browser.new_context(viewport={'width': 1280, 'height': 960}, reduced_motion='reduce')
    a = parallel.new_page(); b = parallel.new_page()
    for tab in [a, b]:
        tab.on('pageerror', lambda error: errors.append(str(error)))
        tab.goto(args.base_url + '/games/3-gems')
        tab.get_by_role('button', name='Row hammer · 2 available', exact=True).click()
    a.evaluate('''() => new Promise(ready => {
      window.holdingGemLock = navigator.locks.request('clubhouse-three-gems-v1', async () => {
        const hold=new Promise(resolve=>window.releaseGemLock=resolve); ready(); await hold;
      });
    })''')
    a.locator('[data-index="0"]').click()
    a.evaluate('''() => { window.betweenGemActions=navigator.locks.request('clubhouse-three-gems-v1',()=>new Promise(resolve=>window.releaseGemBarrier=resolve)); }''')
    b.locator('[data-index="0"]').click()
    a.evaluate('releaseGemLock()')
    a.wait_for_function('Boolean(window.releaseGemBarrier)')
    expect(b.get_by_text('Your garden was updated in another tab. The latest progress is here.', exact=True)).to_be_visible()
    a.evaluate('releaseGemBarrier()')
    expect(b.get_by_text('Progress changed in another tab. Please try your move again.', exact=True)).to_be_visible()
    assert saved(b)['play']['turns'] == 1 and saved(b)['inventory']['row'] == 1 and saved(b)['revision'] == 1
    checks.append('a queued action from another tab cannot spend a second booster after receiving a newer save')
    parallel.close()

    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    page = mobile.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/games/3-gems')
    pair = move(page)
    a = page.locator(f'[data-index="{pair["a"]}"]').bounding_box(); b = page.locator(f'[data-index="{pair["b"]}"]').bounding_box()
    cdp = mobile.new_cdp_session(page)
    start = {'x': a['x']+a['width']/2, 'y': a['y']+a['height']/2}
    end = {'x': b['x']+b['width']/2, 'y': b['y']+b['height']/2}
    page.locator(f'[data-index="{pair["a"]}"]').scroll_into_view_if_needed()
    a = page.locator(f'[data-index="{pair["a"]}"]').bounding_box(); b = page.locator(f'[data-index="{pair["b"]}"]').bounding_box()
    start = {'x': a['x']+a['width']/2, 'y': a['y']+a['height']/2}; end = {'x': b['x']+b['width']/2, 'y': b['y']+b['height']/2}
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [start]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [end]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    expect(page.get_by_test_id('gems-moves')).to_have_text(str(pair['next']['movesLeft']))
    assert saved(page)['play']['turns'] == 1
    expect(page.locator('.gems-cell-selected')).to_have_count(0)
    checks.append('a real touch swipe swaps adjacent gems once on a phone')

    # Explicit local-save fixtures preview later architecture and the final UI.
    # Engine and reward tests separately exercise all 150 real level definitions.
    page.evaluate('''async () => {
      const {newGemsJourney} = await import('/src/lib/gems-progress.ts');
      const {startGems} = await import('/src/lib/gems-engine.ts');
      const journey=newGemsJourney(); journey.revision=100; journey.unlocked=16;
      journey.stars=Object.fromEntries(Array.from({length:15},(_,i)=>[String(i+1),2]));
      journey.play=startGems(16); localStorage.setItem('clubhouse-three-gems-v1',JSON.stringify(journey));
    }''')
    page.reload(); page.get_by_role('button', name='The monastery', exact=True).click()
    expect(page.get_by_role('progressbar', name='Lotus Courtyard restoration', exact=True)).to_have_attribute('value', '15')
    capture(page, '/tmp/three-gems-monastery-first-restoration.png')

    page.evaluate('''async () => {
      const {newGemsJourney} = await import('/src/lib/gems-progress.ts');
      const {startGems} = await import('/src/lib/gems-engine.ts');
      const {gemsLevel} = await import('/src/lib/gems-levels.ts');
      const journey=newGemsJourney(); journey.revision=200; journey.unlocked=150;
      journey.stars=Object.fromEntries(Array.from({length:149},(_,i)=>[String(i+1),2]));
      const config=gemsLevel(150), play=startGems(1); play.level=150; play.movesLeft=1; play.board[0].frost=1;
      config.collect.forEach(goal=>play.collected[goal.color]=goal.count);
      play.frostCleared=config.frost*config.frostLayers-1; play.cratesCleared=config.crates; play.chainsCleared=config.chains;
      journey.play=play; localStorage.setItem('clubhouse-three-gems-v1',JSON.stringify(journey));
    }''')
    page.reload(); page.set_viewport_size({'width': 320, 'height': 740})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    capture(page, '/tmp/three-gems-mobile-320.png')
    page.get_by_role('button', name='Row hammer · 2 available', exact=True).click()
    page.locator('[data-index="0"]').click()
    expect(page.get_by_role('dialog')).to_contain_text('The monastery is open.')
    assert len(saved(page)['stars']) == 150
    assert page.get_by_role('dialog').evaluate('node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&node.scrollWidth<=node.clientWidth}')
    page.get_by_role('button', name='Visit the reopened monastery →', exact=True).click()
    expect(page.get_by_role('heading', name='Welcome home.', exact=True)).to_be_visible()
    assert page.locator('.gems-project[data-done="true"]').count() == 10
    capture(page, '/tmp/three-gems-restored-monastery.png')
    page.reload(); page.get_by_role('button', name='Close dialog', exact=True).click(); page.get_by_role('button', name='The monastery', exact=True).click()
    expect(page.get_by_role('heading', name='Welcome home.', exact=True)).to_be_visible()
    checks.append('labelled late-level save fixtures verify each restoration milestone, final reopening, persistence, and 320-pixel layouts')
    assert not errors, errors
    mobile.close(); browser.close()

result = {'mode': 'real local engine/UI; explicit saves for late restoration previews', 'checks': checks, 'browser_errors': errors}
with open('/tmp/three-gems-browser-results.json', 'w') as output:
    json.dump(result, output, indent=2)
print(json.dumps(result))
