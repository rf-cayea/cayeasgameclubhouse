"""Regression checks for animated keyboard input, browser capabilities, and stale tabs.
Uses the real local game; one near-win save fixture makes a two-tab dialog race deterministic.
"""
import argparse
import json
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('127.0.0.1', 'localhost')
URL = args.base_url + '/games/3-gems'
KEY = 'clubhouse-three-gems-v1'
checks, errors = [], []

def open_game(context):
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    expect(page.get_by_role('gridcell')).to_have_count(64)
    return page

def live_move(page):
    page.wait_for_function('Boolean(localStorage.getItem("clubhouse-three-gems-v1"))')
    return page.evaluate('''async () => {
      const {legalGemSwaps,applyGemsAction}=await import('/src/lib/gems-engine.ts');
      const state=JSON.parse(localStorage.getItem('clubhouse-three-gems-v1')).play;
      return legalGemSwaps(state).find(([a,b])=>applyGemsAction(state,{type:'swap',a,b}).state.status==='play');
    }''')

def saved(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)

DENY_LOCK = """const manager=navigator.locks, original=manager.request.bind(manager);
Object.defineProperty(manager,'request',{configurable:true,value:(name,...rest)=>{
  if(name!=='clubhouse-three-gems-v1')return original(name,...rest);
  window.gemDeniedLocks=(window.gemDeniedLocks||0)+1;
  return Promise.reject(new DOMException('Web Locks are blocked in this context.','SecurityError'));
}});"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = browser.new_context(reduced_motion='no-preference')
    page = open_game(context)
    for turn in range(3):
        a, b = live_move(page)
        source = page.locator(f'[data-index="{a}"]')
        source.focus()
        page.keyboard.press('Shift+ArrowRight' if b == a + 1 else 'Shift+ArrowDown')
        expect(page.get_by_role('grid')).to_have_attribute('aria-busy', 'true')
        # ARIA disables game actions while retaining the keyboard focus target.
        expect(source).to_have_attribute('aria-disabled', 'true')
        source.evaluate('node=>{node.click();node.click();}')
        expect(page.get_by_role('grid')).to_have_attribute('aria-busy', 'false')
        expect(source).to_be_focused()
        assert saved(page)['play']['turns'] == turn + 1
        assert saved(page)['play']['movesLeft'] == 25 - turn
        step = 1 if a % 8 < 7 else -1
        page.keyboard.press('ArrowRight' if step == 1 else 'ArrowLeft')
        expect(page.locator(f'[data-index="{a + step}"]')).to_be_focused()
    checks.append('three animated keyboard swaps retain focus and ignore extra clicks during cascades')
    context.close()

    context = browser.new_context(reduced_motion='reduce')
    context.add_init_script(DENY_LOCK)
    page = open_game(context)
    for _ in range(2):
        a, b = live_move(page)
        page.locator(f'[data-index="{a}"]').click(); page.locator(f'[data-index="{b}"]').click()
        expect(page.get_by_role('grid')).to_have_attribute('aria-busy', 'false')
    assert saved(page)['play']['turns'] == 2 and saved(page)['play']['movesLeft'] == 24
    assert page.evaluate('window.gemDeniedLocks') == 1
    before = saved(page)
    page.reload(); expect(page.get_by_test_id('gems-moves')).to_have_text('24')
    assert saved(page) == before
    checks.append('denied Web Locks fall back to saved play and are not retried every turn')
    context.close()

    context = browser.new_context(reduced_motion='reduce')
    context.add_init_script("Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})")
    page = open_game(context)
    a, b = live_move(page)
    page.locator(f'[data-index="{a}"]').click(); page.locator(f'[data-index="{b}"]').click()
    expect(page.get_by_test_id('gems-moves')).to_have_text('25')
    assert saved(page)['play']['turns'] == 1
    checks.append('browsers without the locking API can still play and save')
    context.close()

    context = browser.new_context(reduced_motion='reduce')
    context.add_init_script(DENY_LOCK + "Object.defineProperty(Storage.prototype,'setItem',{configurable:true,value:()=>{throw new DOMException('Storage quota exceeded','QuotaExceededError')}})")
    page = open_game(context)
    for moves in [25, 24]:
        page.get_by_role('button', name='✧ Free hint', exact=True).click()
        pair = page.locator('.gems-cell-hint').evaluate_all('cells=>cells.map(c=>c.dataset.index)')
        assert len(pair) == 2
        for i in pair:
            page.locator(f'[data-index="{i}"]').click()
        expect(page.get_by_test_id('gems-moves')).to_have_text(str(moves))
    expect(page.get_by_text('◈ Progress kept for this visit', exact=True)).to_be_visible()
    assert page.evaluate('(key)=>localStorage.getItem(key)', KEY) is None
    checks.append('full storage plus denied locks keeps consecutive moves playable for the current visit')
    context.close()

    context = browser.new_context(reduced_motion='reduce')
    a = open_game(context); b = open_game(context)
    b.get_by_role('button', name='✧ Free hint', exact=True).click()
    assert b.locator('.gems-cell-hint').count() == 2
    a.get_by_role('button', name='Row hammer · 2 available', exact=True).click(); a.locator('[data-index="0"]').click()
    expect(b.get_by_text('Your garden was updated in another tab. The latest progress is here.', exact=True)).to_be_visible()
    expect(b.locator('.gems-cell-hint')).to_have_count(0)
    b.get_by_role('gridcell').nth(1).click()
    expect(b.locator('[aria-selected="true"]')).to_have_count(1)
    a.get_by_role('button', name='Row hammer · 1 available', exact=True).click(); a.locator('[data-index="0"]').click()
    expect(b.locator('[aria-selected="true"]')).to_have_count(0)
    checks.append('another tab changing the board clears obsolete hints and gem selections')
    context.close()

    context = browser.new_context(reduced_motion='reduce')
    a = open_game(context)
    a.evaluate('''async()=>{
      const {newGemsJourney}=await import('/src/lib/gems-progress.ts');
      const journey=newGemsJourney();journey.revision=1;journey.play.turns=1;
      journey.play.movesLeft=25;journey.play.collected[0]=9;
      localStorage.setItem('clubhouse-three-gems-v1',JSON.stringify(journey));
    }''')
    a.reload(); expect(a.get_by_test_id('gems-moves')).to_have_text('25')
    b = open_game(context)
    b.get_by_role('button', name='↻ Restart', exact=True).click()
    expect(b.get_by_role('dialog')).to_contain_text('Begin this level again?')
    a.get_by_role('button', name='Row hammer · 2 available', exact=True).click(); a.locator('[data-index="0"]').click()
    expect(a.get_by_role('dialog')).to_contain_text('FIRST-CLEAR GIFT')
    expect(b.get_by_role('dialog')).to_have_count(1)
    expect(b.get_by_role('dialog')).to_contain_text('FIRST-CLEAR GIFT')
    expect(b.get_by_role('button', name='Start level 1', exact=True)).to_have_count(0)
    assert saved(a) == saved(b) and saved(b)['unlocked'] == 2
    checks.append('a cross-tab win replaces a stale restart prompt with a single results dialog')
    context.close()
    assert not errors, errors
    browser.close()

print(json.dumps({'checks': checks, 'browser_errors': errors}))
