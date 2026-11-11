"""Real card tables: full-screen surfaces, controls inside the rail, counts and phone fit.

Uses the local isolated guest API. No accounts, purchases or production data.
"""
import argparse, json
from urllib.parse import urlparse
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5173');args=parser.parse_args();base=args.base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1')
out = Path('/workspace/work/table-room-qa'); out.mkdir(parents=True, exist_ok=True)
sizes = [(390,844),(375,667),(768,1024),(1024,768),(844,390),(568,320)]
errors = []; checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-dev-shm-usage'])
    for game, variant, seats in [('rummy', v, n) for v in ['classic','r500'] for n in [2,3,4]] + [('spades',None,4)]:
        for w,h in sizes:
            ctx=browser.new_context(viewport={'width':w,'height':h},reduced_motion='reduce')
            page=ctx.new_page(); page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base+'/games/'+game)
            assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1'), (game, w,h,'setup scroll')
            if game=='rummy':
                page.get_by_label('Rummy variant',exact=True).select_option(variant)
                page.get_by_label('Players',exact=True).select_option(str(seats))
                with page.expect_response(lambda r:r.url.endswith('/api/rummy') and r.request.method=='POST') as created:
                    page.get_by_role('button',name='Start game',exact=True).click()
                room=created.value.json()
                expect(page.locator('.rummy-live-table')).to_be_visible()
                expect(page.get_by_text('Your turn',exact=True)).to_be_visible()
                expect(page.locator('.rummy-card-count')).to_have_count(seats)
                for player in room['players']:
                    expect(page.get_by_label(f"{player['name']}: {player['count']} cards remaining",exact=True)).to_be_visible()
                # A selected card creates a real status/selection state while retaining fit.
                page.locator('ol[aria-label="Your hand"] button').first.click(position={'x':5,'y':14})
            else:
                page.get_by_role('button',name='Deal me in',exact=True).click()
                expect(page.locator('.spades-live-table')).to_be_visible()
            metrics=page.evaluate('''() => {
                const stage=document.querySelector('.table-play-stage'), s=stage.getBoundingClientRect();
                const inside=e=>{const r=e.getBoundingClientRect();return !r.width||!r.height||(r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1)};
                return {left:s.left,right:innerWidth-s.right,top:s.top-document.querySelector('.game-play-header').getBoundingClientRect().bottom,bottom:innerHeight-s.bottom,
                    scrolling:document.documentElement.scrollHeight>innerHeight+1||document.documentElement.scrollWidth>innerWidth+1,
                    controlsFit:[...stage.querySelectorAll('.game-connection-bar,.table-round-bar,.rummy-player-list,.rummy-pile,.table-panel-buttons,.table-action-bar,.spades-bid-panel,ol[aria-label="Your hand"] button')].every(inside),
                    background:getComputedStyle(document.querySelector('.game-viewport')).backgroundImage,
                    surface:getComputedStyle(stage).backgroundImage};
            }''')
            assert not metrics['scrolling'] and metrics['controlsFit'],(game,variant,seats,w,h,metrics)
            assert max(metrics['left'],metrics['right'])<=6,(game,w,h,metrics)
            assert metrics['top']<=6 and metrics['bottom']<=6,(game,w,h,metrics)
            assert metrics['background']=='none' and 'url(' in metrics['surface'],metrics
            if game=='rummy':
                page.get_by_role('button',name='Recent plays',exact=True).click()
                expect(page.get_by_role('heading',name='Who played what',exact=True)).to_be_visible()
                page.get_by_role('button',name='Back to game',exact=True).click()
            if (w,h) in [(390,844),(568,320),(768,1024)] and (game=='spades' or seats==4):
                page.screenshot(path=str(out/f'{game}-{variant or "solo"}-{seats}-{w}x{h}.png'))
            checks.append({'game':game,'variant':variant,'seats':seats,'viewport':[w,h],**metrics})
            ctx.close()
    browser.close()
assert not errors,errors
(out/'report.json').write_text(json.dumps(checks,indent=2))
print(json.dumps({'card_room_checks':len(checks),'full_screen_table_surfaces':True,'controls_inside_table':True,'browser_errors':errors}))
