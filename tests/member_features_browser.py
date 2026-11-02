"""Browser integration against explicitly mocked Supabase HTTP/Realtime APIs.

Start a separate local Vite server with public, fictional configuration:
  VITE_SUPABASE_URL=https://clubhouse.test.invalid \
  VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npm run dev -- --port 5174 --strictPort
Then: python3 tests/member_features_browser.py

All requests to the fictional project are intercepted. These checks validate
browser behavior, not deployed database permissions; run the SQL tests too.
"""
import argparse
import base64
import copy
import json
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

ADMIN = "11111111-1111-4111-8111-111111111111"
MEMBER = "22222222-2222-4222-8222-222222222222"
TARGET = "33333333-3333-4333-8333-333333333333"
POST = "44444444-4444-4444-8444-444444444444"
CHAT = "55555555-5555-4555-8555-555555555555"
REPORT_HIDE = "66666666-6666-4666-8666-666666666666"
REPORT_NAME = "77777777-7777-4777-8777-777777777777"
REPORT_ERROR = "88888888-8888-4888-8888-888888888888"
NOW = datetime.now(timezone.utc).isoformat()
LIVE_NAME = "Original reported name"
POST_BODY = "This is the reported post body."
CHAT_BODY = "A visible chat message from this player."


def session(user_id):
    """A fictional JWT/session accepted only by intercepted fixture endpoints."""
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    expires = int(time.time()) + 3600
    user = {"id": user_id, "aud": "authenticated", "role": "authenticated",
            "email": "fixture@example.invalid", "created_at": NOW,
            "app_metadata": {}, "user_metadata": {}}
    token = encode({"alg": "HS256", "typ": "JWT"}) + "." + encode({
        "sub": user_id, "aud": "authenticated", "role": "authenticated", "exp": expires,
    }) + ".fictional-test-signature"
    return {"access_token": token, "refresh_token": "fictional-test-refresh-token",
            "token_type": "bearer", "expires_in": 3600, "expires_at": expires, "user": user}


