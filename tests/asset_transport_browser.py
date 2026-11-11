"""Smoke-test the production Worker behind a gateway that strips encoding headers."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8811')
base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844})
    page=context.new_page();errors=[];checked=[];assets=set()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('response',lambda r:assets.add(r.url) if '/assets/plain/' in r.url else None)
    for path in ['/','/games/farkle','/games/crown-court','/games/quintsee','/games/3-gems','/games/rummy','/games/spades','/games/dominoes','/games/faith-3','/store','/about','/matchmaking']:
        response=page.goto(base+path,wait_until='networkidle')
        assert response.status==200,(path,response.status)
        assert 'content-encoding' not in response.headers
        assert response.body().lower().startswith(b'<!doctype html>'),path
        assert len(page.locator('body').inner_text())>100,path
        assert page.evaluate('document.styleSheets.length')>0,path
        assert not page.locator('body').inner_text().startswith('\x1f'),path
        checked.append(path)
    for url in assets:
        response=context.request.get(url)
        assert response.status==200,(url,response.status)
        assert 'content-encoding' not in response.headers
        assert not response.body().startswith(b'\x1f\x8b'),url
        response.body().decode('utf-8')
    page.goto(base+'/games/quintsee');page.get_by_role('button',name='Start a match',exact=True).click()
    expect(page.locator('.fd-live')).to_be_visible()
    page.get_by_role('button',name='Roll five dice',exact=True).click()
    expect(page.locator('.fd-die')).to_have_count(5)
    expect(page.get_by_label('1 of 3 rolls used',exact=True)).to_be_visible()
    page.screenshot(path='/tmp/clubhouse-transport-quintsee.png')
    page.goto(base+'/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
    page.get_by_role('button',name='The monastery',exact=False).click()
    assert page.get_by_label('Monastery section',exact=True).locator('option').all_text_contents()==['Repairs','Before & after','Story & Three Jewels']
    page.screenshot(path='/tmp/clubhouse-transport-monastery.png')
    assert not errors,errors
    print(json.dumps({'rendered_routes':checked,'readable_script_and_style_assets':len(assets),'quintsee_roll':True,'monastery_menu':True,'browser_errors':errors}))
    context.close();browser.close()
