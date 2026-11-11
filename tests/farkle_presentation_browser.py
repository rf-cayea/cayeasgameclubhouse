"""Exercise committed move playback and clear held-die feedback against an isolated local API."""
import argparse
import json
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5180')
args = parser.parse_args()
base = args.base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost', '127.0.0.1')
out = Path('/workspace/work/farkle-presentation-qa')
out.mkdir(exist_ok=True)

def score(page, label):
    choice = page.get_by_role('button', name=label + ':', exact=False)
    expect(choice).to_be_enabled()
    choice.click()
    page.locator('.fd-score-confirm').get_by_role('button', name='Score ', exact=False).click()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    errors, posted, observed = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: posted.append(request.post_data_json) if request.method == 'POST' and request.url.endswith('/api/five-dice') else None)
    page.goto(base + '/games/quintsee')
    page.get_by_label('Quintsee player name', exact=True).fill('Motion Tester')
    page.get_by_label('Quintsee difficulty', exact=True).select_option('normal')
    page.get_by_role('button', name='Start a match', exact=True).click()
    expect(page.locator('.fd-live')).to_be_visible()
    page.get_by_role('button', name='Roll five dice', exact=True).click()
    first = page.locator('.fd-die').first
    expect(first).to_be_enabled()
    before = first.locator('.fd-die-visual').bounding_box()
    first.click()
    expect(first).to_have_attribute('aria-pressed', 'true')
    page.wait_for_timeout(220)
    after = first.locator('.fd-die-visual').bounding_box()
    assert before['y'] - after['y'] >= 4
    assert first.locator('.fd-cube-face rect').first.get_attribute('fill') == '#f6d47e'
    expect(first.locator('.fd-hold-label')).to_contain_text('HELD')
    expect(first.locator('.fd-hold-label svg')).to_be_visible()
    held_label = first.get_attribute('aria-label')
    page.screenshot(path=str(out / 'held-gold.png'))
    page.get_by_role('button', name='Roll again', exact=False).click()
    expect(page.locator('.fd-die[data-rolling=true]')).to_have_count(4)
    expect(first).to_have_attribute('data-rolling', 'false')
    assert page.locator('.fd-die[data-rolling=true] .fd-die-cube').first.evaluate('(e)=>e.getAnimations().some(a=>a.playState==="running")')
    page.wait_for_timeout(180)
    page.screenshot(path=str(out / 'smooth-roll.png'))
    expect(first).to_be_enabled()
    assert first.get_attribute('aria-label') == held_label
    # Release a die kept from the first roll while roll-two playback is visible.
    # The animated cube must not swallow the tap or freeze its old held state.
    visual = first.locator('.fd-die-visual').bounding_box()
    page.mouse.click(visual['x'] + visual['width'] / 2, visual['y'] + visual['height'] / 2)
    expect(first).to_have_attribute('aria-pressed', 'false')
    expect(first.locator('.fd-hold-label')).to_have_text('HOLD')
    code = page.evaluate('sessionStorage.getItem("clubhouse-five-dice:guest:room")')
    live = context.request.get(base + '/api/five-dice/room/' + code).json()
    for index, value in enumerate(live['state']['dice']):
        assert page.locator('.fd-die').nth(index).get_attribute('aria-label').startswith(f'Die {index + 1}: {value}')
    score(page, 'Chance')
    expect(page.get_by_role('button', name='Skip opponent animation', exact=True)).to_be_visible()
    expect(page.locator('.fd-round-bar')).to_contain_text('Normal Computer’s turn')
    expect(page.locator('.fd-round-bar')).to_contain_text('ROUND 1 / 13')
    page.screenshot(path=str(out / 'opponent-turn.png'))
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        observed.append(page.locator('.fd-turn-feed').inner_text())
        if page.get_by_role('button', name='Skip opponent animation', exact=True).count() == 0:
            break
        page.wait_for_timeout(90)
    expect(page.get_by_role('button', name='Roll five dice', exact=True)).to_be_enabled()
    result = context.request.get(base + '/api/five-dice/room/' + code).json()
    opponent = [event for event in result['state']['activity'] if event['seat'] == 1]
    assert any('Roll 1 of 3' in text for text in observed), observed
    if any(event['kind'] == 'hold' for event in opponent):
        assert any('Holding' in text or 'Released' in text for text in observed), observed
    chosen = opponent[-1]
    assert chosen['kind'] == 'score'
    assert any(f'+{chosen["score"]}' in text for text in observed), observed
    expect(page.locator('.fd-player').nth(1).locator('small')).to_contain_text(f'+{chosen["score"]}')
    page.get_by_role('button', name='Moves', exact=True).click()
    expect(page.get_by_role('heading', name='Recent moves', exact=True)).to_be_visible()
    expect(page.locator('.fd-move-history li[data-kind=score]').filter(has_text='Normal Computer')).to_be_visible()
    page.screenshot(path=str(out / 'moves-history.png'))
    page.get_by_role('button', name='Back to game', exact=True).click()
    page.get_by_role('button', name='Roll five dice', exact=True).click()
    score(page, 'Ones')
    skip = page.get_by_role('button', name='Skip opponent animation', exact=True)
    expect(skip).to_be_visible()
    before_skip = context.request.get(base + '/api/five-dice/room/' + code).json()
    command_count = len(posted)
    skip.click()
    expect(page.get_by_role('button', name='Roll five dice', exact=True)).to_be_enabled()
    after_skip = context.request.get(base + '/api/five-dice/room/' + code).json()
    assert before_skip['revision'] == after_skip['revision']
    assert before_skip['state'] == after_skip['state']
    assert len(posted) == command_count
    for width, height in [(375, 667), (390, 844), (768, 1024), (1024, 768), (568, 320)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1')
        assert page.locator('.fd-category').count() == 13
        assert page.locator('.fd-category').evaluate_all('(items)=>items.every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth})')
        assert page.get_by_role('button', name='Moves', exact=True).evaluate('(e)=>e.getBoundingClientRect().right<=innerWidth')
        page.screenshot(path=str(out / f'fit-{width}x{height}.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.emulate_media(reduced_motion='reduce')
    page.get_by_role('button', name='Roll five dice', exact=True).click()
    expect(page.locator('.fd-die[data-rolling=true]')).to_have_count(5)
    assert page.locator('.fd-die-cube').evaluate_all('(items)=>items.every(e=>getComputedStyle(e).animationName==="none")')
    assert not errors, errors
    print(json.dumps({'held_dice': 'gold, lifted, lock badge, unchanged on reroll', 'rolling': '3D animation with actual server faces', 'opponent_playback': 'rolls, holds, score observed', 'skip': 'no game commands or state changes', 'moves_panel': 'passed', 'viewports': 5, 'reduced_motion': 'passed', 'browser_errors': errors}))
    context.close()
    browser.close()
