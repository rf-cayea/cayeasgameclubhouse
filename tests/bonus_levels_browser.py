"""Exercise the actual rendered Faith 3 bonus boards in local Chromium.

Requires Python Playwright and /usr/bin/chromium from the prepared cloud image.
Run after starting Vite: python3 tests/bonus_levels_browser.py
These checks validate rendering and interaction, not solvability or cloud rewards.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


def symbol_of(label):
    return re.fullmatch(r"Pick (.+) tile \d+", label).group(1)


def tray_symbols(page):
    return [
        label.split(": ", 1)[1]
        for label in page.get_by_role("list", name="Tray slots", exact=True)
        .locator("li").evaluate_all("items => items.map(item => item.getAttribute('aria-label'))")
        if not label.endswith(": empty") and not label.endswith(": locked for this challenge")
    ]


parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:5173")
parser.add_argument("--results", default="/tmp/clubhouse-bonus-results.json")
args = parser.parse_args()
assert urlparse(args.base_url).hostname in ("localhost", "127.0.0.1"), "Only local app servers are supported."

sample_levels = {201, 208, 209, 240, 272, 280}
screenshot_levels = {201, 240, 280}
results = {
    "base_url": args.base_url,
    "scope": "Rendered procedural bonus boards; local practice only. No classic-layout, complete-solvability, or cloud-reward claim.",
    "levels": [],
    "browser_errors": [],
    "screenshots": [],
}

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        for name, width, height in [("desktop", 1440, 1000), ("mobile", 390, 844)]:
            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()
            page.on("pageerror", lambda error: results["browser_errors"].append(str(error)))
            response = page.goto(args.base_url + "/games/faith-3")
            assert response and response.ok
            expect(page.get_by_role("heading", name="Faith 3 Tile Match", exact=True)).to_be_visible()
            expect(page.get_by_text("Local practice · progress and points are not saved", exact=True)).to_be_visible()
            tiles = page.locator("button[aria-label^='Pick ']")
            enabled = page.locator("button[aria-label^='Pick ']:enabled")
            board = page.get_by_role("region", name="Tile board", exact=True)

            for level in range(201, 281):
                page.get_by_label("Level", exact=True).select_option(str(level))
                expect(page.get_by_role("heading", name=re.compile(rf"^Level {level} ·"))).to_be_visible()
                initial = tiles.count()
                assert initial > 0 and initial % 3 == 0, (name, level, initial)
                assert enabled.count() > 0, (name, level, "No legal opening")
                assert page.locator("button[aria-label^='Pick ']:disabled").count() > 0, (name, level, "No covering layers")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), (name, level, "Horizontal overflow")
                board.evaluate("element => element.scrollIntoView({block:'start'})")
                # Every legal button center should actually receive pointer events when in view.
                # Covered disabled buttons are intentionally allowed to overlap lower tiles.
                hit_test = enabled.evaluate_all("""buttons => buttons.map(button => {
                    const rect = button.getBoundingClientRect();
                    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
                    if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return null;
                    const hit = document.elementFromPoint(x, y);
                    return hit && (hit === button || button.contains(hit)) ? null : button.getAttribute('aria-label');
                }).filter(Boolean)""")
                assert not hit_test, (name, level, "Legal tile pointer interception", hit_test)

                if level in screenshot_levels:
                    screenshot = f"/tmp/clubhouse-bonus-{level}-{name}.png"
                    page.evaluate("window.scrollTo(0, 0)")
                    page.screenshot(path=screenshot, full_page=True)
                    results["screenshots"].append(screenshot)

                first = enabled.first
                if first.get_attribute("data-veiled"):
                    first.click()
                    expect(first).not_to_have_attribute("data-veiled", "true")
                    expect(tiles).to_have_count(initial)
                first_label = first.get_attribute("aria-label")
                page.get_by_role("button", name=first_label, exact=True).click()
                expect(tiles).to_have_count(initial - 1)
                capacity = 6 if level < 221 else 5
                expect(page.get_by_text(f"1 of {capacity} slots filled", exact=True)).to_be_visible()
                page.get_by_role("button", name="Undo · 2 left", exact=True).click()
                expect(tiles).to_have_count(initial)
                expect(page.get_by_text(f"0 of {capacity} slots filled", exact=True)).to_be_visible()
                expect(page.get_by_role("button", name=first_label, exact=True)).to_be_enabled()
                page.get_by_role("button", name="Restart level", exact=True).click()
                expect(tiles).to_have_count(initial)
                expect(page.get_by_role("button", name="Undo · 2 left", exact=True)).to_be_disabled()

                detail = {"viewport": name, "level": level, "initial_tiles": initial, "opening_undo_restart": "passed", "visible_pointer_targets": "passed"}
                if level in sample_levels:
                    page.get_by_role("button", name="Shuffle · 2 left", exact=True).click()
                    expect(tiles).to_have_count(initial)
                    expect(page.get_by_role("button", name="Shuffle · 1 left", exact=True)).to_be_enabled()
                    expect(page.locator(".faith-tile[data-frost], .faith-tile[data-seal], .faith-tile[data-veiled]")).to_have_count(0)
                    page.get_by_role("button", name="Magic clear · 3 left", exact=True).click()
                    expect(tiles).to_have_count(initial - 3)
                    expect(page.get_by_text(f"{initial - 3} tiles left · 1 triples matched", exact=True)).to_be_visible()
                    expect(page.get_by_role("button", name="Magic clear · 2 left", exact=True)).to_be_enabled()
                    # Real browser picks: prioritize a matching symbol already in the tray.
                    # This is a bounded play sample, never advertised as a complete solver.
                    moves = 0
                    for _ in range(20):
                        labels = enabled.evaluate_all("items => items.map(item => item.getAttribute('aria-label'))")
                        if not labels:
                            break
                        held = Counter(tray_symbols(page))
                        accessible = Counter(map(symbol_of, labels))
                        choice = max(labels, key=lambda label: (held[symbol_of(label)], accessible[symbol_of(label)]))
                        count_before = tiles.count()
                        page.get_by_role("button", name=choice, exact=True).click()
                        expect(tiles).to_have_count(count_before - 1)
                        moves += 1
                    detail["sample_assistance"] = "passed"
                    detail["sample_picks"] = moves
                    detail["sample_outcome"] = "lost" if page.get_by_text(re.compile("^The tray is full")).count() else "won" if page.get_by_text("Level cleared", exact=True).count() else "in_progress"
                    page.get_by_role("button", name="Restart level", exact=True).click()
                    expect(tiles).to_have_count(initial)
                results["levels"].append(detail)
            context.close()
            print(json.dumps({"viewport": name, "levels_checked": 80, "status": "passed"}), flush=True)
        browser.close()
    assert not results["browser_errors"], results["browser_errors"]
    results["status"] = "passed"
except Exception as error:
    results["status"] = "failed"
    results["failure"] = str(error)
    raise
finally:
    Path(args.results).write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")

print(json.dumps({"status": results["status"], "level_viewport_checks": len(results["levels"]), "browser_errors": results["browser_errors"], "results": args.results}), flush=True)
