"""Private-room transport lifecycle with fictional Auth and game responses.

Run against the local fictional-config Vite server on5174. A local harness
mounts the actual room hook; no real accounts, games, or rewards are changed.
"""
import argparse
import base64
import copy
import json
from urllib.parse import urlparse

from playwright.sync_api import Error, expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, SupabaseFixture, session


def actor(request):
    try:
        payload = request.headers.get('authorization', '').removeprefix('Bearer ').split('.')[1]
        return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
    except (IndexError, KeyError, ValueError):
        return None


class NetworkFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.revision = 1
        self.hands = {ADMIN: ['AS', '2S'], MEMBER: ['KH', 'QD']}
        self.hold_reads, self.hold_moves, self.left = set(), set(), set()
        self.reads, self.moves = [], []
        self.pending_reads, self.pending_moves = [], []

    def http(self, route, fallback):
        super().http(route, actor(route.request) or fallback)

    def view(self, user):
        return {'code': 'ABCD1234', 'revision': self.revision, 'status': 'playing',
                'hand': list(self.hands[user]), 'reward': {'status': 'unranked'}}

    @staticmethod
    def respond(route, value, status=200):
        try:
            route.fulfill(status=status, content_type='application/json', body=json.dumps(value))
        except Error:
            # A correctly aborted old-identity request can close before its
            # delayed fixture response is released.
            pass

    def game(self, route):
        user = actor(route.request)
        path = urlparse(route.request.url).path
        if user not in self.hands or user in self.left:
            self.respond(route, {'error': 'Not a member of this room.'}, 403)
        elif path == '/api/rummy/room/ABCD1234':
            self.reads.append(user)
            if user in self.hold_reads:
                self.pending_reads.append((route, user, copy.deepcopy(self.view(user))))
            else:
                self.respond(route, self.view(user))
        elif path == '/api/rummy' and route.request.method == 'POST':
            command = route.request.post_data_json
            self.moves.append((user, command))
            if command['operation'] == 'leave':
                self.left.add(user)
                self.respond(route, self.view(user))
            else:
                assert command['operation'] == 'move'
                assert command['revision'] == self.revision
                self.revision += 1
                self.hands[user].append('JC')
                value = copy.deepcopy(self.view(user))
                if user in self.hold_moves:
                    self.pending_moves.append((route, user, value))
                else:
                    self.respond(route, value)
        else:
            raise AssertionError((route.request.method, path))

    def release(self, kind, user):
        pending = self.pending_reads if kind == 'read' else self.pending_moves
        held = self.hold_reads if kind == 'read' else self.hold_moves
        held.discard(user)
        remaining = []
        for route, owner, value in pending:
            if owner == user:
                self.respond(route, value)
            else:
                remaining.append((route, owner, value))
        pending[:] = remaining


STREAMS = """(() => {
 const original=window.fetch.bind(window);window.fixtureStreams=[];
 window.fetch=(input,init={})=>{
  const path=new URL(input instanceof Request?input.url:String(input),location.href).pathname;
  if(!/^\\/api\\/(rummy|spades)\\/room\\/[^/]+\\/events$/.test(path))return original(input,init);
  let user=null;try{const token=new Headers(init.headers).get('Authorization').slice(7);user=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub}catch{}
  const entry={user,aborted:false};window.fixtureStreams.push(entry);
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(': connected\\n\\n'));
   const cancel=()=>{entry.aborted=true;try{controller.error(new DOMException('Aborted','AbortError'))}catch{}};
   init.signal?.addEventListener('abort',cancel,{once:true});if(init.signal?.aborted)cancel();}});
  return Promise.resolve(new Response(body,{headers:{'Content-Type':'text/event-stream'}}));
 };
})()"""


def state(page):
    return json.loads(page.locator('#network-state').inner_text())


def switch(page, user):
    page.evaluate("""async session=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {error}=await supabase.auth.setSession(session);if(error)throw error;}""", session(user))


