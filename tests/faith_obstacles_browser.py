"""Rendered obstacle progression and a complete final-level replay, on local UI."""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
parser.add_argument('--screenshots', default='test-results/faith-obstacles')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
root = Path(__file__).resolve().parents[1]
plan = json.loads(subprocess.check_output(['node', '--import', 'tsx', '--input-type=module', '-e', "import {generateLevelPlan} from './src/lib/game.ts'; console.log(JSON.stringify(generateLevelPlan(280)));"], cwd=root, text=True))
images = Path(args.screenshots); images.mkdir(parents=True, exist_ok=True)
errors, failures, checks = [], [], 0
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    for width, height in [(1440, 1000), (390, 844)]:
        page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failures.append(response.url) if response.status >= 400 else None)
        page.goto(args.base_url.rstrip('/') + '/games/faith-3')
        expect(page.get_by_role('heading', name='Faith 3 Tile Match', exact=True)).to_be_visible()
        for level in [1, 2, 3, 4, 5, 6, 11, 31, 61, 101, 221, 280]:
            page.get_by_label('Level', exact=True).select_option(str(level))
            tiles = page.locator('.faith-tile')
            assert tiles.count() > 0
            if level > 1:
                assert tiles.evaluate_all('nodes => new Set(nodes.map(node => node.style.zIndex)).size >= 2')
                assert page.locator('.faith-tile:disabled').count() > 0, f'No covered tiles at level {level}'
            assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1'), f'Vertical overflow at {width}px, level {level}'
            ice = page.locator('.faith-tile[data-frost]')
            seals = page.locator('.faith-tile[data-seal]')
            veils = page.locator('.faith-tile[data-veiled]')
            if level < 11:
                assert ice.count() == seals.count() == veils.count() == 0
            else:
                assert ice.count() > 0
                assert ice.evaluate_all('nodes => nodes.every(node => node.disabled)')
                count = tiles.count(); ice.first.evaluate('(node) => node.click()')
                expect(tiles).to_have_count(count)
            if level >= 31:
                assert seals.count() > 0
                assert seals.evaluate_all('nodes => nodes.every(node => node.disabled)')
            if level >= 61:
                assert veils.count() > 0
                assert veils.locator('[data-artwork]').count() == 0, 'A veiled tile exposes its face.'
                assert veils.locator('.faith-veiled-face').count() == veils.count()
            capacity = 7 if level < 101 else 6 if level < 221 else 5
            expect(page.get_by_text(f'0 of {capacity} slots filled', exact=True)).to_be_visible()
            expect(page.locator('.faith-tray-locked')).to_have_count(7-capacity)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow at {width}px, level {level}'
            checks += 1
        page.evaluate('scrollTo(0, 0)')
        page.screenshot(path=str(images / f'grandmaster-{width}.png'), full_page=True)
        expect(page.get_by_text('Grandmaster', exact=True)).to_be_visible()
        before = page.locator('.faith-tile').count()
        page.get_by_role('button', name='Shuffle · 2 left', exact=True).click()
        expect(page.locator('.faith-tile')).to_have_count(before)
        expect(page.locator('.faith-tile[data-frost], .faith-tile[data-seal], .faith-tile[data-veiled]')).to_have_count(0)
        page.get_by_role('button', name='Restart level', exact=True).click()
        expect(page.locator('.faith-tile')).to_have_count(len(plan['board']))
        reveals = 0
        for index, tile_id in enumerate(plan['solution']):
            target = page.locator(f'.faith-tile[aria-label$=" tile {tile_id}"]')
            expect(target).to_be_enabled()
            if target.get_attribute('data-veiled'):
                target.evaluate('(node) => node.click()')
                expect(target).not_to_have_attribute('data-veiled', 'true')
                expect(page.locator('.faith-tile')).to_have_count(len(plan['board'])-index)
                reveals += 1
            # Use genuine pointer input on the first tile to check its hit area,
            # then native button clicks to keep a complete large replay quick.
            if index == 0:
                target.click()
            else:
                target.evaluate('(node) => node.click()')
            expect(page.locator('.faith-tile')).to_have_count(len(plan['board'])-index-1)
            assert page.locator('.faith-tray-filled').count() < 5
        assert reveals > 0
        expect(page.get_by_text('Level cleared', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Next level', exact=True)).to_be_disabled()
        expect(page.locator('.faith-tray-filled')).to_have_count(0)
        page.close()
    browser.close()
assert not errors, errors
assert not failures, failures
print(json.dumps({'milestone_viewport_checks': checks, 'complete_grandmaster_replays': 2, 'browser_errors': errors, 'asset_failures': failures}))
