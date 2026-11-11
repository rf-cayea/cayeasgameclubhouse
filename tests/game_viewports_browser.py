"""Real local game screens must fit before and during play, including fitted hands."""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5173');parser.add_argument('--screenshots',default='test-results/game-viewports');args=parser.parse_args()
from urllib.parse import urlparse
assert urlparse(args.base_url).hostname in ('localhost','127.0.0.1')
out=Path(args.screenshots);out.mkdir(parents=True,exist_ok=True)
results=[];errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for game in ['rummy','spades','3-gems','faith-3']:
  for w,h in [(390,844),(375,667),(768,1024),(1024,768),(844,390),(568,320)]:
   context=b.new_context(viewport={'width':w,'height':h},reduced_motion='reduce')
   page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(args.base_url.rstrip('/')+'/games/'+game)
   if game=='rummy':
    start=page.get_by_role('button',name='Start game',exact=True);assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1');start.click();expect(page.locator('.rummy-live-table')).to_be_visible()
   elif game=='spades':
    start=page.get_by_role('button',name='Deal me in',exact=True);assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1');start.click();expect(page.locator('.spades-live-table')).to_be_visible()
   elif game=='3-gems':expect(page.get_by_role('grid',name='Gem garden')).to_be_visible()
   else:expect(page.locator('.faith-board')).to_be_visible()
   page.wait_for_timeout(100)
   data=page.evaluate('''() => {
     const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right}};
     return {height:innerHeight,scrollHeight:document.documentElement.scrollHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,table:rect('.rummy-live-table, .spades-live-table, .gems-board-panel, .faith-board-panel'),hand:rect('.hand-card-rail'),board:rect('.gems-board, .faith-board'),actions:rect('.table-action-bar, .spades-bid-panel, .gems-board-actions, .faith-assists'),trick:rect('.spades-trick-stage'),allCardsFit:[...document.querySelectorAll('ol[aria-label="Your hand"] button')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})};
   }''')
   assert data['scrollHeight'] <= h + 1 and data['scrollWidth'] <= w + 1, (game,w,h,data)
   assert data['allCardsFit'], (game,w,h,'hand overflow')
   if data['board']: assert data['board']['w'] >= 100 and data['board']['bottom'] <= h + 1, (game,w,h,'board clipped')
   results.append({'game':game,'viewport':f'{w}x{h}',**data})
   if w in (390,844):page.screenshot(path=str(out/f'{game}-{w}.png'))
   context.close()
 b.close()
assert not errors,errors
print(json.dumps({'viewport_checks':len(results),'all_four_games_fit':True,'browser_errors':errors}))
