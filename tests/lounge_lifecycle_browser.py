"""Regression checks for lounge drafts across mocked Realtime invalidations.

Use the fictional Supabase configuration/server described in member_features_browser.py.
No real accounts, messages, or reports are created.
"""
import argparse
import json
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from member_features_browser import MEMBER, SupabaseFixture


class DelayedPermissionsFixture(SupabaseFixture):
    def __init__(self):
        super().__init__()
        self.hold_permissions = False
        self.pending_permissions = []

    def http(self, route, user_id):
        if self.hold_permissions and urlparse(route.request.url).path.endswith('/rpc/lounge_permissions'):
            self.pending_permissions.append(route)
            return
        super().http(route, user_id)

    def release_permissions(self):
        self.hold_permissions = False
        for route in self.pending_permissions:
            route.fulfill(status=200, content_type='application/json',
                          headers={'Access-Control-Allow-Origin': '*'},
                          body=json.dumps({'chat_banned': self.chat_banned, 'muted_until': self.muted_until,
                                           'name_flagged': self.flagged}))
        self.pending_permissions.clear()


def run(base_url):
    fixture = DelayedPermissionsFixture()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = fixture.context(browser, MEMBER)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base_url + '/clubhouse')
        chat = page.get_by_role('textbox', name='Send', exact=True)
        expect(chat).to_be_enabled()
        page.get_by_role('button', name='Report Original reported name', exact=True).first.click()
        report = page.get_by_role('dialog')
        reason = report.get_by_role('textbox')
        reason.fill('A report draft I am still writing')
        fixture.invalidate()
        expect(report).to_be_visible()
        expect(reason).to_have_value('A report draft I am still writing')
        # A name/content refresh must not expose a formerly visible name inside a retained dialog.
        fixture.flagged = True
        fixture.invalidate()
        expect(report).to_be_visible()
        expect(report).not_to_contain_text('Original reported name')
        report.get_by_role('button', name='Cancel', exact=True).click()

        chat.fill('My in-progress chat message')
        chat.focus()
        fixture.hold_permissions = True
        fixture.invalidate()
        expect(page.get_by_text('Checking chat access…', exact=True)).to_be_visible()
        expect(chat).to_be_focused()
        expect(chat).to_be_enabled()
        chat.press('End')
        chat.press('!')
        expect(chat).to_have_value('My in-progress chat message!')
        expect(page.get_by_role('button', name='Send', exact=True)).to_be_disabled()
        fixture.release_permissions()
        expect(page.get_by_role('button', name='Send', exact=True)).to_be_enabled()
        expect(chat).to_be_focused()

        fixture.chat_banned = True
        fixture.invalidate()
        expect(chat).to_be_disabled()
        expect(chat).to_have_value('My in-progress chat message!')
        fixture.chat_banned = False
        fixture.invalidate()
        expect(chat).to_be_enabled()
        fixture.disconnect_lounge()
        expect(chat).to_be_disabled()
        assert not errors, errors
        assert not fixture.unhandled, fixture.unhandled
        browser.close()
    print(json.dumps({'report_draft_and_name_privacy': 'passed', 'chat_focus_draft_and_permissions': 'passed', 'browser_errors': errors}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:5174')
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ('localhost', '127.0.0.1')
    run(args.base_url.rstrip('/'))
