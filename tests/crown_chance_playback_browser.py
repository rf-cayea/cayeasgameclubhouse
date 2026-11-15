"""Local Crown & Chance playback with real engine moves and fictional guest HTTP."""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:5173'
fixture=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',"""
import{newCrownChance,applyCrownChanceMove}from'./src/lib/crown-chance.ts';
const players=[{id:'p0',name:'Player',bot:false},{id:'p1',name:'Computer',bot:true,level:'normal'}];
const before={...newCrownChance(players,'fast'),pending:200,qualified:true,available:true,dice:[2,2,0,0,0,0],claimed:[true,true,false,false,false,false]};
let after=applyCrownChanceMove(before,0,{t:'bank'});let dice=[1,2,3,4,5,6];
after=applyCrownChanceMove(after,1,{t:'roll'},()=>((dice.shift()??6)-.5)/6);
after=applyCrownChanceMove(after,1,{t:'claim',mask:63});after=applyCrownChanceMove(after,1,{t:'bank'});
console.log(JSON.stringify({before,after}));
"""],cwd=Path(__file__).resolve().parents[1],text=True))
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for width,height in [(390,844),(820,1180)]:
        for legacy in [False,True]:
            context=browser.new_context(viewport={'width':width,'height':height})
            model={'moved':False}
            before=json.loads(json.dumps(fixture['before']));after=json.loads(json.dumps(fixture['after']))
            if legacy:
                for event in after['activity']:event.pop('scores',None);event.pop('claimed',None)
            def view():
                state=after if model['moved'] else before
                return {'code':'AB12CD34','revision':2 if model['moved'] else 1,'owner':True,'status':'playing','mySeat':0,
                    'options':{'mode':'bot','seats':2,'level':'normal','length':'fast','minimum':0},'state':state,
                    'players':[{**player,'ready':True,'you':i==0,'occupied':True} for i,player in enumerate(state['players'])],
                    'reward':{'status':'ineligible','amount':0,'tier':None,'message':'Guest test'}}
            def command(route):
                data=route.request.post_data_json
                if data['operation']=='move':
                    assert data['move']=={'t':'bank'};model['moved']=True
                route.fulfill(json={'view':view(),'changed':True})
            context.route('**/api/crown-chance',command)
            context.route('**/api/crown-chance/room/**',lambda route:route.fulfill(status=503,json={'error':'Use polling'}) if route.request.url.endswith('/events') else route.fulfill(json=view()))
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(BASE+'/games/crown-chance')
            page.locator('.chance-setup-fields select').first.select_option('bot')
            page.clock.install()
            page.get_by_role('button',name='Start game',exact=True).click()
            expect(page.get_by_role('region',name='Crown & Chance playing table')).to_be_visible()
            computer=page.locator('.chance-player-scores article').nth(1)
            page.get_by_role('button',name='Bank 200',exact=True).click()
            expect(computer.locator('b')).to_have_text('0')
            for _ in range(20):
                if 'Computer is rolling' in page.locator('.chance-feedback').inner_text():break
                page.clock.run_for(100)
            expect(page.locator('.chance-feedback')).to_contain_text('Computer is rolling')
            expect(computer).to_have_attribute('data-turn','true')
            expect(computer.locator('b')).to_have_text('0')
            expect(page.get_by_role('button',name='Die 1: rolling',exact=True)).to_be_visible()
            page.clock.run_for(900)
            expect(page.locator('.chance-feedback')).to_contain_text('Computer rolled')
            expect(computer.locator('b')).to_have_text('0')
            page.get_by_role('button',name='Moves',exact=True).click()
            expect(page.get_by_role('dialog')).not_to_contain_text('Computer · Banked')
            page.get_by_role('button',name='Back to game',exact=True).click()
            page.clock.run_for(1000)
            expect(page.locator('.chance-feedback')).to_contain_text('Computer rolled')
            expect(computer.locator('b')).to_have_text('0')
            for _ in range(20):
                if 'Computer claimed' in page.locator('.chance-feedback').inner_text() or page.locator('.chance-feedback .fk-hot-callout').count():break
                page.clock.run_for(100)
            # The hot-dice claim remains visible before the bank is displayed.
            expect(computer.locator('b')).to_have_text('0')
            page.clock.run_for(900)
            expect(computer.locator('b')).to_have_text('0')
            for _ in range(30):
                if 'Computer banked' in page.locator('.chance-feedback').inner_text():break
                page.clock.run_for(100)
            expect(page.locator('.chance-feedback')).to_contain_text('Computer banked 2,000')
            expect(computer.locator('b')).to_have_text('2,000')
            page.clock.run_for(2400)
            expect(page.locator('.chance-round strong')).to_have_text('Your turn')
            expect(page.get_by_role('button',name='Roll 6 dice',exact=True)).to_be_enabled()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1')
            assert not errors,errors
            checks.append({'width':width,'legacy_history':legacy,'scores_follow_visible_bank':True})
            context.close()
    browser.close()
print(json.dumps({'computer_turn_playback':checks}))
