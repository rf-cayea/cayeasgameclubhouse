"""Regression audit against an isolated local API; creates guest test tables."""
import json
from playwright.sync_api import sync_playwright,expect
import argparse
from urllib.parse import urlparse
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8810');base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('127.0.0.1','localhost')
GAMES=[('rummy','Rummy+','rummy',2,'cayea-rummy-room'),('spades','Spades','spades',4,'cayea-spades-room'),('five-dice','Quintsee','quintsee',2,'clubhouse-five-dice:guest:room'),('farkle','Farkle','farkle',2,'clubhouse-farkle:guest:room'),('crown-court','Crown & Court','crown-court',2,'clubhouse-crown-court:guest:room'),('dominoes','Dominoes','dominoes',2,'clubhouse-dominoes:guest:room')]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 errors=[]
 for width,height in [(390,844),(844,390),(1280,900)]:
  for game,label,slug,seats,key in GAMES:
   cs=[]
   def player():
    c=b.new_context(viewport={'width':width,'height':height});cs.append(c);page=c.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:errors.append(str(e)));return page
   host=player();host.goto(base+'/games/'+slug,wait_until='domcontentloaded');host.get_by_role('link',name='Match Making',exact=True).click();host.get_by_label('Match Making player name').fill('Audit Host');host.get_by_role('button',name='Host public match',exact=True).click()
   lobby=host.get_by_role('region',name=label+' multiplayer lobby');expect(lobby).to_be_visible();code=host.locator('.multiplayer-room-code strong').inner_text()
   host.evaluate('navigator.clipboard.writeText=async(text)=>{window.testInvitation=text;}');host.get_by_role('button',name='Copy invitation',exact=True).click();assert host.evaluate('window.testInvitation')==base+'/games/'+slug+'?room='+code
   # Invitation to an already occupied seat must resume, with no Join popup.
   host.goto(base+'/games/'+slug+'?room='+code,wait_until='domcontentloaded');expect(lobby).to_be_visible();expect(host.locator('dialog[open]')).to_have_count(0)
   peers=[]
   for n in range(1,seats):
    peer=player();peers.append(peer)
    invite_slug='five-dice' if game=='five-dice' and n==1 else slug
    peer.goto(base+'/games/'+invite_slug+'?room='+code,wait_until='domcontentloaded')
    join=peer.get_by_role('button',name='Join room' if game=='rummy' else 'Join Spades room' if game=='spades' else 'Join Farkle table' if game=='farkle' else 'Join table',exact=True);expect(join).to_be_enabled();join.click()
    expect(peer.get_by_role('region',name=label+' multiplayer lobby')).to_be_visible();expect(peer.locator('dialog[open]')).to_have_count(0)
    peer.reload(wait_until='domcontentloaded');expect(peer.get_by_role('region',name=label+' multiplayer lobby')).to_be_visible();expect(peer.locator('dialog[open]')).to_have_count(0)
    if game=='five-dice':assert '/games/quintsee' in peer.url
    # A joined player cannot relist a table owned by somebody else.
    peer.goto(base+'/matchmaking?game='+game,wait_until='domcontentloaded');expect(peer.get_by_role('button',name='Check saved table')).to_be_enabled();expect(peer.get_by_role('button',name='Retry listing',exact=True)).to_have_count(0);peer.get_by_role('button',name='Continue table',exact=True).click()
    peer.get_by_role('button',name='Ready to play',exact=True).click()
   expect(host.get_by_role('button',name='Start match',exact=True)).to_be_enabled();expect(host.get_by_role('button',name='Start match',exact=True)).to_be_in_viewport();host.get_by_role('button',name='Start match',exact=True).click();expect(lobby).not_to_be_visible()
   for page in [host,*peers]:assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   stale=player();stale.add_init_script('sessionStorage.setItem('+json.dumps(key)+',"DEADDEAD");');stale.goto(base+'/matchmaking?game='+game,wait_until='domcontentloaded');expect(stale.get_by_role('button',name='Host public match',exact=True)).to_be_enabled();expect(stale.get_by_role('button',name='Continue table',exact=True)).to_have_count(0)
   print(json.dumps({'viewport':[width,height],'game':game,'inviteJoinReload':'pass','joinerCannotRelist':'pass','readyStart':'pass','staleSavedTable':'pass'}),flush=True)
   for c in cs:c.close()
 assert not errors,errors
 b.close()
