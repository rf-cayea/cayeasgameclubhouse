"""Local-only persisted auth, restricted-storage fallback, and token renewal."""
import base64
import json
import time
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
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for blocked in [False, True]:
        context = browser.new_context()
        state = {'refresh':0,'wallet':0,'logout':[]}
        initial, renewed = session(3600), session(7200)
        def auth(route):
            path = urlparse(route.request.url).path
            if path.endswith('/token'):
                state['refresh'] += 1; data = renewed
            elif path.endswith('/logout'):
                state['logout'].append(parse_qs(urlparse(route.request.url).query)); data = {}
            elif path.endswith('/user'): data = renewed['user']
            elif path.endswith('/moderation_role'): data = None
            else: data = {}
            route.fulfill(status=200, json=data)
        def api(route):
            path = urlparse(route.request.url).path
            if path == '/api/economy/wallet':
                state['wallet'] += 1
                if state['wallet'] == 1:
                    route.fulfill(status=401,json={'error':'Expired access token'}); return
                data = {'wallet':wallet}
            else: data = {'incoming':[], 'outgoing':[], 'friends':[]}
            route.fulfill(status=200,json=data)
        context.route('https://clubhouse.test.invalid/**', auth)
        context.route('**/api/**', api)
        script = "Object.defineProperty(window,'__CLUBHOUSE_CONFIG__',{get:()=>({supabaseUrl:'https://clubhouse.test.invalid',supabaseKey:'public-fixture'}),set(){}});"
        if blocked: script += "Object.defineProperty(window,'localStorage',{get(){throw new Error('Restricted browser storage')}});"
        script += "const store=" + ('sessionStorage' if blocked else 'localStorage') + ";if(!store.getItem('fixture-seeded')){store.setItem('sb-clubhouse-auth-token'," + json.dumps(json.dumps(initial)) + ");store.setItem('fixture-seeded','true');}"
        context.add_init_script(script)
        page = context.new_page(); errors = []; page.on('pageerror',lambda e: errors.append(str(e)))
        for path in ['/auth','/games/hearts','/games/crazy-eights','/auth']:
            page.goto(BASE+path)
            page.wait_for_function("async () => { const {supabase}=await import('/src/integrations/supabase/client.ts'); return (await supabase.auth.getSession()).data.session?.user.id === '"+UID+"'; }")
            if path == '/auth': expect(page.get_by_role('button', name='Sign out',exact=True)).to_be_visible()
        page.evaluate("async () => { const {economyRead}=await import('/src/lib/economy-api.ts'); return await economyRead('/api/economy/wallet','"+UID+"'); }")
        page.reload(); expect(page.get_by_role('button',name='Sign out',exact=True)).to_be_visible()
        page.wait_for_function("async () => { const {supabase}=await import('/src/integrations/supabase/client.ts'); return (await supabase.auth.getSession()).data.session?.expires_in === 7200; }")
        assert state['refresh'] == 1, state
        page.get_by_role('button',name='Sign out',exact=True).click()
        expect(page.get_by_role('button',name='Sign in',exact=True)).to_be_visible()
        assert state['logout'] == [{'scope':['local']}],state
        assert not errors,errors
        checks.append('restricted tab storage' if blocked else 'persistent browser storage')
        context.close()
    browser.close()
print(json.dumps({'reload_navigation_renewal_local_signout':checks}))
