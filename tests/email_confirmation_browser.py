"""Real SDK confirmation flows with intercepted fictional Auth HTTP endpoints.
No real accounts or emails are created or sent.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
from playwright.sync_api import expect, sync_playwright
from member_features_browser import ADMIN, NOW, SupabaseFixture, session as member_session

def session(user_id):
    result = member_session(user_id)
    result['user']['email_confirmed_at'] = NOW
    return result

class Fixture(SupabaseFixture):
    def __init__(self):
        super().__init__(); self.signups = []; self.resends = []; self.verifications = []; self.exchanges = []
        self.signup_error = None; self.resend_error = None
    def http(self, route):
        request = route.request; parsed = urlparse(request.url); path = parsed.path
        body = request.post_data_json if request.post_data else {}
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version', 'X-Supabase-Api-Version': '2024-01-01'}
        def respond(data, status=200):
            route.fulfill(status=status, content_type='application/json', headers=headers, body=json.dumps(data))
        if request.method == 'OPTIONS': respond({}); return
        if path == '/auth/v1/user': respond(session(ADMIN)['user']); return
        if path == '/auth/v1/signup':
            self.signups.append({'body': body, 'query': parse_qs(parsed.query)})
            if self.signup_error:
                respond({'code': self.signup_error, 'message': 'Fixture email delivery failed'}, 400)
            else:
                respond({**session(ADMIN)['user'], 'email': body['email'], 'confirmation_sent_at': NOW, 'identities': []})
            return
        if path == '/auth/v1/resend':
            self.resends.append({'body': body, 'query': parse_qs(parsed.query)})
            if self.resend_error: respond({'code': self.resend_error, 'message': 'Fixture sending limit'}, 429)
            else: respond({})
            return
        if path == '/auth/v1/verify':
            self.verifications.append(body); respond(session(ADMIN)); return
        if path == '/auth/v1/token':
            if parse_qs(parsed.query).get('grant_type') == ['pkce']:
                self.exchanges.append(body); respond(session(ADMIN))
            else: respond({'code': 'email_not_confirmed', 'message': 'Email not confirmed'}, 400)
            return
        super().http(route, ADMIN)
    def fresh(self, browser, width=1440):
        context = browser.new_context(viewport={'width': width, 'height': 950})
        context.route('**/clubhouse.test.invalid/**', self.http)
        context.route_web_socket('wss://clubhouse.test.invalid/**', self.websocket)
        return context

parser = argparse.ArgumentParser(); parser.add_argument('--base-url', default='http://127.0.0.1:5173'); parser.add_argument('--screenshots', default='test-results/email-confirmation'); args = parser.parse_args()
assert urlparse(args.base_url).hostname in ('127.0.0.1', 'localhost')
images = Path(args.screenshots); images.mkdir(parents=True, exist_ok=True)
fixture = Fixture(); errors = []; checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = fixture.fresh(browser); page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/auth')
    page.get_by_role('button', name='New here? Create a free account', exact=True).click()
    page.get_by_label('Email', exact=True).fill('pending@example.invalid'); page.get_by_label('Password', exact=True).fill('Fictional-test-password-42')
    page.get_by_role('button', name='Create a free account', exact=True).click()
    expect(page.get_by_text('Check your inbox and spam folder.', exact=False)).to_be_visible()
    assert len(fixture.signups) == 1
    assert fixture.signups[0]['query']['redirect_to'] == [args.base_url + '/auth/confirm']
    expect(page.get_by_role('button', name='Resend in', exact=False)).to_be_disabled()
    checks.append('Signup uses explicit Site callback and starts a resend cooldown')
    context.close()

    context = fixture.fresh(browser); page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.base_url + '/auth')
    page.get_by_label('Email', exact=True).fill('pending@example.invalid')
    page.get_by_role('button', name='Resend confirmation email', exact=True).evaluate('(node) => {node.click(); node.click();}')
    expect(page.get_by_text('If your account is waiting for confirmation,', exact=False)).to_be_visible()
    assert len(fixture.resends) == 1
    assert fixture.resends[0]['body']['email'] == 'pending@example.invalid'
    assert fixture.resends[0]['body']['type'] == 'signup'
    assert fixture.resends[0]['query']['redirect_to'] == [args.base_url + '/auth/confirm']
    expect(page.get_by_role('button', name='Resend in', exact=False)).to_be_disabled()
    checks.append('Resend works without a password and rejects rapid duplicate requests')
    context.close()

    fixture.resend_error = 'over_email_send_rate_limit'
    context = fixture.fresh(browser); page = context.new_page(); page.goto(args.base_url + '/auth')
    page.get_by_label('Email', exact=True).fill('pending@example.invalid'); page.get_by_role('button', name='Resend confirmation email', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('sending limit')
    checks.append('Email quota failure is shown without claiming an email was sent')
    context.close(); fixture.resend_error = None

    fixture.signup_error = 'email_address_not_authorized'
    context = fixture.fresh(browser); page = context.new_page(); page.goto(args.base_url + '/auth')
    page.get_by_role('button', name='New here? Create a free account', exact=True).click()
    page.get_by_label('Email', exact=True).fill('pending@example.invalid'); page.get_by_label('Password', exact=True).fill('Fictional-test-password-42'); page.get_by_role('button', name='Create a free account', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('cannot send to this address')
    context.close(); fixture.signup_error = None
    checks.append('Unauthorized email delivery is distinguished from a confirmation error')

    context = fixture.fresh(browser); page = context.new_page(); page.goto(args.base_url + '/auth')
    page.get_by_label('Email', exact=True).fill('pending@example.invalid'); page.get_by_label('Password', exact=True).fill('Fictional-test-password-42'); page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('not confirmed yet')
    expect(page.get_by_role('button', name='Resend confirmation email', exact=True)).to_be_enabled()
    context.close(); checks.append('Unconfirmed sign-in offers a resend path')

    for width in [1440, 390]:
        context = fixture.fresh(browser, width); page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        count = len(fixture.verifications)
        page.goto(args.base_url + '/auth/confirm?token_hash=fictional-confirmation-hash&type=email')
        expect(page.get_by_role('heading', name='Email confirmed', exact=True)).to_be_visible()
        assert len(fixture.verifications) == count + 1, 'A single-use token was verified twice.'
        assert fixture.verifications[-1]['token_hash'] == 'fictional-confirmation-hash'
        assert fixture.verifications[-1]['type'] == 'email'
        expect(page).to_have_url(args.base_url + '/auth/confirm')
        expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(images / f'confirmed-{width}.png'), full_page=True)
        context.close()
        checks.append(f'Token-hash confirmation signs in once and clears the URL at {width}px')

        context = fixture.fresh(browser, width); page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        tokens = session(ADMIN)
        fragment = urlencode({'access_token': tokens['access_token'], 'refresh_token': tokens['refresh_token'], 'expires_in': '3600', 'token_type': 'bearer', 'type': 'signup'})
        page.goto(args.base_url + '/auth/confirm#' + fragment)
        expect(page.get_by_role('heading', name='Email confirmed', exact=True)).to_be_visible()
        expect(page).to_have_url(args.base_url + '/auth/confirm')
        context.close(); checks.append(f'Default implicit confirmation link signs in and clears tokens at {width}px')

        context = fixture.fresh(browser, width); page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.base_url + '/auth/confirm#error=access_denied&error_code=otp_expired&error_description=untrusted-description')
        expect(page.get_by_role('alert')).to_contain_text('expired or was already used')
        assert 'untrusted-description' not in page.locator('main').inner_text()
        expect(page).to_have_url(args.base_url + '/auth/confirm')
        expect(page.get_by_role('link', name='Sign in or request a new email', exact=True)).to_be_visible()
        context.close(); checks.append(f'Expired link has a safe recovery path at {width}px')

    context = fixture.fresh(browser); context.add_init_script("localStorage.setItem('sb-clubhouse-auth-token-code-verifier', JSON.stringify('fictional-code-verifier'))")
    page = context.new_page(); page.on('pageerror', lambda error: errors.append(str(error)))
    before = len(fixture.exchanges); page.goto(args.base_url + '/auth/confirm?code=fictional-code')
    expect(page.get_by_role('heading', name='Email confirmed', exact=True)).to_be_visible()
    assert len(fixture.exchanges) == before + 1
    expect(page).to_have_url(args.base_url + '/auth/confirm')
    context.close(); checks.append('PKCE return exchanges one code and clears the URL')
    browser.close()
assert not errors, errors
assert not fixture.unhandled, fixture.unhandled
print(json.dumps({'checks': checks, 'real_emails_sent': 0, 'browser_errors': errors}))
