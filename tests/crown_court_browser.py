"""Crown & Court: production Worker, real guest rooms, mobile geometry and complete play."""
import argparse,json,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8811');base=parser.parse_args().base_url.rstrip('/')
assert urlparse(base).hostname in ('127.0.0.1','localhost')
out=Path('/tmp/crown-court-qa');out.mkdir(exist_ok=True)
SIZES=[(320,568),(375,667),(390,844),(768,1024),(1024,768),(844,390),(568,320)]
def fit(page,selector):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1')
    assert page.locator(selector).evaluate_all('(els)=>els.every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.x>=-1&&r.right<=innerWidth+1&&r.y>=-1&&r.bottom<=innerHeight+1})'),page.viewport_size

def active_fit(page):
    fit(page,'.cc-die,.cc-score-row,.cc-section-tabs>button,.fd-score-confirm>.fd-primary')
    players=page.locator('.cc-players').bounding_box();dice=page.locator('.fd-dice-row').bounding_box();feed=page.locator('.fd-turn-feed').bounding_box();roll=page.locator('.fd-roll-controls').bounding_box()
    assert players['y']+players['height']<=dice['y']+1,('players/dice overlap',page.viewport_size)
    assert dice['y']+dice['height']<=feed['y']+1,('dice/feed overlap',page.viewport_size)
    assert feed['y']+feed['height']<=roll['y']+1,('feed/roll overlap',page.viewport_size)

def skip_until(page,button):
    until=time.monotonic()+15
    while not (button.count() and button.is_enabled()) and time.monotonic()<until:
        skip=page.get_by_role('button',name='Skip opponent animation')
        if skip.is_visible():skip.click()
        page.wait_for_timeout(75)
    expect(button).to_be_enabled()

