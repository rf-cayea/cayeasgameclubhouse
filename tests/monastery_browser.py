"""Check star-only monastery restoration and the removed village UI on a local build."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8811')
base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('localhost','127.0.0.1')
root=Path(__file__).resolve().parents[1];out=Path('/tmp/gems-monastery-qa');out.mkdir(exist_ok=True)
fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e','''
import {newGemsJourney,GEMS_SAVE_KEY} from './src/lib/gems-progress.ts';
import {emptyVillages} from './src/lib/monastery-village.ts';
const old=newGemsJourney();old.stars=Object.fromEntries(Array.from({length:50},(_,i)=>[String(i+1),3]));old.unlocked=51;
const village=emptyVillages();village.theravada.produced.wood=3;
old.monastery={completedTasks:8,workshop:{made:{beads:0,cover:0,cushion:0},orders:[],village,campaign:{version:2,credit:0}}};
const near=newGemsJourney();near.play.collected=Array(6).fill(1000);near.play.board[0].frost=1;
console.log(JSON.stringify({key:GEMS_SAVE_KEY,old,near}));
'''],cwd=root,text=True))

def fit(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1')

def set_save(page,data):
    page.evaluate('({key,value})=>localStorage.setItem(key,JSON.stringify(value))',{'key':fixtures['key'],'value':data})
    page.reload();expect(page.get_by_role('gridcell')).to_have_count(64)

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    context=b.new_context(viewport={'width':390,'height':844});page=context.new_page();errors=[];requests=[];checks=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
    page.goto(base+'/games/3-gems');set_save(page,fixtures['old'])
    page.get_by_role('button',name='The monastery',exact=False).click()
    menu=page.get_by_label('Monastery section',exact=True)
    assert menu.locator('option').all_text_contents()==['Repairs','Before & after','Story & Three Jewels']
    expect(page.get_by_test_id('monastery-stars')).to_have_text('17')
    repair=page.get_by_role('button',name='Complete Restore the Bodhi garden walkway for 8 restoration stars',exact=True)
    expect(repair).to_be_enabled();repair.click()
    expect(page.get_by_test_id('monastery-stars')).to_have_text('9')
    expect(page.get_by_test_id('repair-animation')).to_be_visible()
    page.wait_for_timeout(300);page.screenshot(path=str(out/'star-only-repair-phone.png'));fit(page)
    saved=page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',fixtures['key'])
    assert saved['monastery']['completedTasks']==9
    assert saved['monastery']['workshop']['orders']==[]
    assert saved['monastery']['workshop']['village']['theravada']['produced']['wood']==3
    page.reload();page.get_by_role('button',name='The monastery',exact=False).click()
    expect(page.get_by_test_id('monastery-stars')).to_have_text('9')
    assert page.get_by_label('Monastery section',exact=True).locator('option').count()==3
    checks.append('Legacy guest save retains stars, completed repairs and archive; former NPC-delivery step repairs for stars alone and persists on reload')
    positions=[]
    for site,name in [('theravada','Bodhi Light Vihara'),('mahayana','Lotus Wisdom Temple'),('vajrayana','Snow Lion Sanctuary'),('zen','Still Water Monastery')]:
        page.get_by_label('Choose monastery',exact=True).select_option(site)
        page.get_by_label('Monastery section',exact=True).select_option('restoration')
        page.get_by_role('button',name='Before & after',exact=True).click()
        expect(page.get_by_label('Before and after comparison for '+name,exact=True)).to_be_visible()
        positions.append(page.locator('.gems-restoration-canvas .monastery-atlas').first.evaluate('(e)=>getComputedStyle(e).backgroundPosition'))
    assert len(set(positions))==4
    page.get_by_label('Monastery section',exact=True).select_option('story')
    expect(page.get_by_role('heading',name='Buddha. Dharma. Sangha.',exact=True)).to_be_visible()
    expect(page.locator('.monastery-inspiration')).to_be_visible()
    assert not re.search(r'village|NPC|supplies|crafts|worker',page.locator('.gems-monastery-view').inner_text(),re.I)
    for w,h in [(390,844),(768,1024),(844,390)]:
        page.set_viewport_size({'width':w,'height':h});fit(page)
        assert menu.evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}')
        page.screenshot(path=str(out/f'monastery-{w}x{h}.png'))
    checks.append('All four before/after scenes, repair animation, Three Jewels, scripture citations and compact phone/tablet menus remain')
    page.get_by_role('button',name='200 levels',exact=True).click()
    for chapter in range(4):
        page.get_by_label('Choose level chapter',exact=True).select_option(str(chapter))
        expect(page.locator('.gems-level-grid button')).to_have_count(50)
        assert not re.search('village',page.locator('.gems-level-menu').inner_text(),re.I)
    checks.append('All 200 levels remain in four monastery chapters of 50')
    page.set_viewport_size({'width':390,'height':844});set_save(page,fixtures['near'])
    page.get_by_role('button',name='Row hammer · 2 available',exact=True).click();page.locator('[data-index="0"]').click()
    dialog=page.get_by_role('dialog');expect(dialog).to_be_visible()
    expect(dialog.locator('.gems-restoration-gift')).to_contain_text('+1 restoration star')
    assert not re.search(r'village|\+3 supplies|NPC',dialog.inner_text(),re.I)
    expect(dialog.get_by_role('button',name='Next level 2 →',exact=True)).to_be_visible()
    dialog.get_by_role('button',name='Next level 2 →',exact=True).click()
    expect(page.locator('.gems-board-heading h2')).to_contain_text('Level 2');fit(page)
    checks.append('Level win offers next level and star-funded repairs without village buttons or resource rewards')
    page.goto(base+'/store?category=village#village-workers')
    expect(page.get_by_role('heading',name='Rummy+ tables',exact=True)).to_be_visible()
    assert not re.search('village|second worker',page.locator('.store-shell').inner_text(),re.I)
    page.goto(base+'/about');expect(page.get_by_role('heading',name='Restore more than buildings.',exact=True)).to_be_visible()
    assert not re.search('village|NPC|second.worker',page.locator('main').inner_text(),re.I)
    checks.append('Store no longer sells village workers; retired links fall back safely; About matches the simplified game')
    assert not any('monastery-villages.webp' in url for url in requests)
    assert not errors,errors
    context.close();b.close()
    report={'checks':checks,'browser_errors':errors,'production_writes':False}
    (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
