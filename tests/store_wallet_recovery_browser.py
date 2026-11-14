"""Local Store wallet recovery and purchase flow with fictional account APIs."""
import base64
import json
import time
import subprocess
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
BASE = 'http://127.0.0.1:5173'
UID = '11111111-1111-4111-8111-111111111111'
def session(lifetime):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    exp = int(time.time()) + lifetime
    user = {'id': UID, 'email': 'fixture@example.invalid', 'aud': 'authenticated', 'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {}}
    return {'access_token': encode({'alg':'HS256','typ':'JWT'})+'.'+encode({'sub':UID,'aud':'authenticated','exp':exp})+'.fixture', 'refresh_token':'fixture-refresh', 'expires_at':exp, 'expires_in':lifetime, 'token_type':'bearer', 'user':user}
wallet = {name: 0 for name in ['points','f3_points','rummy_points','spades_points','gems_points','dice_points','domino_points','lifetime_points']}
wallet.update({'owned': [], 'equipped': {}, 'pending_perks': {}})

catalog = json.loads(subprocess.check_output(['node', '--import', 'tsx', '--input-type=module', '-e',
    "import {ECONOMY_CATALOG} from './src/lib/economy-protocol.ts'; console.log(JSON.stringify(ECONOMY_CATALOG));"],
    cwd=Path(__file__).resolve().parents[1], text=True))
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':390,'height':844})
    initial = session(3600)
    state = {'reads':0,'buys':0}
    wallet.update({'points':1000,'rummy_points':1500})
    def api(route):
        path=urlparse(route.request.url).path
        if path == '/api/economy/wallet':
            state['reads'] += 1
            if state['reads']==1:
                route.fulfill(status=500,json={'error':'The game service could not complete that request. Reconnect to check your table.'});return
            data={'wallet':wallet}
        elif path == '/api/economy/catalog': data={'items':catalog}
        elif path == '/api/economy' and route.request.method=='POST':
            command=route.request.post_data_json
            assert command['operation']=='purchase' and command['itemId']=='rummy-jokers'
            item=next(x for x in catalog if x['id']==command['itemId'])
            state['buys']+=1; wallet['rummy_points']-=item['price'];wallet['owned'].append(item['id'])
            data={'ok':True,'receipt':{'type':'purchase','itemId':item['id'],'currency':'rummy_points','amount':item['price'],'alreadyApplied':False},'wallet':wallet}
        elif path == '/api/rummy/appearance':data={'member':True,'wins':0,'owned':[],'equipped':{'background':'rummy-room-classic','table':'rummy-table-classic','deck':'card-deck-standard'}}
        else:data={'incoming':[],'outgoing':[],'friends':[]}
        route.fulfill(status=200,json=data)
    context.route('**/api/**',api)
    context.route('https://clubhouse.test.invalid/**',lambda route:route.fulfill(status=200,json=None))
    context.add_init_script("Object.defineProperty(window,'__CLUBHOUSE_CONFIG__',{get:()=>({supabaseUrl:'https://clubhouse.test.invalid',supabaseKey:'public-fixture'}),set(){}});if(!localStorage.getItem('fixture-seeded')){localStorage.setItem('sb-clubhouse-auth-token',"+json.dumps(json.dumps(initial))+");localStorage.setItem('fixture-seeded','true');}")
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.clock.install()
    page.goto(BASE+'/store?category=modes')
    expect(page.locator('.store-error')).to_contain_text('The game service could not complete')
    item=page.locator('[data-store-item="rummy-jokers"]')
    buy=item.get_by_role('button',name='points',exact=False)
    expect(buy).to_be_disabled()
    page.clock.run_for(30_001)
    expect(page.locator('.store-error')).to_have_count(0)
    expect(page.locator('.store-wallet-link')).to_contain_text('1,000')
    expect(buy).to_be_enabled();buy.click()
    page.get_by_role('button',name='Confirm purchase',exact=True).click()
    expect(item.get_by_text('Owned permanently',exact=True)).to_be_visible()
    assert state['buys']==1 and state['reads']>=2,state
    assert not errors,errors
    print(json.dumps({'wallet_failure_recovery_and_store_purchase':'passed','requests':state}))
    context.close();browser.close()
