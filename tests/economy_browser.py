"""Profile, achievement and currency UI with fictional, intercepted member APIs.

Run against dummy-config Vite5174. Real accounting/security is tested separately
against the local Node API and production-equivalent Worker/D1 adapters.
"""
import argparse
import copy
import json
import math
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from social_browser import SocialFixture, ADMIN, MEMBER, session, NOW

POINT_FIELDS = {'faith-3': 'f3_points', '3-gems': 'gems_points', 'rummy': 'rummy_points', 'spades': 'spades_points', 'five-dice': 'dice_points'}
ACHIEVEMENTS = [
    {'id': 'faith-clear-1', 'name': 'First Light', 'description': 'Clear one Faith 3 level.', 'group': 'faith-3', 'icon': 'lotus', 'tier': 'bronze', 'stat': 'faithLevels', 'goal': 1, 'reward': 50, 'currency': 'f3_points', 'progress': 1, 'unlocked': True, 'claimed': False, 'claimedAt': None},
    {'id': 'gems-clear-15', 'name': 'Courtyard Restorer', 'description': 'Clear fifteen different 3 Gems levels.', 'group': '3-gems', 'icon': 'gem', 'tier': 'silver', 'stat': 'gemsLevels', 'goal': 15, 'reward': 200, 'currency': 'gems_points', 'progress': 3, 'unlocked': False, 'claimed': False, 'claimedAt': None},
    {'id': 'rummy-victory-1', 'name': 'First Victory', 'description': 'Win one verified full Rummy+ match.', 'group': 'rummy', 'icon': 'cards', 'tier': 'bronze', 'stat': 'rummyWins', 'goal': 1, 'reward': 100, 'currency': 'rummy_points', 'progress': 1, 'unlocked': True, 'claimed': True, 'claimedAt': NOW},
    {'id': 'spades-victory-5', 'name': 'Table Regular', 'description': 'Win five verified full Spades matches.', 'group': 'spades', 'icon': 'spade', 'tier': 'silver', 'stat': 'spadesWins', 'goal': 5, 'reward': 250, 'currency': 'spades_points', 'progress': 2, 'unlocked': False, 'claimed': False, 'claimedAt': None},
    {'id': 'member-profile-1', 'name': 'Make Yourself at Home', 'description': 'Choose a personal gamer name and add a profile bio.', 'group': 'clubhouse', 'icon': 'emblem', 'tier': 'bronze', 'stat': 'profileComplete', 'goal': 1, 'reward': 50, 'currency': 'points', 'progress': 1, 'unlocked': True, 'claimed': False, 'claimedAt': None},
]
CATALOG = [
    {'id': 'rummy-jokers', 'name': 'Joker Mode', 'price': 400, 'currency': 'rummy_points', 'slot': None},
    {'id': 'spades-partnerships', 'name': 'Spades Partnerships', 'price': 400, 'currency': 'spades_points', 'slot': None},
    {'id': 'faith3-skin-celestial', 'name': 'Moonlit Celestial', 'price': 300, 'currency': 'points', 'slot': 'faith3_skin'},
    {'id': 'faith3-skin-jade', 'name': 'Jade Sanctuary', 'price': 450, 'currency': 'points', 'slot': 'faith3_skin'},
    {'id': 'faith3-skin-rose', 'name': 'Rose Quartz', 'price': 600, 'currency': 'points', 'slot': 'faith3_skin'},
] + [{'id': f'spades-{slot}-{theme}', 'name': name, 'price': price, 'currency': 'spades_points', 'slot': f'spades_{slot}'}
     for slot, rows in [('table', [('atlas', 'Moonlit Observatory', 500), ('ember', 'Rosewood Parlour', 650), ('grove', 'Emerald Conservatory', 800), ('deco', 'Gilded Grand Hall', 950)]),
                        ('deck', [('atlas', 'Midnight Atlas', 350), ('ember', 'Ember Crown', 500), ('grove', 'Verdant Grove', 650), ('deco', 'Ivory Deco', 800)])]
     for theme, name, price in rows]


for badge in ACHIEVEMENTS:
    badge['cashReward'] = badge['reward'] if badge['currency'] == 'points' else max(5, round(badge['reward'] * 2 / 13))
for item in CATALOG:
    if item['slot'] == 'spades_deck': item['price'] = 300
    item['cashPrice'] = item['price'] if item['currency'] == 'points' else math.ceil(item['price'] * 10 / 13)

