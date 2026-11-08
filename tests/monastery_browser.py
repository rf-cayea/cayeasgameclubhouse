"""Real Node API + fictional member identity and labelled fifteen-clear fixture.
Guest milestone test uses a near-win local board. No production writes occur.
"""
import argparse
import json
import re
import subprocess
import io
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect,sync_playwright
from PIL import Image,ImageChops,ImageStat
from social_browser import SocialFixture,ADMIN

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-results/monastery'

@contextmanager
def server():
    process=subprocess.Popen(['node','--import','tsx','tests/puzzle-browser-server.ts','--monastery'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        assert 'ready' in process.stdout.readline()
        yield
    finally:
        process.terminate()
        try:process.wait(timeout=6)
        except subprocess.TimeoutExpired:process.kill();process.wait()

def mission(page,title,cost):
    page.get_by_role('button',name=f'Complete {title} for {cost} restoration '+('star' if cost==1 else 'stars'),exact=True).click()
    expect(page.locator('.community-message[role="status"]')).to_contain_text('complete')

def run():
    OUT.mkdir(parents=True,exist_ok=True);checks=[];errors=[]
    with server(),sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        fixture=SocialFixture();context=fixture.context(browser,ADMIN,width=390)
        def api(route):
            actor=fixture.actor(route);headers={k:v for k,v in route.request.headers.items() if k not in ['host','content-length','authorization']}
            if actor:headers['authorization']='Bearer '+actor
            response=route.fetch(url='http://127.0.0.1:8788'+urlparse(route.request.url).path,headers=headers)
            route.fulfill(response=response)
        context.route('**/api/**',api)
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('http://127.0.0.1:5174/games/3-gems');expect(page.get_by_role('grid')).to_have_attribute('aria-busy','false')
        page.get_by_role('button',name='The monastery',exact=True).click()
        expect(page.get_by_test_id('monastery-stars')).to_have_text('15')
        assert page.get_by_label('Choose monastery',exact=True).locator('option').count()==4
        page.evaluate('''async()=>{const image=new Image();image.src='/assets/monastery-worlds.webp';await image.decode();}''')
        stars=page.get_by_test_id('monastery-stars').inner_text()
        before_after=[]
        for tradition in ['Sri Lankan Theravada','Chinese Mahayana','Tibetan Vajrayana','Japanese Zen']:
            page.get_by_label('Choose monastery',exact=True).select_option({'Sri Lankan Theravada':'theravada','Chinese Mahayana':'mahayana','Tibetan Vajrayana':'vajrayana','Japanese Zen':'zen'}[tradition]);page.get_by_label('Community section',exact=True).select_option('restoration')
            page.get_by_role('button',name='Before',exact=True).click()
            before=page.locator('.gems-restoration-canvas').screenshot(path=str(OUT/(tradition.split()[0]+'-before.png')))
            page.get_by_role('button',name='Restored preview',exact=True).click()
            page.wait_for_function('Number(getComputedStyle(document.querySelector(".gems-restoration-canvas .monastery-atlas-restored")).opacity)>.99')
            after=page.locator('.gems-restoration-canvas').screenshot(path=str(OUT/(tradition.split()[0]+'-after.png')))
            delta=ImageChops.difference(Image.open(io.BytesIO(before)).convert('RGB'),Image.open(io.BytesIO(after)).convert('RGB'))
            assert sum(ImageStat.Stat(delta).mean)/3>10,(tradition,'before/after artwork did not actually change')
            page.get_by_role('button',name='Before & after',exact=True).click()
            slider=page.get_by_role('slider');previous=int(slider.input_value());slider.focus();page.keyboard.press('ArrowRight')
            expect(slider).to_have_value(str(previous+1))
            expect(page.get_by_test_id('monastery-stars')).to_have_text(stars)
            before_after.append(tradition)
        page.get_by_label('Choose monastery',exact=True).select_option('theravada');page.get_by_label('Community section',exact=True).select_option('repairs')
        mission(page,'Clear the fallen stones and weeds',1);expect(page.get_by_test_id('monastery-stars')).to_have_text('14')
        mission(page,'Welcome resident monks and nuns',2)
        mission(page,'Host the first Dharma lesson',3)
        mission(page,'Open the community craft workshop',4);expect(page.get_by_test_id('monastery-stars')).to_have_text('5')
        page.get_by_label('Community section',exact=True).select_option('community');expect(page.get_by_test_id('monastery-monks')).to_have_text('1');expect(page.get_by_test_id('monastery-lessons')).to_have_text('1')
        page.get_by_label('Community section',exact=True).select_option('crafts')
        expect(page.get_by_test_id('monastery-supplies')).to_have_text('47 supplies')
        page.get_by_role('button',name='Craft Wooden mala beads for 2 supplies',exact=True).click()
        expect(page.get_by_test_id('monastery-stock-beads')).to_have_text('1')
        page.get_by_role('button',name='Sell Wooden mala beads to Nila',exact=True).click()
        expect(page.locator('[data-order-id="theravada-beads"]')).to_contain_text('Delivered')
        expect(page.get_by_test_id('monastery-stock-beads')).to_have_text('0')
        expect(page.get_by_test_id('monastery-supplies')).to_have_text('46 supplies')
        page.reload();page.get_by_role('button',name='The monastery',exact=True).click()
        expect(page.get_by_test_id('monastery-stars')).to_have_text('5')
        page.get_by_label('Community section',exact=True).select_option('community');expect(page.get_by_test_id('monastery-monks')).to_have_text('1');expect(page.get_by_test_id('monastery-lessons')).to_have_text('1')
        page.get_by_label('Community section',exact=True).select_option('crafts')
        expect(page.locator('[data-order-id="theravada-beads"]')).to_contain_text('Delivered')
        page.get_by_label('Community section',exact=True).select_option('story')
        page.locator('.monastery-sources summary').click()
        assert page.locator('.monastery-sources a').count()==4
        expect(page.locator('.monastery-inspiration cite')).to_contain_text('Bhikkhu Sujato')
        expect(page.locator('.monastery-inspiration cite')).to_contain_text('CC0 public-domain')
        assert page.locator('.monastery-inspiration cite a').first.get_attribute('href').startswith('https://suttacentral.net/')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.set_viewport_size({'width':768,'height':1024})
        page.locator('.gems-monastery-view').screenshot(path=str(OUT/'journal-tablet.png'))
        checks.append('Fictional member fixture: four damaged/restored worlds, slider, stars, monks, lesson, craft, NPC sale, and account persistence')
        context.close()

        context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto('http://127.0.0.1:5173/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
        page.evaluate('''async()=>{const {newGemsJourney}=await import('/src/lib/gems-progress.ts');const {startGems}=await import('/src/lib/gems-engine.ts');const j=newGemsJourney();j.stars={'1':3,'2':3,'3':3,'4':3};j.unlocked=5;j.play=startGems(5);j.play.collected=Array(6).fill(1000);j.play.board=Array.from({length:64},(_,i)=>({gem:{id:i+1,color:(Math.floor(i/8)*2+i%8)%6},crate:0,frost:i===0?1:0,chain:false}));j.play.nextId=65;localStorage.setItem('clubhouse-three-gems-v1',JSON.stringify(j));}''')
        page.reload();expect(page.get_by_role('gridcell')).to_have_count(64)
        page.get_by_role('button',name='Row hammer · 2 available',exact=True).click();page.locator('[data-index="0"]').click()
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_role('dialog')).to_contain_text('+1 restoration star')
        expect(page.get_by_role('dialog').locator('.monastery-inspiration')).to_contain_text('LEVEL 5 MILESTONE')
        expect(page.get_by_role('dialog').locator('cite')).to_contain_text('Dhammapada 5')
        page.get_by_role('button',name=re.compile('Visit the monastery ·')).click()
        expect(page.get_by_test_id('monastery-stars')).to_have_text('5')
        mission(page,'Clear the fallen stones and weeds',1)
        expect(page.get_by_test_id('monastery-stars')).to_have_text('4')
        page.reload();page.get_by_role('button',name=re.compile('Visit the monastery ·')).click()
        expect(page.get_by_test_id('monastery-stars')).to_have_text('4')
        page.get_by_role('button',name='Play for more stars →',exact=True).click()
        assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1')
        checks.append('Guest near-win fixture: first-clear star, cited milestone quote, manual spending, persistence and fitted play screen')
        context.close();browser.close()
    assert not errors,errors
    print(json.dumps({'checks':checks,'before_and_after':before_after,'browser_errors':errors,'production_writes':False}))

if __name__=='__main__':run()