class SupabaseFixture:
    def __init__(self):
        self.roles = {ADMIN: "admin", MEMBER: None}
        self.wallets = {
            user: {"points": 0, "f3_points": 0, "rummy_points": 1000,
                   "lifetime_points": 1000, "owned": [], "equipped": {}, "pending_perks": {}}
            for user in (ADMIN, MEMBER)
        }
        self.posts = [{"id": POST, "user_id": TARGET, "author_name": LIVE_NAME,
                       "body": POST_BODY, "created_at": NOW}]
        self.chat = [{"id": CHAT, "user_id": TARGET, "author_name": LIVE_NAME,
                      "body": CHAT_BODY, "created_at": NOW}]
        self.flagged = False
        self.chat_banned = False
        self.muted_until = None
        self.failed_action = False
        self.calls = []
        self.unhandled = []
        self.sockets = []
        self.sequence = 0
        self.realtime_available = True
        self.reports = [self.report(REPORT_HIDE, "post", POST, "Hide this reported post"),
                        self.report(REPORT_NAME, "player", None, "Review this display name"),
                        self.report(REPORT_ERROR, "chat", CHAT, "Exercise action error handling")]

    @staticmethod
    def report(report_id, context, context_id, reason):
        return {"id": report_id, "reported_user_id": TARGET, "reporter_id": MEMBER,
                "context": context, "context_id": context_id, "reason": reason,
                "evidence": {"author_name": LIVE_NAME, "body": POST_BODY if context == "post" else CHAT_BODY if context == "chat" else None,
                             "created_at": NOW, "user_id": TARGET, "context": context, "context_id": context_id},
                "status": "pending", "created_at": NOW, "resolved_at": None,
                "resolved_by": None, "resolution": None}

    def invalidate(self):
        self.sequence += 1
        for entry in list(self.sockets):
            if entry["closed"]:
                continue
            for topic, subscription in list(entry["topics"].items()):
                if not subscription["ids"]:
                    continue
                entry["ws"].send(json.dumps([subscription["join_ref"], None, topic, "postgres_changes", {
                    "ids": subscription["ids"], "data": {
                        "schema": "public", "table": "clubhouse_invalidations", "type": "INSERT",
                        "commit_timestamp": NOW, "columns": [],
                        "record": {"id": self.sequence, "created_at": NOW}, "old_record": {},
                    },
                }]))

    def websocket(self, ws):
        entry = {"ws": ws, "topics": {}, "closed": False}
        self.sockets.append(entry)

        def received(raw):
            message = json.loads(raw)
            if isinstance(message, list):
                join_ref, reference, topic, event, payload = message
            else:
                join_ref, reference, topic, event, payload = (message.get(key) for key in ("join_ref", "ref", "topic", "event", "payload"))
            if event == "phx_join":
                if not self.realtime_available and ":lounge-" in topic:
                    ws.send(json.dumps([join_ref, reference, topic, "phx_reply", {
                        "status": "error", "response": {"message": "Fixture moderation stream is disconnected"},
                    }]))
                    return
                filters = payload.get("config", {}).get("postgres_changes", [])
                bindings = [{**value, "id": i + 1} for i, value in enumerate(filters)]
                entry["topics"][topic] = {"join_ref": join_ref, "ids": [value["id"] for value in bindings]}
                reply = {"status": "ok", "response": {"postgres_changes": bindings}}
            elif event == "phx_leave":
                entry["topics"].pop(topic, None)
                reply = {"status": "ok", "response": {}}
            elif event == "heartbeat":
                reply = {"status": "ok", "response": {}}
            else:
                return
            ws.send(json.dumps([join_ref, reference, topic, "phx_reply", reply]))

        ws.on_message(received)

    def disconnect_lounge(self):
        self.realtime_available = False
        for entry in self.sockets:
            for topic, subscription in list(entry["topics"].items()):
                if ":lounge-" in topic:
                    entry["ws"].send(json.dumps([subscription["join_ref"], None, topic, "phx_error", {}]))

    def context(self, browser, user_id, width=1280):
        context = browser.new_context(viewport={"width": width, "height": 950})
        context.add_init_script("localStorage.setItem('sb-clubhouse-auth-token', " + json.dumps(json.dumps(session(user_id))) + ");")
        context.route("**/clubhouse.test.invalid/**", lambda route: self.http(route, user_id))
        context.route_web_socket(re.compile(r"^wss://clubhouse\.test\.invalid/"), self.websocket)
        return context

    def http(self, route, user_id):
        request = route.request
        path = urlparse(request.url).path
        try:
            body = request.post_data_json if request.post_data else {}
        except (ValueError, TypeError):
            body = {}
        self.calls.append((user_id, path, copy.deepcopy(body)))
        headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"}

        def respond(value, status=200):
            route.fulfill(status=status, content_type="application/json", headers=headers, body=json.dumps(value))

        if request.method == "OPTIONS":
            respond({})
        elif path == "/auth/v1/user":
            respond(session(user_id)["user"])
        elif path == "/rest/v1/wallets":
            respond([self.wallets[user_id]])
        elif path == "/rest/v1/point_awards":
            respond([])
        elif path == "/rest/v1/store_catalog":
            if 'spades-partnerships' in request.url:
                respond({"id": "spades-partnerships", "name": "Spades Partnerships", "price": 800, "currency": "spades_points"})
            else:
                respond({"id": "rummy-jokers", "name": "Joker Mode", "price": 800, "currency": "rummy_points"})
        elif path == "/rest/v1/rpc/moderation_role":
            respond(self.roles[user_id])
        elif path == "/rest/v1/rpc/moderation_reports":
            if not self.roles[user_id]:
                respond({"message": "Moderator access required", "code": "42501"}, 403)
            else:
                rows = [row for row in self.reports if row["status"] == body["_status"]]
                respond(rows[body["_offset"]:body["_offset"] + body["_limit"]])
        elif path == "/rest/v1/rpc/moderate_report":
            if self.failed_action:
                self.failed_action = False
                respond({"message": "Fixture action was denied; no changes saved", "code": "42501"}, 403)
                return
            if not self.roles[user_id]:
                respond({"message": "Moderator access required", "code": "42501"}, 403)
                return
            report = next(row for row in self.reports if row["id"] == body["_report_id"])
            if report["status"] != "pending" and body.get("_expected_resolved_at") != report["resolved_at"]:
                respond({"message": "This report changed. Refresh the queue before another action.", "code": "40001"}, 409)
                return
            action = body["_action"]
            if action == "hide_content":
                self.posts = [post for post in self.posts if post["id"] != report["context_id"]]
                self.chat = [chat for chat in self.chat if chat["id"] != report["context_id"]]
            elif action in ("flag_name", "reset_name"):
                self.flagged = True
            elif action == "ban_chat":
                self.chat_banned = True
            elif action == "mute_chat":
                self.muted_until = datetime.fromtimestamp(time.time() + 86400, timezone.utc).isoformat()
            elif action == "unmute_chat":
                self.muted_until = None
            elif action == "unban_chat":
                self.chat_banned = False
            report.update(status="dismissed" if action == "dismiss" else "resolved", resolved_at=datetime.now(timezone.utc).isoformat(),
                          resolved_by=user_id, resolution=body["_note"])
            respond({"status": report["status"], "action": action, "report_id": report["id"]})
            self.invalidate()
        elif path == "/rest/v1/rpc/lounge_feed":
            rows = copy.deepcopy(self.posts if body["_kind"] == "post" else self.chat)
            if self.flagged:
                for row in rows:
                    row["author_name"] = "Player"
            respond(rows)
        elif path == "/rest/v1/rpc/lounge_permissions":
            respond({"chat_banned": self.chat_banned, "muted_until": self.muted_until, "name_flagged": self.flagged})
        elif path == "/rest/v1/rpc/friend_activity":
            respond([])
        elif path == "/rest/v1/rpc/submit_player_report":
            # A database INSERT can invalidate/rebuild the reported row before
            # the submit RPC's HTTP response reaches its original component.
            self.invalidate()
            respond("99999999-9999-4999-8999-999999999999")
        elif path == "/rest/v1/rpc/purchase_store_item":
            wallet = self.wallets[user_id]
            if "rummy-jokers" in wallet["owned"]:
                respond({"item_id": "rummy-jokers", "owned": True, "already_owned": True,
                         "balance": wallet["rummy_points"], "currency": "rummy_points", "price": 800})
            elif wallet["rummy_points"] < 800:
                respond({"message": "Not enough Rummy+ points", "code": "P0001"}, 400)
            else:
                wallet["rummy_points"] -= 800
                wallet["owned"].append("rummy-jokers")
                respond({"item_id": "rummy-jokers", "owned": True, "already_owned": False,
                         "balance": wallet["rummy_points"], "currency": "rummy_points", "price": 800})
        else:
            self.unhandled.append((request.method, path))
            respond({"message": "Unexpected fixture request: " + path}, 501)


