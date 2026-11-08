"""Guest fixtures for barriers, result navigation and repair/village notices."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-results/gems-obstacles'

def fixture(page,level,near=False):
    page.evaluate('''async ({level,near})=>{
      const {newGemsJourney}=await import('/src/lib/gems-progress.ts');const {startGems}=await import('/src/lib/gems-engine.ts');const {gemsLevel}=await import('/src/lib/gems-levels.ts');
      const j=newGemsJourney();j.stars=Object.fromEntries(Array.from({length:level-1},(_,i)=>[String(i+1),3]));j.unlocked=level;j.play=startGems(level);
      if(near){const c=gemsLevel(level);j.play.collected=Array(6).fill(1000);j.play.board=Array.from({length:64},(_,i)=>({gem:{id:i+1,color:(Math.floor(i/8)*2+i%8)%6},crate:0,frost:i===0?1:0,chain:false}));j.play.nextId=65;j.play.cratesCleared=c.crates;j.play.chainsCleared=c.chains;j.play.frostCleared=Math.max(0,c.frost*c.frostLayers-1);}
      localStorage.setItem('clubhouse-three-gems-v1',JSON.stringify(j));
    }''',{'level':level,'near':near});page.reload();expect(page.get_by_role('gridcell')).to_have_count(64)

def win(page):
    page.get_by_role('button',name='Row hammer · 2 available',exact=True).click();page.locator('[data-index="0"]').click();expect(page.get_by_role('dialog')).to_be_visible()

def run():
    OUT.mkdir(parents=True,exist_ok=True);errors=[];checks=[]
    with sync_playwright() as p:
      b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);context=b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
      page.goto('http://127.0.0.1:5173/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
      fixture(page,4)
      for i in range(24,32):expect(page.locator(f'[data-index="{i}"]')).to_have_attribute('data-color','crate')
      for width,height in [(320,740),(375,667),(768,1024),(1024,768),(844,390),(568,320)]:
        page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1')
      page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'level-4-wall.png'))
      page.get_by_role('button',name='Row hammer · 2 available',exact=True).click();page.locator('[data-index="24"]').click()
      expect(page.locator('[data-index="24"]')).not_to_have_attribute('data-color','crate');checks.append('Level 4 has eight solid middle blocks, fits six viewports, and a hammer opens the wall')
      for width,height in [(320,667),(844,390),(568,320)]:
        page.set_viewport_size({'width':width,'height':height});fixture(page,1,True);win(page)
        next_button=page.get_by_role('dialog').get_by_role('button',name='Next level 2 →',exact=True)
        assert next_button.evaluate('e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}'),(width,height,'next button requires scrolling')
        expect(page.locator('.gems-next-notice')).to_contain_text('Repair available')
        next_button.click();expect(page.get_by_role('dialog')).to_have_count(0);expect(page.locator('.gems-board-heading h2')).to_contain_text('Level 2')
      checks.append('Next level is visible without scrolling on narrow phones and landscape, advances the board, and shows repair availability')
      page.set_viewport_size({'width':390,'height':844});fixture(page,1,True);win(page)
      page.get_by_role('button',name='Admire the garden',exact=True).click();page.get_by_role('button',name='Village →',exact=True).click();expect(page.get_by_role('heading',name='Bodhi Village',exact=True)).to_be_visible()
      page.get_by_role('button',name='Play for more stars →',exact=True).click();page.get_by_role('button',name='Next level 2 →',exact=True).click();expect(page.locator('.gems-board-heading h2')).to_contain_text('Level 2')
      checks.append('Dismissed win keeps navigation available; village link opens Village & alms directly')
      fixture(page,200,True);win(page);expect(page.get_by_role('button',name='All 200 levels complete · visit the monasteries →',exact=True)).to_be_visible();expect(page.get_by_role('button',name='Next level 201 →',exact=True)).to_have_count(0)
      checks.append('Final level offers the monastery instead of an invalid level 201')
      context.close();b.close()
    assert not errors,errors
    print(json.dumps({'checks':checks,'browser_errors':errors,'production_writes':False}))
if __name__=='__main__':run()
