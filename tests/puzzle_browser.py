"""Real member puzzle proof→wallet→achievement flow using an isolated Node API.

Run tests/puzzle-browser-server.ts on8788 and fictional-config Vite on5174.
Only Supabase identity is intercepted; puzzle/economy/social requests reach the
real local service with separate fictional identities. No production writes.
"""
import json
import re
import subprocess
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from social_browser import SocialFixture, ADMIN, MEMBER

BASE = 'http://127.0.0.1:5174'
checks, errors, runs = [], [], {}
@contextmanager
def fixture_server():
    process = subprocess.Popen(['node', '--import', 'tsx', 'tests/puzzle-browser-server.ts'], cwd=Path(__file__).resolve().parent.parent, stdout=subprocess.PIPE, text=True)
    try:
        assert 'ready' in process.stdout.readline(), 'Isolated puzzle API did not start'
        yield
    finally:
        process.terminate()
        try:
            process.wait(timeout=6)
        except subprocess.TimeoutExpired:
            process.kill();process.wait()

with fixture_server(), sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    fixture = SocialFixture()
    context = fixture.context(browser, ADMIN, width=390)

    def api(route):
        actor = fixture.actor(route)
        headers = {key: value for key, value in route.request.headers.items() if key not in ['host', 'content-length', 'authorization']}
        if actor:
            headers['authorization'] = 'Bearer ' + actor
        response = route.fetch(url='http://127.0.0.1:8788' + urlparse(route.request.url).path, headers=headers)
        if urlparse(route.request.url).path == '/api/puzzles' and response.ok:
            value = response.json()
            if 'runId' in value:
                runs[value['game']] = value
        route.fulfill(response=response)

    context.route('**/api/**', api)
    page = context.new_page()
    page.emulate_media(reduced_motion='reduce')
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE + '/games/faith-3')
    expect(page.locator('.faith-practice-note')).to_contain_text('Member run')
    solution = page.evaluate("""async()=>{const {generateLevelPlan}=await import('/src/lib/game.ts');return generateLevelPlan(1).solution;}""")
    for tile in solution:
        page.get_by_role('button', name=re.compile(rf' tile {tile}$')).click()
    expect(page.locator('.faith-practice-note')).to_contain_text('+25 Faith 3 points saved')
    page.goto(BASE + '/rewards')
    expect(page.get_by_test_id('faith-balance')).to_have_text('25')
    badge = page.locator('[data-achievement-id="faith-clear-1"]')
    badge.get_by_role('button', name='Claim First Light', exact=True).click()
    expect(page.get_by_test_id('faith-balance')).to_have_text('75')
    page.reload()
    expect(page.get_by_test_id('faith-balance')).to_have_text('75')
    expect(page.locator('[data-achievement-id="faith-clear-1"]')).to_contain_text('Badge earned')
    checks.append('Real Faith3 clicks generate a legal proof, credit25points, unlocklevel2 and claim50pointbadge once across reload')

    page.emulate_media(reduced_motion='no-preference')
    page.goto(BASE + '/games/3-gems')
    expect(page.locator('.gems-notice')).to_contain_text('Member run')
    solver = """async attempt=>{const {startGems,legalGemSwaps,applyGemsAction}=await import('/src/lib/gems-engine.ts');let state=startGems(1,attempt),actions=[];while(state.status==='play'){const next=legalGemSwaps(state).map(([a,b])=>{const action={type:'swap',a,b};return {action,state:applyGemsAction(state,action).state};}).sort((a,b)=>b.state.collected[0]-a.state.collected[0]||b.state.score-a.state.score)[0];if(!next)break;actions.push(next.action);state=next.state;}return {won:state.status==='won',actions};}"""
    plan = page.evaluate(solver, runs['3-gems']['attempt'])
    for _ in range(12):
        if plan['won']:
            break
        page.get_by_role('button', name='↻ Restart', exact=True).click()
        expect(page.locator('.gems-notice')).to_contain_text('Member run')
        plan = page.evaluate(solver, runs['3-gems']['attempt'])
    assert plan['won'], 'Level1 greedy fixture solver did not find a winning run'
    for index, action in enumerate(plan['actions']):
        expect(page.get_by_role('grid', name='Gem garden')).to_have_attribute('aria-busy', 'false')
        page.locator(f'.gems-cell[data-index="{action["a"]}"]').click()
        page.locator(f'.gems-cell[data-index="{action["b"]}"]').click()
        if index == 0:
            expect(page.get_by_role('grid', name='Gem garden')).to_have_attribute('aria-busy', 'true')
            expect(page.locator('.gems-fx')).to_be_visible()
            expect(page.get_by_role('grid', name='Gem garden')).to_have_attribute('aria-busy', 'false', timeout=8000)
            page.emulate_media(reduced_motion='reduce')
    expect(page.locator('.gems-save-note')).to_contain_text('+30 Gem points saved')
    page.get_by_role('button', name=re.compile('Visit the monastery ·')).click()
    expect(page.get_by_test_id('monastery-stars')).to_have_text('1')
    page.get_by_role('button', name='Complete Clear the fallen stones and weeds for 1 restoration star', exact=True).click()
    expect(page.get_by_test_id('monastery-stars')).to_have_text('0')
    page.goto(BASE + '/rewards')
    expect(page.get_by_test_id('gems-balance')).to_have_text('30')
    page.get_by_role('combobox', name='Conversion game').select_option('3-gems')
    page.get_by_role('spinbutton', name='Points to convert').fill('26')
    page.get_by_role('button', name='Convert to Cash', exact=True).click()
    page.get_by_role('button', name='Confirm conversion', exact=True).click()
    expect(page.get_by_test_id('gems-balance')).to_have_text('4')
    expect(page.get_by_test_id('cash-balance')).to_have_text('28')
    page.goto(BASE + '/profile')
    expect(page.get_by_test_id('profile-cash-balance')).to_have_text('28')
    expect(page.get_by_text('First Light', exact=True)).to_be_visible()
    checks.append('Real Gems swaps verifyandcredit30Gempoints, convert26to20Cash plus the8Cashachievementbonus and display the preservedwallet andearnedbadge onprofile')
    assert not errors, errors
    context.close()
    browser.close()
print(json.dumps({'checks': checks, 'browser_errors': errors, 'production_accounts_changed': False}))
