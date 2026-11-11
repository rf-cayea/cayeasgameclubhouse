"""Real guest Quintsee gameplay, multiplayer and viewport checks.

Run against the parent's isolated localhost guest API/Vite preview. Every game
uses fresh browser sessions, not production accounts or wallets.
"""
import argparse,json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect,sync_playwright

SIZES=[(375,667),(390,844),(768,1024),(1024,768),(568,320)]

def fitted(page):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Document overflowed horizontally'
 assert page.evaluate('document.documentElement.scrollHeight<=innerHeight+1'), 'Document requires vertical scrolling'
 expect(page.locator('.fd-die')).to_have_count(5)
 categories=page.locator('.fd-category');expect(categories).to_have_count(13)
 assert categories.evaluate_all('nodes=>nodes.every(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1})'), 'A score category is clipped'
 assert page.locator('.fd-scorecard').evaluate('(node)=>node.scrollHeight<=node.clientHeight+1'), 'Scorecard requires scrolling'

def start_bot(page,level='normal'):
 page.get_by_label('Quintsee difficulty',exact=True).select_option(level)
 page.get_by_role('button',name='Start a match',exact=True).click();expect(page.locator('.fd-live')).to_be_visible()
 expect(page.get_by_role('button',name='Roll five dice',exact=True)).to_be_enabled()

def roll(page):
 page.get_by_role('button',name='Roll five dice',exact=True).click();expect(page.get_by_label('1 of 3 rolls used',exact=True)).to_be_visible()
 expect(page.locator('.fd-category').filter(has_text='Chance')).to_be_enabled()

def score_chance(page):
 chance=page.get_by_role('button',name='Chance:',exact=False);chance.click();expect(chance).to_have_attribute('aria-pressed','true')
 confirm=page.locator('.fd-score-confirm').get_by_role('button',name='Score ',exact=False);expect(confirm).to_be_enabled();confirm.click()

def run(base):
 out=Path('/workspace/work/five-dice-qa');out.mkdir(exist_ok=True);errors=[];checks=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for level in ['easy','normal','hard']:
   context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(base+'/games/quintsee');start_bot(page,level)
   for width,height in SIZES:
    page.set_viewport_size({'width':width,'height':height});fitted(page);page.screenshot(path=str(out/f'{level}-{width}x{height}.png'))
   page.set_viewport_size({'width':390,'height':844});roll(page)
   first=page.locator('.fd-die').first;label=first.get_attribute('aria-label');first.click();expect(first).to_have_attribute('aria-pressed','true')
   page.get_by_role('button',name='Roll again',exact=False).click();expect(page.get_by_label('2 of 3 rolls used',exact=True)).to_be_visible();assert first.get_attribute('aria-label')==label+', held'
   score_chance(page);expect(page.get_by_role('button',name='Roll five dice',exact=True)).to_be_enabled();expect(page.locator('.fd-round-bar')).to_contain_text('ROUND 2 / 13')
   expect(page.get_by_role('button',name='Chance:',exact=False)).to_be_disabled()
   page.reload();expect(page.locator('.fd-live')).to_be_visible();expect(page.get_by_role('button',name='Chance:',exact=False)).to_be_disabled();fitted(page)
   checks.append(f'{level}: all13categories visible at five sizes, holds survive reroll, score confirmed, bot completes turn, reload resumes')
   context.close()
  # Genuine two-human match using separate HttpOnly cookie sessions.
  contexts=[browser.new_context(viewport={'width':390,'height':844}) for _ in range(2)];pages=[ctx.new_page() for ctx in contexts]
  for page,name in zip(pages,['Alice','Bob']):
   page.on('pageerror',lambda error:errors.append(str(error)));page.goto(base+'/games/quintsee');page.get_by_label('Quintsee player name',exact=True).fill(name)
  host,peer=pages;host.get_by_role('button',name='Play with friends',exact=True).click();host.get_by_role('button',name='Create a private table',exact=True).click()
  expect(host.get_by_role('region',name='Quintsee multiplayer lobby',exact=True)).to_be_visible();code=host.locator('.fd-code').inner_text().split()[0]
  peer.get_by_role('button',name='Join',exact=True).click();peer.get_by_label('Quintsee room code',exact=True).fill(code);peer.get_by_role('button',name='Join table',exact=True).click()
  expect(peer.get_by_role('region',name='Quintsee multiplayer lobby',exact=True)).to_be_visible();peer.get_by_role('button',name='I’m ready',exact=True).click()
  expect(host.get_by_role('button',name='Start the match',exact=True)).to_be_enabled();host.get_by_role('button',name='Start the match',exact=True).click()
  for page in pages:expect(page.locator('.fd-live')).to_be_visible();fitted(page)
  expect(peer.get_by_role('button',name='Roll five dice',exact=True)).to_be_disabled()
  # Commit the first roll, lose only the response, then retry its saved ID.
  attempted=[];interrupted=[False]
  def lose_response(route):
   command=route.request.post_data_json
   if command.get('operation')=='move' and command.get('move',{}).get('t')=='roll':
    attempted.append(command['requestId'])
    if not interrupted[0]:
     interrupted[0]=True;response=route.fetch();assert response.status==200;route.abort('connectionfailed');return
   route.continue_()
  host.route('**/api/five-dice',lose_response)
  host.get_by_role('button',name='Roll five dice',exact=True).click();expect(host.get_by_role('button',name='Retry action',exact=True)).to_be_visible()
  expect(host.locator('.fd-roll-controls button')).to_be_disabled();host.get_by_role('button',name='Retry action',exact=True).click()
  expect(host.get_by_role('button',name='Retry action',exact=True)).to_have_count(0);expect(host.get_by_label('1 of 3 rolls used',exact=True)).to_be_visible();assert len(attempted)==2 and attempted[0]==attempted[1]
  expect(peer.get_by_label('1 of 3 rolls used',exact=True)).to_be_visible()
  chance=host.get_by_role('button',name='Chance:',exact=False);expect(chance).to_be_enabled();chance.focus();host.keyboard.press('Enter');expect(chance).to_have_attribute('aria-pressed','true')
  host.locator('.fd-score-confirm').get_by_role('button',name='Score ',exact=False).click()
  expect(peer.get_by_role('button',name='Roll five dice',exact=True)).to_be_enabled();expect(host.get_by_role('button',name='Roll five dice',exact=True)).to_be_disabled()
  roll(peer);score_chance(peer);expect(host.get_by_role('button',name='Roll five dice',exact=True)).to_be_enabled()
  host.reload();expect(host.locator('.fd-live')).to_be_visible();expect(host.get_by_role('button',name='Chance:',exact=False)).to_be_disabled();fitted(host)
  checks.append('Real two-human table synchronizes turns and scores; ambiguous committed roll retries same UUID once; keyboard scoring and resume work')
  for ctx in contexts:ctx.close()
  browser.close()
 assert not errors,errors
 report={'checks':checks,'browser_errors':errors,'production_accounts_changed':False};(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5180');args=parser.parse_args();base=args.base_url.rstrip('/');assert urlparse(base).hostname in ['localhost','127.0.0.1'];run(base)