with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    errors=[];contexts=[]
    def player():
        c=b.new_context(viewport={'width':390,'height':844});contexts.append(c);page=c.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:errors.append(str(e)));return page
    page=player();page.goto(base+'/games/crown-court');expect(page.get_by_role('button',name='Start a match',exact=True)).to_be_enabled()
    for w,h in SIZES:
        page.set_viewport_size({'width':w,'height':h});fit(page,'.cc-lengths button,.fd-setup-fields input,.fd-setup-fields select,.multiplayer-start-actions>*');page.screenshot(path=str(out/f'setup-{w}x{h}.png'))
    page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Long 21 turns A + B + C',exact=True).click();page.get_by_label('Computer difficulty').select_option('hard');page.get_by_role('button',name='Start a match',exact=True).click();expect(page.locator('.cc-live')).to_be_visible()
    expect(page.get_by_role('tab')).to_have_count(3);roll=page.get_by_role('button',name='Roll five poker dice',exact=True);expect(roll).to_be_enabled();roll.click()
    roll2=page.get_by_role('button',name='Roll again · 2 left',exact=True);expect(roll2).to_be_enabled()
    die=page.locator('.cc-die').first;original=die.get_attribute('aria-label');die.click();expect(die).to_have_attribute('aria-pressed','true');roll2.click();roll3=page.get_by_role('button',name='Roll again · 1 left',exact=True);expect(roll3).to_be_enabled();assert original.split(': ')[1].split(',')[0] in die.get_attribute('aria-label');die.click();expect(die).to_have_attribute('aria-pressed','false');roll3.click();expect(page.locator('.cc-score-row:not(:disabled)')).to_have_count(7);expect(die).to_be_disabled()
    for w,h in SIZES:
        page.set_viewport_size({'width':w,'height':h})
        for section in ['A Poker Hands','B Court Tally','C Royal Trials']:
            page.get_by_role('tab',name=section,exact=False).click();active_fit(page);expect(page.locator('.cc-score-row')).to_have_count(7);assert page.locator('.cc-score-row .cc-score-values>b').count()==14
        page.screenshot(path=str(out/f'long-{w}x{h}.png'))
    page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Crown & Court rules').click();expect(page.get_by_role('dialog')).to_contain_text('three Queens, Kings, or Aces');expect(page.get_by_role('dialog')).to_contain_text('exact patterns');page.get_by_role('button',name='Back to game',exact=True).click();page.get_by_role('button',name='Moves',exact=True).click();expect(page.locator('.fd-move-history li')).to_have_count(5);page.get_by_role('button',name='Back to game',exact=True).click()
    print(json.dumps({'computer':'hard','rankFaces':True,'releaseAfterSecondRoll':True,'rollLimit':True,'layouts':len(SIZES),'sections':3}),flush=True)
    # Real online 4-player table, invitation join, ready/start, and live score columns.
    host=player();host.goto(base+'/games/crown-court');host.get_by_role('button',name='Online friends',exact=True).click();host.get_by_label('Online players',exact=True).select_option('4');host.get_by_role('button',name='Long 21 turns A + B + C',exact=True).click();host.get_by_label('Player name',exact=True).fill('Crown QA Host');host.get_by_role('button',name='Create a private table',exact=False).click();lobby=host.get_by_role('region',name='Crown & Court multiplayer lobby');expect(lobby).to_be_visible();code=host.locator('.multiplayer-room-code strong').inner_text();host.evaluate('navigator.clipboard.writeText=async text=>{window.copiedInvite=text}');host.get_by_role('button',name='Copy invitation',exact=True).click();assert host.evaluate('window.copiedInvite')==base+'/games/crown-court?room='+code
    peers=[]
    for n in range(1,4):
        peer=player();peers.append(peer);peer.goto(base+'/games/crown-court?room='+code);peer.get_by_label('Join player name',exact=True).fill(f'Court Player {n}');peer.get_by_role('button',name='Join table',exact=True).click();expect(peer.get_by_role('region',name='Crown & Court multiplayer lobby')).to_be_visible();peer.get_by_role('button',name='Ready to play',exact=True).click()
    expect(host.get_by_role('button',name='Start match',exact=True)).to_be_enabled();host.get_by_role('button',name='Start match',exact=True).click();expect(host.locator('.cc-player')).to_have_count(4)
    for w,h in SIZES:
        host.set_viewport_size({'width':w,'height':h});host.get_by_role('tab',name='C Royal Trials',exact=False).click();active_fit(host);expect(host.locator('.cc-score-row .cc-score-values>b')).to_have_count(28);host.screenshot(path=str(out/f'four-player-{w}x{h}.png'))
    host.set_viewport_size({'width':390,'height':844});host.get_by_role('tab',name='A Poker Hands',exact=False).click();host.get_by_role('button',name='Roll five poker dice',exact=True).click();expect(host.locator('.cc-score-row:not(:disabled)')).to_have_count(7);host.locator('.cc-score-row').first.click();expect(host.locator('.fd-score-confirm button')).to_be_enabled();host.locator('.fd-score-confirm button').click()
    nextroll=peers[0].get_by_role('button',name='Roll five poker dice',exact=True);skip_until(peers[0],nextroll);expect(peers[0].locator('.cc-score-row').first.locator('.cc-score-values>b').first).to_have_attribute('data-filled','true');nextroll.click();expect(peers[0].locator('.cc-score-row:not(:disabled)')).to_have_count(7)
    print(json.dumps({'onlinePlayers':4,'invitation':True,'readyStart':True,'liveOtherPlayerScore':True,'freeAllSeats':True}),flush=True)
    # Finish all seven real short turns through the UI, showing opponent playback.
    short=player();short.goto(base+'/games/crown-court');short.get_by_role('button',name='Start a match',exact=True).click();expect(short.locator('.cc-live')).to_be_visible()
    for i in range(7):
        roll=short.get_by_role('button',name='Roll five poker dice',exact=True);skip_until(short,roll);roll.click();rows=short.locator('.cc-score-row:not(:disabled)');expect(rows).to_have_count(7-i);rows.first.click();short.locator('.fd-score-confirm button').click()
        if i<6:
            until=time.monotonic()+12
            while not (short.get_by_role('button',name='Roll five poker dice',exact=True).count() and short.get_by_role('button',name='Roll five poker dice',exact=True).is_enabled()) and time.monotonic()<until:
                skip=short.get_by_role('button',name='Skip opponent animation')
                if skip.is_visible():skip.click()
                short.wait_for_timeout(75)
    until=time.monotonic()+12
    while not short.get_by_role('dialog').is_visible() and time.monotonic()<until:
        skip=short.get_by_role('button',name='Skip opponent animation')
        if skip.is_visible():skip.click()
        short.wait_for_timeout(75)
    expect(short.get_by_role('dialog')).to_be_visible();expect(short.locator('.fd-result-ranks>div')).to_have_count(2);short.screenshot(path=str(out/'results.png'));expect(short.get_by_role('dialog')).to_contain_text('Guest games are free');short.get_by_role('button',name='Create or join another table',exact=True).click();expect(short.get_by_role('button',name='Start a match',exact=True)).to_be_enabled()
    print(json.dumps({'completedRealShortMatch':True,'results':True,'newMatch':True,'browserErrors':errors}),flush=True)
    assert not errors,errors
    for c in contexts:c.close()
    b.close()
