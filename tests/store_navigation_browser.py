"""Store navigation, individual frames and confirmed equip state with fake members.
The catalog is read from the local preview; all member writes are intercepted.
"""
import argparse,copy,json
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image
from playwright.sync_api import sync_playwright,expect
from economy_browser import EconomyFixture,POINT_FIELDS
from social_browser import ADMIN,MEMBER,session

class StoreFixture(EconomyFixture):
 def __init__(self,catalog):
  super().__init__();self.catalog=catalog;self.equipped={user:{'background':'rummy-room-classic','table':'rummy-table-classic','deck':'rummy-standard'} for user in [ADMIN,MEMBER]}
  self.wallets[ADMIN]['owned'] += ['faith3-skin-celestial','faith3-skin-jade','faith3-skin-rose'];self.wallets[ADMIN]['equipped']['faith3_skin']='faith3-skin-celestial'
  self.hold_reads=False;self.reads=[];self.hold_equip=False;self.equip_request=None;self.fail_equip=False
 def apply_economy(self,actor,command):
  if command['operation']=='purchase':
   item=next(i for i in self.catalog if i['id']==command['itemId']);wallet=self.wallets[actor];already=item['id'] in wallet['owned']
   currency='points' if command.get('payment')=='cash' else POINT_FIELDS[command['game']] if command.get('game') else item['currency'];price=item['cashPrice'] if command.get('payment')=='cash' else item['price']
   if not already:assert wallet[currency]>=price;wallet[currency]-=price;wallet['owned'].append(item['id'])
   return {'ok':True,**self.view(actor),'receipt':{'type':'purchase','itemId':item['id'],'amount':price,'currency':currency,'alreadyApplied':already}},200
  if command['operation']=='equip' and self.fail_equip:
   self.fail_equip=False;return {'error':'Fictional equip failed. Your previous skin is unchanged.'},503
  return super().apply_economy(actor,command)
 def economy(self,route):
  path=urlparse(route.request.url).path
  if path=='/api/economy/catalog':self.respond(route,{'items':self.catalog});return
  if path=='/api/economy' and route.request.method=='GET' and self.hold_reads:
   self.reads.append((route,copy.deepcopy(self.view(self.actor(route)))));return
  if route.request.method=='POST' and route.request.post_data_json.get('operation')=='equip' and self.hold_equip:
   self.equip_request=(route,self.actor(route),route.request.post_data_json);return
  super().economy(route)
 def release_equip(self):
  route,actor,command=self.equip_request;self.hold_equip=False;self.equip_request=None
  value,status=self.apply_economy(actor,command);self.respond(route,value,status)
 def release_reads(self,old_only=False):
  remaining=[]
  for route,value in self.reads:
   if old_only and value['wallet']['equipped'].get('faith3_skin')=='faith3-skin-jade':remaining.append((route,value));continue
   self.respond(route,value)
  self.reads=remaining
 def game(self,route):
  if urlparse(route.request.url).path=='/api/rummy/appearance':
   actor=self.actor(route)
   if route.request.method=='POST':
    chosen=route.request.post_data_json;assert all(i in self.wallets[actor]['owned'] or i in ['rummy-room-classic','rummy-table-classic','rummy-standard'] for i in chosen.values());self.equipped[actor]=chosen
   self.respond(route,{'member':True,'wins':0,'owned':['rummy-room-classic','rummy-table-classic','rummy-standard']+[i for i in self.wallets[actor]['owned'] if i.startswith(('rummy-', 'card-deck-'))],'equipped':self.equipped[actor]});return
  if urlparse(route.request.url).path.endswith('/session'):self.respond(route,{'member':True,'jokers':False});return
  super().game(route)

def category(page,label):page.get_by_role('navigation',name='Store categories',exact=True).get_by_role('link',name=label,exact=True).click()
def buy(page,item_id,payment='points'):
 item=page.locator(f'[data-store-item="{item_id}"]');item.get_by_role('button',name='Buy · 100 points' if payment=='points' else 'Buy · 77 Cash',exact=True).click();page.get_by_role('button',name='Confirm purchase',exact=True).click();expect(item.get_by_text('Owned permanently',exact=True)).to_be_visible()
