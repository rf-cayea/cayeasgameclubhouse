"""Regressions for Faith 3 inputs queued before React renders the next frame.

Run against a local app: python3 tests/game_interactions_browser.py --base-url http://127.0.0.1:5175
No backend, saved progress, or rewards are used.
"""
import argparse
import json
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5175')
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1'), 'Only local servers are supported.'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/games/faith-3')
    expect(page.get_by_role('heading', name='Faith 3 Tile Match', exact=True)).to_be_visible()
    tiles = page.locator('button[aria-label^="Pick "]')

    # Calling native click in one JS turn reproduces multiple discrete inputs
    # queued before the UI commits. A captured state loses all but the last pick.
    page.evaluate(r'''() => {
      const buttons = [...document.querySelectorAll('button[aria-label^="Pick "]')];
      const symbol = buttons[0].getAttribute('aria-label').replace(/ tile \d+$/, '');
      for (const button of buttons.filter(tile => tile.getAttribute('aria-label').replace(/ tile \d+$/, '') === symbol).slice(0, 3)) button.click();
    }''')
    expect(tiles).to_have_count(15)
    expect(page.get_by_text('15 tiles left · 1 triples matched', exact=True)).to_be_visible()
    expect(page.get_by_text('0 of 7 slots filled', exact=True)).to_be_visible()

    page.get_by_role('button', name='Restart level', exact=True).click()
    expect(tiles).to_have_count(18)
    page.evaluate(r'''() => {
      const tile = document.querySelector('button[aria-label^="Pick "]');
      tile.click(); tile.click(); tile.click();
    }''')
    expect(tiles).to_have_count(17)
    expect(page.get_by_text('1 of 7 slots filled', exact=True)).to_be_visible()

    page.get_by_role('button', name='Restart level', exact=True).click()
    expect(tiles).to_have_count(18)
    page.evaluate(r'''() => {
      const tiles = [...document.querySelectorAll('button[aria-label^="Pick "]')];
      tiles.sort((a, b) => a.getAttribute('aria-label').replace(/ tile \d+$/, '').localeCompare(b.getAttribute('aria-label').replace(/ tile \d+$/, '')));
      for (const tile of tiles) tile.click();
    }''')
    expect(tiles).to_have_count(0)
    expect(page.get_by_text('Level cleared', exact=True)).to_be_visible()

    page.get_by_role('button', name='Restart level', exact=True).click()
    expect(tiles).to_have_count(18)
    page.evaluate(r'''() => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent.startsWith('Shuffle ·'));
      button.click(); button.click(); button.click();
    }''')
    expect(page.get_by_role('button', name='Shuffle · 0 left', exact=True)).to_be_disabled()
    expect(tiles).to_have_count(18)

    page.evaluate(r'''() => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Next level');
      button.click(); button.click();
    }''')
    expect(page.get_by_role('heading', name='Level 3 · Christianity', exact=True)).to_be_visible()
    expect(tiles).to_have_count(24)
    assert not errors, errors
    browser.close()
    print(json.dumps({'queued_input_checks': 5, 'uncaught_browser_errors': errors}))