class EconomyFixture(SocialFixture):
    def __init__(self):
        super().__init__()
        self.roles[ADMIN] = None
        self.wallets[ADMIN].update(points=900, f3_points=100, gems_points=195, spades_points=500, lifetime_points=9000)
        self.wallets[MEMBER].update(points=5, f3_points=10, gems_points=20, rummy_points=30, spades_points=40, lifetime_points=100)
        self.achievements = {user: copy.deepcopy(ACHIEVEMENTS) for user in [ADMIN, MEMBER]}
        self.history = {user: [] for user in [ADMIN, MEMBER]}
        self.conversions, self.economy_calls = {}, []
        self.fail_conversion = False
        self.ambiguous_conversion = False
        self.hold_conversion = False
        self.held_conversion = None

    def context(self, browser, user_id, width=1280):
        context = super().context(browser, user_id, width)
        context.route('**/api/economy**', self.economy)
        return context

    def view(self, user):
        return {'wallet': copy.deepcopy(self.wallets[user]), 'sources': ['faith3:level:1', 'rummy:win:fictional-match'], 'humanWinSources': [],
                'stats': {'faithLevels': 1, 'faithChapters': 0, 'gemsLevels': 3, 'gemsStars': 8, 'gemsChapters': 0,
                          'rummyWins': 1, 'rummyHumanWins': 0, 'rummyHardWins': 0, 'spadesWins': 2, 'spadesHumanWins': 0, 'spadesHardWins': 0, 'diceWins': 0, 'diceHumanWins': 0, 'diceHardWins': 0,
                          'lifetime': self.wallets[user]['lifetime_points'], 'cosmetics': len(self.wallets[user]['owned']),
                          'friends': 0, 'memberDays': 3, 'visits': 2, 'profileComplete': 1, 'gamesPlayed': 4},
                'achievements': copy.deepcopy(self.achievements[user]), 'history': copy.deepcopy(self.history[user]),
                'progress': {'faith-3': {'levels': [1], 'stars': {}, 'unlocked': 2}, '3-gems': {'levels': [1, 2, 3], 'stars': {'1': 3, '2': 3, '3': 2}, 'unlocked': 4}},
                'conversionRate': {'points': 13, 'cash': 10}}

    def apply_economy(self, actor, command):
        operation = command['operation'];wallet = self.wallets[actor]
        receipt = {'type': operation, 'alreadyApplied': False}
        if operation == 'convert':
            if self.fail_conversion:
                self.fail_conversion = False
                return {'error': 'Fixture conversion denied; your balance is unchanged.'}, 409
            key = (actor, command['requestId'])
            if key in self.conversions:
                return {'ok': True, **self.view(actor), 'receipt': {**self.conversions[key], 'alreadyApplied': True}}, 200
            quantity = command['amount'];field = POINT_FIELDS[command['game']]
            assert quantity > 0 and quantity % 13 == 0 and wallet[field] >= quantity
            wallet[field] -= quantity;wallet['points'] += quantity // 13 * 10
            receipt.update(type='conversion', amount=quantity, cash=quantity // 13 * 10, currency=field)
            self.conversions[key] = copy.deepcopy(receipt)
            self.history[actor].insert(0, {'id': command['requestId'], 'source': 'conversion:' + command['requestId'], 'kind': 'conversion', 'label': 'Converted game points', 'currency': field, 'amount': -quantity, 'cash': quantity // 13 * 10, 'createdAt': NOW})
            if self.ambiguous_conversion:
                self.ambiguous_conversion = False
                return {'error': 'Fixture connection lost after commit; retry to confirm.'}, 503
        elif operation == 'claim_achievement':
            badge = next(row for row in self.achievements[actor] if row['id'] == command['achievementId'])
            assert badge['unlocked']
            receipt.update(type='achievement', achievementId=badge['id'], amount=badge['reward'], currency=badge['currency'], alreadyApplied=badge['claimed'])
            if not badge['claimed']:
                wallet[badge['currency']] += badge['reward'];wallet['lifetime_points'] += badge['reward']
                if badge['currency'] != 'points':
                    wallet['points'] += badge['cashReward'];wallet['lifetime_points'] += badge['cashReward']
                badge.update(claimed=True, claimedAt=NOW)
                self.history[actor].insert(0, {'id': badge['id'], 'source': 'badge:' + badge['id'], 'kind': 'achievement', 'label': badge['name'], 'currency': badge['currency'], 'amount': badge['reward'], 'cash': 0, 'createdAt': NOW})
        elif operation == 'purchase':
            item = next(item for item in CATALOG if item['id'] == command['itemId'])
            already = item['id'] in wallet['owned']
            if not already:
                assert wallet[item['currency']] >= item['price']
                wallet[item['currency']] -= item['price'];wallet['owned'].append(item['id'])
            receipt.update(type='purchase', itemId=item['id'], amount=item['price'], currency=item['currency'], alreadyApplied=already)
        elif operation == 'equip':
            assert command['itemId'] in wallet['owned'] or command['itemId'].endswith('-classic')
            wallet['equipped'][command['slot']] = command['itemId']
            receipt.update(type='equip', itemId=command['itemId'])
        elif operation != 'check_in':
            raise AssertionError('Unexpected fixture economy operation: ' + operation)
        return {'ok': True, **self.view(actor), 'receipt': receipt}, 200

    def economy(self, route):
        path = urlparse(route.request.url).path
        if path == '/api/economy/catalog':
            self.respond(route, {'items': CATALOG});return
        actor = self.actor(route)
        assert actor in self.wallets, 'Fixture requires a verified fictional member'
        if route.request.method == 'POST':
            command = route.request.post_data_json;self.economy_calls.append((actor, copy.deepcopy(command)))
            if command['operation'] == 'convert' and self.hold_conversion:
                self.hold_conversion = False;self.held_conversion = (route, actor, command);return
            value, status = self.apply_economy(actor, command);self.respond(route, value, status)
        elif path.startswith('/api/economy/players/'):
            target = path.rsplit('/', 1)[-1];view = self.view(target)
            self.respond(route, {'userId': target, 'lifetimePoints': view['wallet']['lifetime_points'], 'stats': view['stats'], 'badges': [badge for badge in view['achievements'] if badge['claimed']], 'achievements': [badge for badge in view['achievements'] if badge['claimed']]})
        elif path == '/api/economy':
            self.respond(route, self.view(actor))
        else:
            self.unhandled.append(('economy', path));self.respond(route, {'error': 'Unexpected fixture economy endpoint'}, 400)


def fitted(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Page has horizontal overflow'


def run(base, output):
    output.mkdir(parents=True, exist_ok=True)
    checks, errors, fixture = [], [], EconomyFixture()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = fixture.context(browser, ADMIN, width=390)
        page, other = context.new_page(), context.new_page()
        for tab in [page, other]: tab.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/profile')
        expect(page.get_by_test_id('profile-cash-balance')).to_have_text('900')
        for key, amount in [('faith-3', '100'), ('3-gems', '195'), ('rummy', '1,000'), ('spades', '500')]:
            expect(page.locator(f'[data-game-balance="{key}"]')).to_have_text(amount)
        fitted(page);page.screenshot(path=str(output / 'profile-rewards-phone.png'), full_page=False, animations='disabled')
        checks.append('Profile shows private Cash plus independent balances for all four games')

        page.goto(base + '/rewards');other.goto(base + '/rewards')
        amount = page.get_by_role('spinbutton', name='Points to convert', exact=True)
        game = page.get_by_role('combobox', name='Conversion game', exact=True)
        convert = page.get_by_role('button', name='Convert to Cash', exact=True)
        for invalid in ['0', '-10', '11', '1000000']:
            amount.fill(invalid);expect(convert).to_be_disabled()
        game.select_option('3-gems');amount.fill('91');convert.click()
        expect(page.get_by_role('dialog')).to_contain_text('70 Clubhouse Cash')
        page.get_by_role('button', name='Cancel', exact=True).click();assert not fixture.conversions
        convert.click();page.get_by_role('button', name='Confirm conversion', exact=True).click()
        expect(page.get_by_test_id('gems-balance').first).to_have_text('104')
        expect(page.get_by_test_id('cash-balance').first).to_have_text('970')
        expect(other.get_by_test_id('gems-balance').first).to_have_text('104')
        expect(other.get_by_test_id('cash-balance').first).to_have_text('970')
        assert fixture.wallets[ADMIN]['lifetime_points'] == 9000
        checks.append('3 Gems converts13→10 with preview/cancel and updates same-account tabs without increasing lifetime earnings')

        fixture.ambiguous_conversion = True
        amount.fill('104');convert.click();page.get_by_role('button', name='Confirm conversion', exact=True).click()
        expect(page.get_by_role('alert').filter(has_text='retry to confirm')).to_be_visible()
        expect(page.get_by_test_id('gems-balance').first).to_have_text('0')
        page.get_by_role('button', name='Confirm conversion', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(page.get_by_test_id('cash-balance').first).to_have_text('1,050')
        conversions = [command for _, command in fixture.economy_calls if command['operation'] == 'convert']
        assert conversions[-1]['requestId'] == conversions[-2]['requestId'] and len(fixture.conversions) == 2
        checks.append('An ambiguous committed conversion retries its original ID even after the game balance reaches zero')

        # Achievement controls are scoped by badge ID so duplicate tier names stay unambiguous.
        first_light = page.locator('[data-achievement-id="faith-clear-1"]')
        expect(first_light).to_be_visible()
        first_light.get_by_role('button', name='Claim', exact=False).click()
        expect(page.get_by_test_id('faith-balance').first).to_have_text('150')
        assert fixture.achievements[ADMIN][0]['claimed']
        page.reload();expect(page.get_by_test_id('faith-balance').first).to_have_text('150')
        assert sum(1 for _, command in fixture.economy_calls if command.get('achievementId') == 'faith-clear-1') == 1
        fitted(page);page.set_viewport_size({'width': 768, 'height': 1024});fitted(page)
        page.screenshot(path=str(output / 'rewards-tablet.png'), full_page=False, animations='disabled')
        checks.append('Claimable game milestones award the matching points once and retain their earned badge after reload')

        page.goto(base + '/players/' + ADMIN)
        expect(page.get_by_role('heading', name='@JadeAce', exact=True)).to_be_visible()
        expect(page.get_by_text('First Light', exact=True)).to_be_visible()
        expect(page.get_by_test_id('cash-balance')).to_have_count(0)
        expect(page.get_by_role('spinbutton', name='Points to convert')).to_have_count(0)
        checks.append('Standalone player pages show earned badges while keeping Cash, balances and conversion private')

        page.goto(base + '/rewards');game = page.get_by_role('combobox', name='Conversion game', exact=True)
        game.select_option('rummy');amount = page.get_by_role('spinbutton', name='Points to convert', exact=True);amount.fill('13')
        fixture.hold_conversion = True
        page.get_by_role('button', name='Convert to Cash', exact=True).click();page.get_by_role('button', name='Confirm conversion', exact=True).click()
        page.wait_for_function("document.querySelector('dialog[open] button').disabled")
        assert fixture.held_conversion is not None
        page.evaluate("""async data=>{const {supabase}=await import('/src/integrations/supabase/client.ts');await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token})}""", session(MEMBER))
        expect(page.get_by_test_id('cash-balance').first).to_have_text('5')
        route, actor, command = fixture.held_conversion
        value, status = fixture.apply_economy(actor, command);fixture.respond(route, value, status)
        expect(page.get_by_test_id('cash-balance').first).to_have_text('5')
        expect(page.get_by_test_id('rummy-balance').first).to_have_text('30')
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.get_by_role('button', name='Sign out', exact=True).click()
        expect(page.get_by_test_id('cash-balance')).to_have_count(0)
        checks.append('Account switching clears prior private balances and ignores a delayed previous-account conversion response')
        assert not fixture.unhandled, fixture.unhandled
        assert not errors, errors
        context.close()
        # An interrupted conversion made before the rate update retains its old receipt.
        old_fixture = EconomyFixture()
        old_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        old_fixture.conversions[(ADMIN, old_id)] = {'type': 'conversion', 'alreadyApplied': False, 'amount': 10, 'cash': 7, 'currency': 'rummy_points'}
        old_context = old_fixture.context(browser, ADMIN, width=390)
        old_context.add_init_script("sessionStorage.setItem('clubhouse-pending-conversion:" + ADMIN + "',JSON.stringify({id:'" + old_id + "',game:'rummy',amount:10}))")
        old_page = old_context.new_page();old_page.on('pageerror', lambda error: errors.append(str(error)))
        old_page.goto(base + '/rewards')
        old_page.get_by_role('button', name='Confirm pending conversion', exact=True).click()
        expect(old_page.get_by_role('dialog')).to_contain_text('Convert 10 points?')
        old_page.get_by_role('button', name='Confirm conversion', exact=True).click()
        expect(old_page.get_by_role('dialog')).to_have_count(0)
        expect(old_page.get_by_test_id('cash-balance')).to_have_text('900')
        expect(old_page.get_by_test_id('rummy-balance')).to_have_text('1,000')
        checks.append('A saved pre-upgrade10-point conversion confirms its original7Cash receipt without a new debit')
        assert not errors, errors
        old_context.close();browser.close()
    print(json.dumps({'checks': checks, 'browser_errors': errors, 'production_accounts_or_wallets_changed': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser();parser.add_argument('--base-url', default='http://127.0.0.1:5174');parser.add_argument('--screenshots', default='test-results/economy');args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ['127.0.0.1', 'localhost']
    run(args.base_url.rstrip('/'), Path(args.screenshots))
