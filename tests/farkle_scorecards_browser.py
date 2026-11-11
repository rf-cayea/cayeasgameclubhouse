"""Display fixtures verify every player's category/bonus columns at 2–4 seats; no player data is changed."""
import argparse, json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(); parser.add_argument('--base-url', default='http://127.0.0.1:5180')
base = parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost', '127.0.0.1')
out = Path('/workspace/work/farkle-scorecards-qa'); out.mkdir(exist_ok=True)
sizes = [(320, 568), (375, 667), (390, 844), (768, 1024), (1024, 768), (568, 320)]
names = ['Ava', 'Blake', 'Cleo', 'Drew']
cards = [
    {'scores': {'ones': 3, 'twos': 6, 'threes': 9, 'fours': 12, 'fives': 15, 'sixes': 18, 'small-straight': 30, 'large-straight': 0}, 'fiveKindBonuses': 0},
    {'scores': {'chance': 21}, 'fiveKindBonuses': 0},
    {'scores': {'small-straight': 0, 'large-straight': 40, 'five-kind': 50}, 'fiveKindBonuses': 0},
    {'scores': {'ones': 2, 'full-house': 25, 'small-straight': 30}, 'fiveKindBonuses': 0},
]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    errors, checks = [], []
    for seats in [2, 3, 4]:
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        ctx.add_init_script('sessionStorage.setItem("clubhouse-five-dice:guest:room","ABCDEF12");localStorage.setItem("clubhouse-farkle-audio-v1",JSON.stringify({muted:true}));')
        players = [{'id': f'p{i}', 'name': names[i], 'bot': False, 'ready': True, 'you': i == 1, 'occupied': True} for i in range(seats)]
        fixture = {'code': 'ABCDEF12', 'revision': 1, 'owner': False, 'status': 'playing', 'mySeat': 1, 'players': players, 'options': {'mode': 'online', 'seats': seats, 'level': 'normal'}, 'reward': {'status': 'ineligible', 'tier': None, 'amount': 0, 'message': 'Local display fixture'}, 'state': {'players': [{'id': item['id'], 'name': item['name'], 'bot': False} for item in players], 'turn': 1, 'round': 4, 'rolls': 1, 'dice': [1, 2, 3, 4, 5], 'held': [False] * 5, 'cards': cards[:seats], 'phase': 'play', 'winners': [], 'log': [], 'activity': [], 'actionSequence': 0}}
        ctx.route('**/api/five-dice/room/ABCDEF12', lambda route, request, value=fixture: route.fulfill(status=200, content_type='application/json', body=json.dumps(value)))
        ctx.route('**/api/five-dice/room/ABCDEF12/events', lambda route, request, value=fixture: route.fulfill(status=200, content_type='text/event-stream', body='data: ' + json.dumps(value) + '\n\n'))
        page = ctx.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/games/quintsee'); expect(page.locator('.fd-live')).to_be_visible()
        for width, height in sizes:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1')
            expect(page.locator('.fd-category')).to_have_count(13)
            for label, key, preview in [('Small straight', 'small-straight', 30), ('Large straight', 'large-straight', 40)]:
                row = page.get_by_role('button', name=label + ':', exact=False)
                expect(row).to_be_visible(); expect(row.locator('.fd-category-label')).to_have_text(label)
                expect(row.locator('.fd-category-value')).to_have_count(seats)
                for seat in range(seats):
                    value = cards[seat]['scores'].get(key, '+' + str(preview) if seat == 1 else '—')
                    expect(row.locator(f'.fd-category-value[data-player="{seat}"]')).to_have_text(str(value))
                assert row.locator('.fd-category-label').evaluate('''e=>{const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect(),row=e.closest('.fd-category').getBoundingClientRect(),values=e.parentElement.querySelector('.fd-category-scores').getBoundingClientRect();return r.right<=values.left+1&&r.bottom<=row.bottom+1&&r.top>=row.top-1;}'''), (seats, width, height, label, 'label clipped')
            for row in page.locator('.fd-category').all(): expect(row.locator('.fd-category-value')).to_have_count(seats)
            assert page.locator('.fd-score-section').evaluate_all('''sections=>sections.every(section=>{const heads=[...section.querySelectorAll('.fd-score-column-labels>span')],values=[...section.querySelector('.fd-category').querySelectorAll('.fd-category-value')];return heads.every((head,i)=>{const a=head.getBoundingClientRect(),b=values[i].getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<2;});})'''), (seats, width, height, 'column alignment')
            expect(page.locator('.fd-score-bonus .fd-category-value[data-player="0"]')).to_have_text('35')
            expect(page.locator('.fd-score-column-labels').first.locator('[data-you=true]')).to_have_text('YOU')
            assert page.locator('.fd-category').evaluate_all('(rows)=>rows.every(e=>e.getBoundingClientRect().bottom<=innerHeight+1)')
            page.screenshot(path=str(out / f'{seats}-players-{width}x{height}.png'))
            checks.append({'players': seats, 'viewport': f'{width}x{height}', 'all_category_scores_visible': True, 'straight_labels': 'full text', 'upper_bonuses': 'visible'})
        page.get_by_role('button', name='Small straight:', exact=False).click()
        expect(page.locator('.fd-score-confirm').get_by_role('button', name='Score 30', exact=True)).to_be_enabled()
        page.get_by_role('button', name='Large straight:', exact=False).click()
        expect(page.locator('.fd-score-confirm').get_by_role('button', name='Score 40', exact=True)).to_be_enabled()
        ctx.close()
    browser.close()
    assert not errors, errors
    report = {'display_checks': len(checks), 'checks': checks, 'straight_selection': '30 and 40 point choices available', 'browser_errors': errors, 'production_data_changed': False}
    (out / 'report.json').write_text(json.dumps(report, indent=2)); print(json.dumps(report))
