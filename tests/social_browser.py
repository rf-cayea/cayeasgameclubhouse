"""Profile, friends and invitation UI against explicitly fictional API fixtures.

Use the fake-Supabase local Vite preview on5174. All identity, social and game
responses below are intercepted. These checks do not substitute for the real
Node/D1 HTTP tests and never change production players, points or messages.
"""
import argparse
import base64
import copy
import json
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, MEMBER, TARGET, SupabaseFixture, session

NOW = int(time.time() * 1000)


class SocialFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.profiles = {
            ADMIN: self.profile(ADMIN, 'JadeAce', 'Classic cards and good company.', 'jade'),
            MEMBER: self.profile(MEMBER, 'LotusKnight', 'Here for the next friendly match.', 'lotus'),
            TARGET: self.profile(TARGET, 'MoonPlayer', 'A fictional search result.', 'moon'),
        }
        self.connections = {}
        self.blocks = set()
        self.invitations = []
        self.social_calls = []
        self.hold_profile = False
        self.held_profile = None
        self.deny_accept_once = False
        self.tables = [
            {'game': 'rummy', 'code': 'ABCD1234', 'title': 'Classic Rummy', 'occupied': 1, 'capacity': 2},
            {'game': 'spades', 'code': 'DEFA5678', 'title': 'Solo Spades', 'occupied': 1, 'capacity': 4},
        ]

    @staticmethod
    def profile(user_id, name, bio, avatar):
        return {'userId': user_id, 'gamerName': name, 'bio': bio, 'avatar': avatar,
                'joinedAt': NOW - 86400000, 'updatedAt': NOW, 'nameFlagged': False,
                'relationship': 'none', 'stats': {'rummyWins': 3, 'spadesWins': 2}}

    @staticmethod
    def actor(route):
        token = route.request.headers.get('authorization', '').removeprefix('Bearer ')
        try:
            payload = token.split('.')[1]
            return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
        except (ValueError, KeyError, IndexError):
            return None

    def context(self, browser, user_id, width=1280):
        context = super().context(browser, user_id, width)
        context.route('**/clubhouse.test.invalid/**', lambda route: self.http(route, self.actor(route) or user_id))
        context.route('**/api/social**', self.social)
        context.route('**/api/rummy/**', self.game)
        context.route('**/api/spades/**', self.game)
        return context

    def http(self, route, user_id):
        if urlparse(route.request.url).path == '/auth/v1/logout':
            self.respond(route, {})
            return
        super().http(route, user_id)

    @staticmethod
    def respond(route, value, status=200):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(value))

    def relationship(self, actor, target):
        if actor == target:
            return 'self'
        if (actor, target) in self.blocks:
            return 'blocked'
        row = self.connections.get(tuple(sorted([actor, target])))
        if not row:
            return 'none'
        if row['accepted']:
            return 'friends'
        return 'outgoing' if row['sender'] == actor else 'incoming'

    def card(self, actor, target):
        return {**copy.deepcopy(self.profiles[target]), 'relationship': self.relationship(actor, target)}

    def friends(self, actor):
        out = {'friends': [], 'incoming': [], 'outgoing': [], 'blocked': []}
        for target in self.profiles:
            relation = self.relationship(actor, target)
            if relation in out:
                out[relation].append(self.card(actor, target))
        return out

    def invite_card(self, actor, invite):
        return {**copy.deepcopy(invite), 'sender': self.card(actor, invite['senderId']),
                'recipient': self.card(actor, invite['recipientId']),
                'href': f'/games/{invite["game"]}?room={invite["code"]}'}

    def invites(self, actor):
        return {'incoming': [self.invite_card(actor, row) for row in self.invitations if row['recipientId'] == actor],
                'outgoing': [self.invite_card(actor, row) for row in self.invitations if row['senderId'] == actor],
                'rooms': copy.deepcopy(self.tables) if actor == ADMIN else []}

    def apply(self, actor, command):
        operation = command['operation']
        if operation == 'profile':
            if any(profile['gamerName'].lower() == command['gamerName'].lower() and user != actor
                   for user, profile in self.profiles.items()):
                return {'error': 'That gamer name is already taken.'}, 409
            self.profiles[actor].update(gamerName=command['gamerName'], bio=command['bio'], avatar=command['avatar'], updatedAt=NOW + 1)
            return {'ok': True, 'profile': self.card(actor, actor)}, 200
        if operation in ['request', 'accept', 'decline', 'cancel', 'remove', 'block', 'unblock']:
            target = command['targetUserId'];key = tuple(sorted([actor, target]))
            if operation == 'request':
                self.connections[key] = {'sender': actor, 'accepted': False}
            elif operation == 'accept':
                self.connections[key]['accepted'] = True
            elif operation in ['decline', 'cancel', 'remove']:
                self.connections.pop(key, None)
            elif operation == 'block':
                self.blocks.add((actor, target));self.connections.pop(key, None)
                for row in self.invitations:
                    if {row['senderId'], row['recipientId']} == {actor, target}:
                        row.update(status='cancelled', available=False, reason='Player connection changed.')
            else:
                self.blocks.discard((actor, target))
            return {'ok': True, 'friends': self.friends(actor)}, 200
        if operation == 'invite':
            assert actor == ADMIN and self.relationship(actor, command['targetUserId']) == 'friends'
            assert any(table['game'] == command['game'] and table['code'] == command['code'] for table in self.tables)
            row = {'id': f'fixture-invitation-{len(self.invitations) + 1}', 'senderId': actor,
                   'recipientId': command['targetUserId'], 'game': command['game'], 'code': command['code'],
                   'createdAt': NOW, 'expiresAt': NOW + 1800000, 'status': 'pending', 'available': True, 'reason': ''}
            self.invitations.append(row)
            return {'ok': True, 'invite': self.invite_card(actor, row)}, 200
        row = next(row for row in self.invitations if row['id'] == command['inviteId'])
        if operation == 'accept_invite':
            assert row['recipientId'] == actor and row['available']
            if self.deny_accept_once:
                self.deny_accept_once = False
                row.update(available=False, reason='The table is full.')
                return {'error': 'This table is full. Refresh invitations.'}, 409
            row['status'] = 'accepted'
        elif operation == 'decline_invite':
            row.update(status='declined', available=False)
        elif operation == 'cancel_invite':
            row.update(status='cancelled', available=False)
        else:
            raise AssertionError('Unexpected operation: ' + operation)
        return {'ok': True, 'invite': self.invite_card(actor, row)}, 200

    def social(self, route):
        actor = self.actor(route)
        assert actor in self.profiles, 'Fixture requires an authenticated fictional player'
        url = urlparse(route.request.url);path = url.path
        if route.request.method == 'POST':
            command = route.request.post_data_json
            self.social_calls.append((actor, copy.deepcopy(command)))
            if command['operation'] == 'profile' and self.hold_profile:
                self.hold_profile = False;self.held_profile = (route, actor, command)
                return
            value, status = self.apply(actor, command);self.respond(route, value, status)
        elif path == '/api/social/me':
            self.respond(route, self.card(actor, actor))
        elif path == '/api/social/friends':
            self.respond(route, self.friends(actor))
        elif path == '/api/social/invites':
            self.respond(route, self.invites(actor))
        elif path == '/api/social/activity':
            self.respond(route, {'activity': []})
        elif path == '/api/social/players':
            query = parse_qs(url.query).get('q', [''])[0].lower()
            self.respond(route, {'players': [self.card(actor, target) for target in self.profiles
                if target != actor and query in self.profiles[target]['gamerName'].lower()
                and (actor, target) not in self.blocks and (target, actor) not in self.blocks]})
        elif path.startswith('/api/social/players/'):
            self.respond(route, self.card(actor, path.rsplit('/', 1)[-1]))
        else:
            self.unhandled.append(('social', path));self.respond(route, {'error': 'Unexpected fixture social request'}, 400)

    def game(self, route):
        path = urlparse(route.request.url).path
        if path == '/api/rummy/appearance':
            self.artwork(route)
        elif path.endswith('/session'):
            self.respond(route, {'member': True, 'jokers': False})
        else:
            self.unhandled.append(('game', path));self.respond(route, {'error': 'Unexpected fixture game request'}, 400)