def run(base_url):
    fixture = SupabaseFixture()
    checks = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        member_context = fixture.context(browser, MEMBER)
        admin_context = fixture.context(browser, ADMIN)
        member = member_context.new_page()
        admin = admin_context.new_page()
        for page in (member, admin):
            page.on("pageerror", lambda error: errors.append(str(error)))

        member.goto(base_url + "/moderation")
        expect(member.get_by_role("heading", name="Moderator access required", exact=True)).to_be_visible()
        expect(member.get_by_role("button", name="Hide content", exact=True)).to_have_count(0)
        assert not any(user == MEMBER and path.endswith("moderation_reports") for user, path, _ in fixture.calls)
        checks.append("ordinary member cannot open report queue")

        member.goto(base_url + "/clubhouse")
        expect(member.get_by_text(POST_BODY, exact=True)).to_be_visible(timeout=10000)
        expect(member.get_by_text(CHAT_BODY, exact=True)).to_be_visible()
        checks.append("sanitized lounge loads after Realtime subscription")

        member.get_by_role("button", name="Report " + LIVE_NAME, exact=True).first.click()
        report_dialog = member.get_by_role("dialog")
        report_dialog.get_by_label("Report about", exact=True).select_option("player")
        report_dialog.get_by_role("textbox").fill("Please review this player's display name")
        report_dialog.get_by_role("button", name="Send report", exact=True).click()
        expect(report_dialog).to_have_count(0)
        expect(member.get_by_text("Report sent. A moderator can now review its evidence.", exact=True)).to_be_visible()
        expect(member.get_by_text(POST_BODY, exact=True)).to_be_visible()
        submissions = [body for user, path, body in fixture.calls if user == MEMBER and path.endswith("submit_player_report")]
        assert submissions == [{"_reported_user_id": TARGET, "_context": "player", "_context_id": None,
                                "_reason": "Please review this player's display name"}], submissions
        chat_section = member.locator("section").filter(has=member.get_by_role("heading", name=re.compile("Lounge chat")))
        chat_section.get_by_role("button", name="Report " + LIVE_NAME, exact=True).click()
        report_dialog = member.get_by_role("dialog")
        expect(report_dialog.get_by_label("Report about", exact=True)).to_have_value("chat")
        report_dialog.get_by_role("textbox").fill("Please review this chat message")
        report_dialog.get_by_role("button", name="Send report", exact=True).click()
        expect(report_dialog).to_have_count(0)
        expect(member.get_by_text("Report sent. A moderator can now review its evidence.", exact=True)).to_be_visible()
        submissions = [body for user, path, body in fixture.calls if user == MEMBER and path.endswith("submit_player_report")]
        assert submissions[-1] == {"_reported_user_id": TARGET, "_context": "chat", "_context_id": CHAT,
                                   "_reason": "Please review this chat message"}, submissions
        checks.append("player-name and content reports preserve submission confirmation across server invalidation without client-trusted evidence")

        admin.goto(base_url + "/moderation")
        expect(admin.get_by_text("Hide this reported post", exact=True)).to_be_visible()
        expect(admin.locator("blockquote")).to_have_count(2)
        post_report = admin.get_by_role("article").filter(has_text="Hide this reported post")
        expect(post_report.get_by_text(POST_BODY, exact=True)).to_be_visible()
        checks.append("admin sees captured report evidence")

        error_report = admin.get_by_role("article").filter(has_text="Exercise action error handling")
        fixture.failed_action = True
        error_report.get_by_role("button", name="Hide content", exact=True).click()
        dialog = admin.get_by_role("dialog")
        dialog.get_by_label("Review note", exact=True).fill("Attempt the action with a denied response")
        dialog.get_by_role("button", name="Confirm hide content", exact=True).click()
        expect(dialog.get_by_role("alert")).to_have_text("Fixture action was denied; no changes saved")
        assert next(report for report in fixture.reports if report["id"] == REPORT_ERROR)["status"] == "pending"
        dialog.get_by_role("button", name="Cancel", exact=True).click()
        checks.append("failed moderation preserves pending report and exposes error")

        post_report.get_by_role("button", name="Hide content", exact=True).click()
        dialog = admin.get_by_role("dialog")
        expect(dialog.get_by_role("button", name="Confirm hide content", exact=True)).to_be_disabled()
        dialog.get_by_label("Review note", exact=True).fill("Reviewed captured evidence and hid the post")
        dialog.get_by_role("button", name="Confirm hide content", exact=True).click()
        expect(admin.get_by_text("Hide this reported post", exact=True)).to_have_count(0)
        expect(member.get_by_text(POST_BODY, exact=True)).to_have_count(0, timeout=5000)
        checks.append("confirmed hide removes content across an already-open lounge")

        name_report = admin.get_by_role("article").filter(has_text="Review this display name")
        name_report.get_by_role("button", name="Hide display name", exact=True).click()
        dialog = admin.get_by_role("dialog")
        dialog.get_by_label("Review note", exact=True).fill("Mask this display name pending a suitable replacement")
        dialog.get_by_role("button", name="Confirm hide display name", exact=True).click()
        expect(member.get_by_text(LIVE_NAME, exact=True)).to_have_count(0, timeout=5000)
        expect(member.get_by_text(CHAT_BODY, exact=True)).to_be_visible()
        expect(member.get_by_text("Player", exact=True)).to_be_visible()
        admin.get_by_role("button", name="Resolved", exact=True).click()
        expect(admin.get_by_role("article").filter(has_text="Review this display name").get_by_text(LIVE_NAME, exact=True)).to_be_visible()
        checks.append("name mask updates live lounge while immutable evidence stays visible to admin")

        reviewed_report = admin.get_by_role("article").filter(has_text="Hide this reported post")
        resolved_at = next(row for row in fixture.reports if row["id"] == REPORT_HIDE)["resolved_at"]
        reviewed_report.get_by_role("button", name="Mute chat for 24 hours", exact=True).click()
        dialog = admin.get_by_role("dialog")
        dialog.get_by_label("Review note", exact=True).fill("Also mute this player after reviewing the hidden post")
        dialog.get_by_role("button", name="Confirm mute chat for 24 hours", exact=True).click()
        expect(dialog).to_have_count(0)
        latest_action = [body for user, path, body in fixture.calls if user == ADMIN and path.endswith("moderate_report")][-1]
        assert latest_action["_action"] == "mute_chat" and latest_action["_expected_resolved_at"] == resolved_at, latest_action
        expect(member.get_by_role("textbox", name="Send", exact=True)).to_be_disabled()
        updated_stamp = next(row for row in fixture.reports if row["id"] == REPORT_HIDE)["resolved_at"]
        assert updated_stamp != resolved_at
        reviewed_report.get_by_role("button", name="Remove chat mute", exact=True).click()
        dialog = admin.get_by_role("dialog")
        dialog.get_by_label("Review note", exact=True).fill("Remove the mute after a follow-up review")
        dialog.get_by_role("button", name="Confirm remove chat mute", exact=True).click()
        expect(dialog).to_have_count(0)
        latest_action = [body for user, path, body in fixture.calls if user == ADMIN and path.endswith("moderate_report")][-1]
        assert latest_action["_action"] == "unmute_chat" and latest_action["_expected_resolved_at"] == updated_stamp, latest_action
        expect(member.get_by_role("textbox", name="Send", exact=True)).to_be_enabled()
        checks.append("reviewed reports support further mute and unmute actions using the latest review timestamp")

        fixture.muted_until = datetime.fromtimestamp(time.time() + 86400, timezone.utc).isoformat()
        fixture.invalidate()
        expect(member.get_by_text(re.compile(r"^Chat is muted until"))).to_be_visible()
        expect(member.get_by_role("textbox", name="Send", exact=True)).to_be_disabled()
        fixture.muted_until = None
        fixture.chat_banned = True
        fixture.invalidate()
        expect(member.get_by_text("Your chat access has been banned.", exact=True)).to_be_visible()
        expect(member.get_by_role("textbox", name="Send", exact=True)).to_be_disabled()
        fixture.chat_banned = False
        fixture.invalidate()
        expect(member.get_by_role("textbox", name="Send", exact=True)).to_be_enabled()
        checks.append("Realtime permission changes disable chat for timed mute and ban, then re-enable on removal")

        fixture.disconnect_lounge()
        expect(member.get_by_text(CHAT_BODY, exact=True)).to_have_count(0)
        expect(member.get_by_text(re.compile(r"Live moderation updates are disconnected")).first).to_be_visible()
        checks.append("Realtime disconnect clears visible lounge content until moderation updates reconnect")

        member.goto(base_url + "/store")
        unlock = member.get_by_role("button", name="Unlock Joker Mode · 800 points", exact=True)
        expect(unlock).to_be_enabled()
        unlock.click()
        purchase_dialog = member.get_by_role("dialog")
        expect(purchase_dialog.get_by_role("heading", name="Unlock Joker Mode?", exact=True)).to_be_visible()
        purchase_dialog.get_by_role("button", name="Confirm unlock", exact=True).click()
        expect(member.get_by_role("button", name="Joker Mode owned", exact=True)).to_be_visible()
        assert fixture.wallets[MEMBER]["rummy_points"] == 200
        purchases = [body for user, path, body in fixture.calls if user == MEMBER and path.endswith("purchase_store_item")]
        assert purchases == [{"_item_id": "rummy-jokers"}], purchases
        checks.append("Joker Mode purchase sends only item ID and deducts exactly 800 points")

        fixture.wallets[ADMIN]["rummy_points"] = 799
        admin.goto(base_url + "/store")
        expect(admin.get_by_role("button", name="Unlock Joker Mode · 800 points", exact=True)).to_be_disabled()
        checks.append("799 points cannot unlock Joker Mode")

        assert not fixture.unhandled, fixture.unhandled
        assert not errors, errors
        member.screenshot(path="/tmp/clubhouse-member-store.png", full_page=True)
        admin.goto(base_url + "/moderation")
        expect(admin.get_by_text("Exercise action error handling", exact=True)).to_be_visible()
        admin.screenshot(path="/tmp/clubhouse-moderation-panel.png", full_page=True)
        admin.set_viewport_size({"width": 390, "height": 844})
        assert admin.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Mobile moderation page overflows"
        admin.screenshot(path="/tmp/clubhouse-moderation-mobile.png", full_page=True)
        admin.get_by_role("article").filter(has_text="Exercise action error handling").get_by_role("button", name="Hide content", exact=True).click()
        mobile_dialog = admin.get_by_role("dialog")
        expect(mobile_dialog.get_by_label("Review note", exact=True)).to_be_visible()
        assert mobile_dialog.evaluate("element => element.scrollWidth <= element.clientWidth"), "Mobile moderation dialog overflows"
        admin.screenshot(path="/tmp/clubhouse-moderation-dialog-mobile.png", full_page=True)
        mobile_dialog.get_by_role("button", name="Cancel", exact=True).click()
        checks.append("moderation queue and confirmation dialog fit a 390-pixel mobile viewport")
        browser.close()
    result = {"mode": "intercepted Supabase HTTP and Realtime fixtures, no deployed backend",
              "passed_checks": checks, "uncaught_browser_errors": errors,
              "unhandled_fixture_requests": fixture.unhandled}
    with open("/tmp/clubhouse-member-results.json", "w") as handle:
        json.dump(result, handle, indent=2)
    print(json.dumps(result))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:5174")
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ("localhost", "127.0.0.1"), "Fixture checks target only a local server."
    run(args.base_url.rstrip("/"))