def run(base):
    checks, errors = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        fixture = NetworkFixture()
        context = fixture.context(browser, ADMIN)
        context.route('**/api/rummy**', fixture.game)
        context.add_init_script("sessionStorage.setItem('cayea-rummy-room','ABCD1234')")
        context.add_init_script(STREAMS)
        page = context.new_page();page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/network-hook-regression')
        page.evaluate("""async()=>{const {mount}=await import('/tests/room-network-harness.tsx');mount('rummy')}""")
        expect(page.locator('#network-state')).to_contain_text('"revision":1')
        expect(page.locator('#network-state')).to_contain_text('"AS"')
        page.wait_for_function('fixtureStreams.some(stream=>!stream.aborted)')

        fixture.hold_reads.add(ADMIN)
        page.evaluate('()=>{roomNetwork.refresh();roomNetwork.refresh();roomNetwork.refresh()}')
        page.wait_for_timeout(150)
        assert len(fixture.pending_reads) == 1, len(fixture.pending_reads)
        checks.append('overlapping push, polling and manual refreshes coalesce into one room read')

        fixture.hold_moves.add(ADMIN)
        page.locator('#network-move').click()
        expect(page.locator('#network-state')).to_contain_text('"pending":true')
        assert fixture.pending_moves
        switch(page, ADMIN)
        page.wait_for_timeout(150)
        assert state(page)['room']['hand'][:2] == ['AS', '2S']
        fixture.release('move', ADMIN)
        expect(page.locator('#network-state')).to_contain_text('"revision":2')
        expect(page.locator('#network-state')).to_contain_text('"pending":false')
        fixture.release('read', ADMIN)
        page.wait_for_timeout(100)
        assert state(page)['room']['revision'] == 2
        checks.append('same-account SIGNED_IN preserves an in-flight move and stale reads cannot roll its revision back')

        fixture.hold_reads.add(ADMIN)
        page.evaluate('()=>{roomNetwork.refresh()}')
        fixture.hold_moves.add(ADMIN)
        page.locator('#network-move').click()
        expect(page.locator('#network-state')).to_contain_text('"pending":true')
        switch(page, MEMBER)
        expect(page.locator('#network-state')).to_contain_text('"KH"')
        expect(page.locator('#network-state')).not_to_contain_text('"AS"')
        page.wait_for_function('fixtureStreams.some(stream=>stream.user==="' + MEMBER + '"&&!stream.aborted)')
        assert page.evaluate('(user)=>fixtureStreams.filter(stream=>stream.user===user).every(stream=>stream.aborted)', ADMIN)
        fixture.hold_moves.add(MEMBER)
        page.locator('#network-move').click()
        expect(page.locator('#network-state')).to_contain_text('"pending":true')
        fixture.release('move', ADMIN)
        page.wait_for_timeout(100)
        assert state(page)['pending'] is True
        assert 'AS' not in state(page)['room']['hand']
        fixture.release('move', MEMBER)
        expect(page.locator('#network-state')).to_contain_text('"pending":false')
        expect(page.locator('#network-state')).to_contain_text('"revision":4')
        fixture.release('read', ADMIN)
        page.wait_for_timeout(100)
        assert state(page)['room']['hand'][:2] == ['KH', 'QD']
        checks.append('account switch clears private hands, aborts old push transport, and isolates late reads and command completions')

        fixture.hold_reads.add(MEMBER)
        page.evaluate('()=>{roomNetwork.refresh()}')
        page.wait_for_timeout(100)
        assert fixture.pending_reads
        page.locator('#network-leave').click()
        expect(page.locator('#network-state')).to_contain_text('"code":null')
        expect(page.locator('#network-state')).to_contain_text('"room":null')
        fixture.release('read', MEMBER)
        page.wait_for_timeout(150)
        assert state(page)['room'] is None
        assert page.evaluate("sessionStorage.getItem('cayea-rummy-room')") is None
        assert page.evaluate('fixtureStreams.every(stream=>stream.aborted)')
        checks.append('leaving clears the saved room and a late read cannot revive the table or its stream')
        assert not errors, errors
        assert not fixture.unhandled, fixture.unhandled
        context.close();browser.close()
    print(json.dumps({'checks': checks, 'browser_errors': errors, 'real_accounts_or_games_changed': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('--base-url', default='http://127.0.0.1:5174');args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
    run(args.base_url.rstrip('/'))