def refresh(page):
    page.evaluate("window.dispatchEvent(new Event('focus'))")


def fitted(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')


def run(base, output):
    output.mkdir(parents=True, exist_ok=True)
    checks, errors, fixture = [], [], SocialFixture()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        ac = fixture.context(browser, ADMIN, width=390);bc = fixture.context(browser, MEMBER, width=768)
        a, b = ac.new_page(), bc.new_page()
        for page in [a, b]:
            page.on('pageerror', lambda error: errors.append(str(error)))
        a.goto(base + '/profile');expect(a.get_by_label('Gamer name', exact=True)).to_have_value('JadeAce')
        a.get_by_label('Gamer name', exact=True).fill('JadeChampion')
        a.get_by_label('About your play', exact=True).fill('A fictional profile for local UI testing.')
        a.get_by_role('radio', name='Sapphire', exact=True).check()
        a.get_by_role('button', name='Save profile', exact=True).click()
        expect(a.get_by_text('Your player profile is saved.', exact=True)).to_be_visible()
        assert fixture.profiles[ADMIN]['gamerName'] == 'JadeChampion'
        a.reload();expect(a.get_by_label('Gamer name', exact=True)).to_have_value('JadeChampion')
        a.get_by_label('Gamer name', exact=True).fill('LotusKnight');a.get_by_role('button', name='Save profile', exact=True).click()
        expect(a.get_by_role('alert')).to_have_text('That gamer name is already taken.')
        assert fixture.profiles[ADMIN]['gamerName'] == 'JadeChampion'
        a.reload();expect(a.get_by_label('Gamer name', exact=True)).to_have_value('JadeChampion')
        fitted(a);a.screenshot(path=str(output / 'profile-phone.png'), full_page=True)
        a.get_by_role('link', name='View player page', exact=True).click()
        expect(a.get_by_role('heading', name='@JadeChampion', exact=True)).to_be_visible()
        assert a.url.endswith('/players/' + ADMIN)
        checks.append('Profile edits, emblem, persistence, duplicate-name error and standalone player URL')

        a.goto(base + '/friends');a.get_by_label('Gamer name', exact=True).fill('Lotus')
        a.get_by_role('button', name='Find players', exact=True).click()
        found = a.get_by_role('article', name='Player LotusKnight', exact=True).first
        found.get_by_role('button', name='Add friend', exact=True).click()
        expect(found.get_by_role('button', name='Cancel request', exact=True)).to_be_visible()
        b.goto(base + '/friends')
        incoming = b.get_by_role('region', name='incoming connections', exact=True)
        incoming.get_by_role('button', name='Accept request', exact=True).click()
        expect(b.get_by_role('region', name='friends connections', exact=True).get_by_role('article', name='Player JadeChampion', exact=True)).to_be_visible()
        refresh(a)
        expect(a.get_by_role('region', name='friends connections', exact=True).get_by_role('article', name='Player LotusKnight', exact=True)).to_be_visible()
        checks.append('Gamer-name search, directed friend request, acceptance and both players’ lists')

        for game, code in [('rummy', 'ABCD1234'), ('spades', 'DEFA5678')]:
            a.get_by_label('Invitation table', exact=True).select_option(game + ':' + code)
            a.get_by_label('Friend to invite', exact=True).select_option(MEMBER)
            a.get_by_role('button', name='Send table invitation', exact=True).click()
            expect(a.get_by_text('Table invitation sent. Your friend can open it from Friends.', exact=True)).to_be_visible()
            refresh(b)
            card = b.locator('.social-invitation').filter(has_text=code)
            if game == 'spades':
                fixture.deny_accept_once = True
                card.get_by_role('button', name='Accept invitation', exact=True).click()
                expect(b.get_by_role('alert')).to_have_text('This table is full. Refresh invitations.')
                expect(card.get_by_role('link', name='Open table', exact=True)).to_have_count(0)
                refresh(b)
                expect(card.get_by_role('button', name='Accept invitation', exact=True)).to_be_disabled()
                # A fictional seat reopens; refreshing enables normal acceptance.
                fixture.invitations[-1].update(available=True, reason='')
                refresh(b)
                expect(card.get_by_role('button', name='Accept invitation', exact=True)).to_be_enabled()
            card.get_by_role('button', name='Accept invitation', exact=True).click()
            link = card.get_by_role('link', name='Open table', exact=True)
            expect(link).to_have_attribute('href', '/games/' + game + '?room=' + code)
            link.click()
            label = 'Room code' if game == 'rummy' else 'Spades room code'
            expect(b.get_by_label(label, exact=True)).to_have_value(code)
            name_label = 'Your name' if game == 'rummy' else 'Spades player name'
            expect(b.get_by_label(name_label, exact=True)).to_have_value('LotusKnight')
            expect(b.get_by_label(name_label, exact=True)).to_have_attribute('readonly', '')
            assert not any(command.get('operation') in ['join', 'leave'] for _, command in fixture.social_calls)
            b.goto(base + '/friends')
        checks.append('Both game invitations accept and open the proper join dialog with the recipient’s gamer name')

        b.get_by_role('region', name='friends connections', exact=True).get_by_role('button', name='Block player', exact=True).click()
        blocked = b.get_by_role('region', name='blocked connections', exact=True)
        expect(blocked.get_by_role('article', name='Player JadeChampion', exact=True)).to_be_visible()
        expect(b.get_by_role('region', name='friends connections', exact=True).get_by_role('article')).to_have_count(0)
        blocked.get_by_role('button', name='Unblock', exact=True).click()
        expect(blocked.get_by_role('article')).to_have_count(0)
        expect(b.get_by_role('region', name='friends connections', exact=True).get_by_role('article')).to_have_count(0)
        assert all(invite['status'] == 'cancelled' for invite in fixture.invitations)
        fitted(b);b.screenshot(path=str(output / 'friends-tablet.png'), full_page=True)
        checks.append('Block/unblock clears friendship and invitations without silently restoring a connection')

        a.goto(base + '/profile');expect(a.get_by_label('Gamer name', exact=True)).to_have_value('JadeChampion')
        fixture.hold_profile = True
        a.get_by_label('Gamer name', exact=True).fill('LateAliceSave');a.get_by_role('button', name='Save profile', exact=True).click()
        a.wait_for_function("document.querySelector('#gamer-name').disabled")
        assert fixture.held_profile is not None
        other_session = session(MEMBER)
        a.evaluate("""async data=>{const {supabase}=await import('/src/integrations/supabase/client.ts');await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token})}""", other_session)
        expect(a.get_by_label('Gamer name', exact=True)).to_have_value('LotusKnight')
        route, actor, command = fixture.held_profile;value, status = fixture.apply(actor, command);fixture.respond(route, value, status)
        expect(a.get_by_label('Gamer name', exact=True)).to_have_value('LotusKnight')
        expect(a.get_by_text('Your player profile is saved.', exact=True)).to_have_count(0)
        a.get_by_role('button', name='Sign out', exact=True).click()
        expect(a.get_by_role('link', name='Sign in or create an account', exact=True)).to_be_visible()
        expect(a.get_by_label('Gamer name', exact=True)).to_have_count(0)
        checks.append('A delayed save cannot overwrite another signed-in player; sign-out clears profile details')
        assert not fixture.unhandled, fixture.unhandled
        assert not errors, errors
        ac.close();bc.close();browser.close()
    print(json.dumps({'checks': checks, 'browser_errors': errors, 'real_accounts_or_messages_changed': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('--base-url', default='http://127.0.0.1:5174');parser.add_argument('--screenshots', default='test-results/social');args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('127.0.0.1', 'localhost')
    run(args.base_url.rstrip('/'), Path(args.screenshots))
