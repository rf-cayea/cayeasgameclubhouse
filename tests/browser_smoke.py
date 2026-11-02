"""Public UI smoke test; requires Python Playwright and system Chromium.

Run with: python3 tests/browser_smoke.py --base-url http://127.0.0.1:5173
No Supabase credentials or remote writes are used.
"""
import argparse
import json
import re
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1'), 'Smoke test only targets local servers.'

paths = {
    '/': "Cayea's Game Clubhouse",
    '/clubhouse': 'The Clubhouse',
    '/auth': 'Welcome back',
    '/games/faith-3': 'Faith 3 Tile Match',
    '/games/rummy': 'Rummy+',
    '/friends': 'Friends',
    '/store': 'Clubhouse Store',
    '/moderation': 'Moderation',
    '/page-that-does-not-exist': 'Page not found',
}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    errors = []
    checks = 0
    for width, height in [(1440, 1000), (390, 844)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        for path, heading in paths.items():
            response = page.goto(args.base_url + path)
            assert response and response.ok, f'Failed to serve {path}'
            expect(page.get_by_role('heading', name=heading, exact=True)).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Horizontal overflow at {path}, width {width}'
            checks += 1
        page.goto(args.base_url + '/')
        expect(page).to_have_title("Cayea's Game Clubhouse — Play, Earn Points, Unlock Rewards")
        expect(page.get_by_role('img', name='Decorative Faith 3 tile illustration')).to_be_visible()
        assert page.get_by_role('img').evaluate('(img) => img.complete && img.naturalWidth > 0')
        page.get_by_role('link', name='Clubhouse', exact=True).click()
        expect(page.get_by_role('heading', name='The Clubhouse', exact=True)).to_be_visible()
        expect(page).to_have_title("The Clubhouse — Chat, posts & friends | Cayea's Game Clubhouse")
        page.get_by_role('link', name='Sign in to join the conversation', exact=True).click()
        expect(page.get_by_role('button', name='Sign in', exact=True)).to_be_disabled()
        page.get_by_role('button', name='New here? Create a free account', exact=True).click()
        expect(page.get_by_role('heading', name='Join the Clubhouse', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Create a free account', exact=True)).to_be_disabled()
        page.goto(args.base_url + '/')
        page.get_by_role('link', name='Play Faith 3 Tile Match', exact=True).click()
        expect(page.get_by_role('heading', name='Faith 3 Tile Match', exact=True)).to_be_visible()
        tiles = page.get_by_role('button', name=re.compile(r'^Pick '))
        expect(tiles).to_have_count(18)
        symbol = re.match(r'Pick (.+) tile \d+', tiles.first.get_attribute('aria-label')).group(1)
        matches = page.get_by_role('button', name=re.compile(r'^Pick ' + re.escape(symbol) + r' tile '))
        for _ in range(3):
            matches.first.click()
        expect(tiles).to_have_count(15)
        expect(page.get_by_text('15 tiles left · 1 triples matched', exact=True)).to_be_visible()
        page.get_by_role('button', name='Undo · 2 left', exact=True).click()
        expect(tiles).to_have_count(16)
        expect(page.get_by_text('16 tiles left · 0 triples matched', exact=True)).to_be_visible()
        page.get_by_role('button', name='Restart level', exact=True).click()
        expect(tiles).to_have_count(18)
        page.get_by_role('button', name='Shuffle · 2 left', exact=True).click()
        expect(page.get_by_role('button', name='Shuffle · 1 left', exact=True)).to_be_enabled()
        expect(tiles).to_have_count(18)
        page.get_by_role('button', name='Restart level', exact=True).click()
        for _ in range(6):
            symbol = re.match(r'Pick (.+) tile \d+', tiles.first.get_attribute('aria-label')).group(1)
            matches = page.get_by_role('button', name=re.compile(r'^Pick ' + re.escape(symbol) + r' tile '))
            for _ in range(3):
                matches.first.click()
        expect(tiles).to_have_count(0)
        expect(page.get_by_text('Level cleared', exact=True)).to_be_visible()
        page.get_by_role('button', name='Next level', exact=True).click()
        expect(tiles).to_have_count(21)
        page.get_by_label('Level', exact=True).select_option('280')
        expect(page.get_by_role('heading', name=re.compile(r'^Level 280'))).to_be_visible()
        assert page.locator('button[aria-label^="Pick "]:disabled').count() > 0
        assert page.locator('button[aria-label^="Pick "]:enabled').count() > 0
        if width == 1440:
            page.goto(args.base_url + '/')
            page.screenshot(path='/tmp/clubhouse-home.png', full_page=True)
        context.close()
    browser.close()
    assert not errors, errors
    print(json.dumps({'route_viewport_checks': checks, 'navigation_auth_artwork_game_checks': 'passed', 'uncaught_browser_errors': errors}))