def fitted(page):assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')

def run(base):
 out=Path('/workspace/work/store-navigation-qa');out.mkdir(parents=True,exist_ok=True);Image.new('RGB',(230,310),(65,145,110)).save(out/'profile-test.png')
 checks=[];errors=[]
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  api=p.request.new_context();catalog=api.get(base+'/api/economy/catalog').json()['items'];api.dispose();fixture=StoreFixture(catalog)
  assert all(item['price']==100 and item['cashPrice']==77 for item in catalog if item['slot'] in ['rummy_table','spades_table'])
  frames=[item for item in catalog if item['id'].startswith('profile-image-')];assert len(frames)==4 and all(i['price']==100 for i in frames)
  assert not any(i['id']=='profile-custom-image' for i in catalog)
  context=fixture.context(browser,ADMIN,390);page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(base+'/store');expect(page.get_by_role('heading',name='Rummy+ tables',exact=True)).to_be_visible()
  products=page.locator('.store-product-panel article');expect(products).to_have_count(2);original=products.evaluate_all('nodes=>nodes.map(n=>n.getAttribute("aria-label"))')
  expect(page.get_by_role('heading',name='The Faith 3 atelier',exact=True)).to_have_count(0);expect(page.get_by_role('region',name='Custom profile image',exact=True)).to_have_count(0)
  page.get_by_role('button',name='Next products',exact=True).click();assert products.evaluate_all('nodes=>nodes.map(n=>n.getAttribute("aria-label"))')!=original
  page.get_by_role('button',name='Previous products',exact=True).click();assert products.evaluate_all('nodes=>nodes.map(n=>n.getAttribute("aria-label"))')==original
  page.get_by_label('Search tables',exact=True).fill('Midnight Sapphire');expect(products).to_have_count(1);expect(products).to_contain_text('100 Rummy+ points or 77 Clubhouse Cash')
  page.get_by_label('Search tables',exact=True).fill('');page.get_by_role('checkbox',name='Owned only',exact=True).check();expect(products).to_have_count(1);page.get_by_role('checkbox',name='Owned only',exact=True).uncheck()
  page.get_by_label('Search tables',exact=True).fill('Nocturne Gold');before=fixture.wallets[ADMIN]['rummy_points'];buy(page,'rummy-table-nocturne');assert fixture.wallets[ADMIN]['rummy_points']==before-100
  products.get_by_role('button',name='Use design',exact=True).click();expect(products.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
  page.get_by_role('group',name='Card game',exact=True).get_by_role('button',name='Spades',exact=True).click();expect(page.get_by_role('heading',name='Spades tables',exact=True)).to_be_visible()
  page.get_by_label('Search tables',exact=True).fill('Rosewood');expect(products).to_have_count(1);expect(products).to_contain_text('100 Spades points or 77 Clubhouse Cash');before=fixture.wallets[ADMIN]['spades_points'];buy(page,'spades-table-ember');assert fixture.wallets[ADMIN]['spades_points']==before-100
  products.get_by_role('button',name='Equip',exact=True).click();expect(products.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
  checks.append('Categories, game switches, pagination, search and owned-only filtering reach tables without a long catalog; old and new tables charge exactly 100 points')
  category(page,'Decks');expect(page.get_by_role('heading',name='Shared card decks',exact=True)).to_be_visible();assert page.locator('.store-product-panel .artist-deck-showcase').count()==0
  preview=products.first.get_by_role('button',name='Preview',exact=False);preview.click();expect(page.locator('.store-preview-dialog')).to_be_visible();page.get_by_role('button',name='See every face',exact=True).click();expect(page.get_by_role('button',name='Back to preview',exact=True)).to_be_visible();page.get_by_role('button',name='Back to preview',exact=True).click();expect(page.locator('.store-preview-dialog')).to_be_visible();page.get_by_role('button',name='Close preview',exact=True).click();expect(page.locator('.store-preview-dialog')).to_have_count(0)
  category(page,'Frames');expect(page.get_by_role('region',name='Custom profile image',exact=True)).to_be_visible();page.go_back();expect(page.get_by_role('heading',name='Shared card decks',exact=True)).to_be_visible();page.go_forward();expect(page.get_by_role('heading',name='Frames',exact=True)).to_be_visible()
  page.screenshot(path=str(out/'frames-phone.png'),full_page=True);fitted(page)
  checks.append('Deck previews open in a dialog; browser back/forward restores the selected category')
  page.goto(base+'/store#faith-skins');faith=page.get_by_role('region',name='The Faith 3 atelier',exact=True);expect(faith).to_be_visible();expect(page.get_by_role('navigation',name='Store categories').get_by_role('link',name='Faith 3',exact=True)).to_have_attribute('aria-current','page')
  moon=faith.get_by_role('article',name='Moonlit Celestial',exact=True);jade=faith.get_by_role('article',name='Jade Sanctuary',exact=True);rose=faith.get_by_role('article',name='Rose Quartz',exact=True)
  expect(moon.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
  fixture.hold_reads=True;page.evaluate("dispatchEvent(new Event('focus'))");page.wait_for_timeout(200);assert fixture.reads
  fixture.hold_equip=True;jade.get_by_role('button',name='Equip skin',exact=True).click();page.wait_for_timeout(120);assert fixture.equip_request
  expect(jade.get_by_role('button',name='Equip skin',exact=True)).to_be_disabled();expect(jade.get_by_role('button',name='Equipped',exact=True)).to_have_count(0)
  fixture.release_equip();expect(jade.get_by_role('button',name='Equipped',exact=True)).to_be_disabled();expect(moon.get_by_role('button',name='Equip skin',exact=True)).to_be_enabled()
  fixture.release_reads(old_only=True);page.wait_for_timeout(120);expect(jade.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
  fixture.hold_reads=False;fixture.release_reads();category(page,'Tables');category(page,'Faith 3');expect(jade.get_by_role('button',name='Equipped',exact=True)).to_be_disabled()
  fixture.fail_equip=True;rose.get_by_role('button',name='Equip skin',exact=True).click();expect(faith.get_by_role('alert')).to_contain_text('previous skin is unchanged');expect(jade.get_by_role('button',name='Equipped',exact=True)).to_be_disabled();expect(rose.get_by_role('button',name='Equip skin',exact=True)).to_be_enabled()
  checks.append('Faith shows Equipped from the confirmed response before refresh, rejects a stale wallet response, survives category changes and keeps the old skin on failure')
  page.goto(base+'/store#spades-partnerships');expect(page.get_by_role('heading',name='Spades Partnerships · 2 vs 2',exact=True)).to_be_visible();expect(page.get_by_role('navigation',name='Store categories').get_by_role('link',name='Game modes',exact=True)).to_have_attribute('aria-current','page')
  expect(page.get_by_role('navigation',name='Store categories').get_by_role('link',name='Village',exact=True)).to_have_count(0);category(page,'Wallet');expect(page.get_by_role('button',name='Convert to Cash',exact=True)).to_be_visible()
  checks.append('Existing Faith and Spades mode links select the right section; retired village category is absent; wallet conversion is one category away')
  category(page,'Frames');custom=page.get_by_role('region',name='Custom profile image',exact=True)
  custom.get_by_label('Profile image points source',exact=True).select_option('spades');before=fixture.wallets[ADMIN]['spades_points'];buy(page,'profile-image-circle');assert fixture.wallets[ADMIN]['spades_points']==before-100
  custom.get_by_role('button',name='diamond profile frame',exact=True).click();expect(custom.locator('[data-store-item="profile-image-diamond"]').get_by_text('Owned permanently',exact=True)).to_have_count(0)
  page.goto(base+'/profile');expect(page.get_by_label('Custom profile image file',exact=True)).to_be_visible();page.get_by_label('Custom profile image file',exact=True).set_input_files(out/'profile-test.png');expect(page.locator('.social-profile-preview [data-image-shape="circle"] img')).to_be_visible();page.get_by_role('button',name='Save profile',exact=True).click();expect(page.get_by_text('Your player profile is saved.',exact=True)).to_be_visible()
  custom=page.get_by_role('region',name='Custom profile image',exact=True);custom.get_by_role('button',name='diamond profile frame',exact=True).click();expect(page.get_by_label('Custom profile image file',exact=True)).to_have_count(0);expect(page.locator('.social-profile-preview [data-image-shape="circle"] img')).to_be_visible();expect(page.get_by_role('button',name='Save profile',exact=True)).to_be_disabled()
  page.goto(base+'/store?category=frames');custom=page.get_by_role('region',name='Custom profile image',exact=True)
  for shape,payment,game in [('diamond','points','rummy'),('square','cash',None),('portrait','points','3-gems')]:
   custom.get_by_role('button',name=shape+' profile frame',exact=True).click();field='points' if payment=='cash' else POINT_FIELDS[game];before=fixture.wallets[ADMIN][field]
   if game:custom.get_by_label('Profile image points source',exact=True).select_option(game)
   buy(page,'profile-image-'+shape,payment);assert fixture.wallets[ADMIN][field]==before-(77 if payment=='cash' else 100)
  assert len([id for id in fixture.wallets[ADMIN]['owned'] if id.startswith('profile-image-')])==4
  checks.append('Each shape is separately purchased for 100 chosen game points or 77 Cash; collecting circle does not unlock diamond, square or portrait')
  page.goto(base+'/profile');custom=page.get_by_role('region',name='Custom profile image',exact=True)
  for shape in ['diamond','square','portrait']:
   custom.get_by_role('button',name=shape+' profile frame',exact=True).click();expect(page.locator(f'.social-profile-preview [data-image-shape="{shape}"] img')).to_be_visible();page.get_by_role('button',name='Save profile',exact=True).click();expect(page.get_by_text('Your player profile is saved.',exact=True)).to_be_visible()
  page.reload();expect(page.locator('.social-profile-preview [data-image-shape="portrait"] img')).to_be_visible();page.goto(base+'/players/'+ADMIN);expect(page.locator('.social-player-page [data-image-shape="portrait"] img')).to_be_visible()
  page.goto(base+'/profile');page.evaluate("""async value=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {error}=await supabase.auth.setSession(value);if(error)throw error;}""",session(MEMBER));expect(page.locator('.social-profile-preview h2')).to_have_text('@LotusKnight');expect(page.get_by_label('Custom profile image file',exact=True)).to_have_count(0);expect(page.locator('.social-profile-preview img')).to_have_count(0)
  checks.append('Owned shapes save and reload on standalone profiles; switching members clears the previous image and entitlements')
  context.close()
  for width in [375,768,1440]:
   ctx=browser.new_context(viewport={'width':width,'height':900});tab=ctx.new_page();tab.on('pageerror',lambda error:errors.append(str(error)));tab.goto(base+'/store');expect(tab.get_by_role('heading',name='Rummy+ tables',exact=True)).to_be_visible();expect(tab.locator('.store-product-panel article')).to_have_count(2 if width<=640 else 4);fitted(tab);tab.screenshot(path=str(out/f'tables-{width}.png'),full_page=True);ctx.close()
  browser.close()
 assert not errors,errors
 (out/'report.json').write_text(json.dumps({'checks':checks,'browser_errors':errors},indent=2));print(json.dumps({'checks':checks,'browser_errors':errors,'production_accounts_changed':False}))

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:5181');args=parser.parse_args();base=args.base_url.rstrip('/');assert urlparse(base).hostname in ['localhost','127.0.0.1'];run(base)
if __name__=='__main__':main()
