"""Four village previews and chapter navigation; no production writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
OUT=Path(__file__).resolve().parent.parent/'test-results/village-map'
def run():
 OUT.mkdir(parents=True,exist_ok=True);errors=[];positions=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);page=browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:5173/games/3-gems');expect(page.get_by_role('gridcell')).to_have_count(64)
  page.get_by_role('button',name='200 levels',exact=True).click()
  for chapter in range(4):
   page.get_by_label('Choose level chapter',exact=True).select_option(str(chapter));expect(page.locator('.gems-level-grid button')).to_have_count(50);expect(page.get_by_role('button',name=f'Level {(chapter+1)*50} · locked',exact=True)).to_be_disabled();assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1')
  page.get_by_role('button',name='The monastery',exact=True).click()
  for site,name in [('theravada','Bodhi Village'),('mahayana','Lotus Bridge Village'),('vajrayana','Snow Pass Village'),('zen','Still Water Village')]:
   page.get_by_label('Choose monastery',exact=True).select_option(site);page.get_by_label('Community section',exact=True).select_option('village');expect(page.get_by_role('heading',name=name,exact=True)).to_be_visible();positions.append(page.locator('.village-painting').evaluate('e=>getComputedStyle(e).backgroundPosition'));page.locator('.village-map').screenshot(path=str(OUT/(site+'.png')));page.get_by_role('button',name='Open Village woodlot',exact=True).click();expect(page.get_by_label('Community section',exact=True)).to_have_value('producers');expect(page.get_by_test_id('village-wood')).to_have_text('4')
   if site!='theravada':expect(page.get_by_test_id('producer-harvest')).to_be_disabled()
   assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1')
  browser.close()
 assert len(set(positions))==4,positions
 assert not errors,errors
 print(json.dumps({'four_distinct_village_scenes':True,'fifty_levels_in_each_of_four_chapters':True,'map_links_and_future_locks':True,'browser_errors':errors,'production_writes':False}))
if __name__=='__main__':run()
