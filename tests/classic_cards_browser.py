"""Local card gameplay and saved-session regressions. No real accounts or remote writes."""
import json
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:5173'
checks = []
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(390, 844), (360, 640), (844, 390), (820, 1180)]:
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.install()
        for game in ['hearts', 'crazy-eights']:
            page.goto(BASE + '/games/' + game)
            page.get_by_role('button', name='Deal me in', exact=True).click()
            if game == 'hearts':
                cards = page.locator('.classic-cards-hand-grid button')
                for i in range(3): cards.nth(i).click()
                expect(page.locator('.classic-cards-hand-grid [aria-pressed="true"]')).to_have_count(3)
                page.get_by_role('button', name='Pass selected cards', exact=True).click()
            assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1'), (game, width, height)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            main = page.locator('main')
            assert main.evaluate('(el) => el.scrollHeight <= el.clientHeight + 1'), (game, width, height, 'hidden controls')
            checks.append(f'{game}: playable viewport {width}x{height}')
            if width != 390: continue
            for step in range(300):
                if page.get_by_role('button', name='Deal next hand', exact=True).count():
                    checks.append('Hearts: entire hand, scoring, and next-hand button'); break
                if page.get_by_role('button', name='Play again', exact=True).count():
                    checks.append('Crazy Eights: complete match'); break
                legal = page.locator('.classic-cards-hand-grid button:enabled')
                if legal.count():
                    legal.first.click()
                    if page.get_by_role('dialog').count():
                        page.get_by_role('dialog').get_by_role('button', name='Clubs', exact=False).click()
                else:
                    draw = page.get_by_role('button', name='Draw a card', exact=True)
                    passturn = page.get_by_role('button', name='Pass turn', exact=True)
                    if draw.count() and draw.is_enabled(): draw.click()
                    elif passturn.count() and passturn.is_enabled(): passturn.click()
                page.clock.run_for(1800)
            else: raise AssertionError(f'{game}: match stalled')
        page.close()
    browser.close()
assert not errors, errors
print(json.dumps({'checks': checks, 'errors': errors}))
