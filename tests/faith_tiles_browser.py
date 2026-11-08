"""Portrait artwork, theme switching and match/tray regression for Faith 3.
Run with --base-url pointing at a local dev or built Worker preview.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
parser.add_argument('--screenshots', default='test-results/faith-tiles')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1'), 'Use a local server.'
screenshots = Path(args.screenshots)
screenshots.mkdir(parents=True, exist_ok=True)
THEMES = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Judaism', 'Sikhism', 'Taoism', 'Shinto', 'Jainism', "Bahá'í Faith"]
checks, errors, failures = 0, [], []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    for width, height in [(1440, 1000), (390, 844), (320, 800)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda response: failures.append(response.url) if response.status >= 400 else None)
        response = page.goto(args.base_url.rstrip('/') + '/games/faith-3')
        assert response and response.ok
        expect(page.get_by_role('heading', name='Faith 3 Tile Match', exact=True)).to_be_visible()
        tiles = page.locator('button[aria-label^="Pick "]')
        expect(tiles).to_have_count(18)
        # Art must still render without emoji-font support.
        page.add_style_tag(content='body * {font-variant-emoji: text !important;}')
        art_keys = set()
        original_ids = tiles.evaluate_all('nodes => nodes.map(node => node.getAttribute("aria-label").match(/tile (\\d+)$/)[1])')
        page.get_by_role('button', name='Tiles & settings', exact=True).click()
        for collection, name in enumerate(THEMES):
            page.get_by_label('Tile collection', exact=True).select_option(str(collection))
            expect(page.get_by_role('heading', name=f'Level 1 · {name}', exact=True, include_hidden=True)).to_have_count(1)
            expect(tiles).to_have_count(18)
            assert tiles.evaluate_all('nodes => nodes.map(node => node.getAttribute("aria-label").match(/tile (\\d+)$/)[1])') == original_ids
            previews = page.locator('.faith-collection-preview svg')
            expect(previews).to_have_count(10)
            urls = previews.locator('image').evaluate_all('nodes => [...new Set(nodes.map(node => node.getAttribute("href")))]')
            loaded = page.evaluate('''async urls => await Promise.all(urls.map(url => new Promise(resolve => {
                const image = new Image(); image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = url;
            })))''', urls)
            assert all(loaded), f'Artwork missing: {name}'
            crops = set()
            for preview in previews.all():
                art_keys.add(preview.get_attribute('data-artwork'))
                crops.add(hashlib.sha256(preview.screenshot()).hexdigest())
            assert len(crops) == 10, f'Duplicate painted faces in {name}'
            dimensions = tiles.first.bounding_box()
            assert 1.44 < dimensions['height'] / dimensions['width'] < 1.56, f'Tile is not portrait: {dimensions}'
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Horizontal overflow at {width}px in {name}.'
            checks += 1
        assert len(art_keys) == 100
        page.get_by_label('Tile collection', exact=True).select_option('0')
        page.get_by_role('button', name='Back to game', exact=True).click()
        first = tiles.first
        motif = re.match(r'Pick (.+) tile \d+', first.get_attribute('aria-label')).group(1)
        matches = page.get_by_role('button', name=re.compile(r'^Pick ' + re.escape(motif) + r' tile '))
        first_art = first.locator('svg').get_attribute('data-artwork')
        first.click()
        tray = page.get_by_role('list', name='Tray slots')
        expect(tray.locator('svg')).to_have_count(1)
        assert tray.locator('svg').first.get_attribute('data-artwork') == first_art
        # Switching the collection changes both board and tray art, preserving play.
        page.get_by_role('button', name='Tiles & settings', exact=True).click()
        page.get_by_label('Tile collection', exact=True).select_option('1')
        expect(tiles).to_have_count(17)
        assert tray.locator('svg').first.get_attribute('data-artwork').startswith('1-')
        page.get_by_label('Tile collection', exact=True).select_option('0')
        page.get_by_role('button', name='Back to game', exact=True).click()
        matches.first.click(); matches.first.click()
        expect(tiles).to_have_count(15)
        expect(page.get_by_text('15 tiles left · 1 triples matched', exact=True)).to_be_visible()
        expect(tray.locator('svg')).to_have_count(0)
        page.get_by_role('button', name='Undo · 2 left', exact=True).click()
        expect(tiles).to_have_count(16)
        expect(tray.locator('svg')).to_have_count(2)
        page.get_by_role('button', name='Restart level', exact=True).click()
        expect(tiles).to_have_count(18)
        page.get_by_role('button', name='Tiles & settings', exact=True).click()
        page.get_by_label('Tile collection', exact=True).select_option('auto')
        page.get_by_role('button', name='Back to game', exact=True).click()
        for level, collection in [(21, 1), (101, 5), (181, 9), (280, 9)]:
            page.get_by_label('Level', exact=True).select_option(str(level))
            # Bonus levels use their existing rotating theme schedule.
            if level != 280:
                expect(page.get_by_role('heading', name=f'Level {level} · {THEMES[collection]}', exact=True)).to_be_visible()
            assert tiles.locator(':scope > svg').count() == tiles.count()
            enabled = page.locator('button[aria-label^="Pick "]:enabled')
            assert enabled.count() > 0
            if level == 280:
                assert page.locator('button[aria-label^="Pick "]:disabled').count() > 0
                chosen = enabled.first
                if chosen.get_attribute("data-veiled"):
                    chosen.click()
                    expect(chosen).not_to_have_attribute("data-veiled", "true")
                chosen.click()
                expect(tray.locator('svg')).to_have_count(1)
        page.get_by_label('Level', exact=True).select_option('1')
        page.evaluate('scrollTo(0, 0)')
        page.screenshot(path=str(screenshots / f'portrait-collection-{width}.png'), full_page=True)
        context.close()
    browser.close()
assert not errors, errors
assert not failures, failures
print(json.dumps({'collection_viewport_checks': checks, 'unique_faces_per_viewport': 100, 'portrait_tiles_matching_tray_and_undo': 'passed', 'browser_errors': errors, 'asset_failures': failures}))
