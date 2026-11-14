"""Local finished-table departure, replay recovery, and stale-poll regressions."""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:5173'
fixtures=json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',"""
import{newFarkle,applyFarkleMove}from'./src/lib/farkle.ts';import{newCarrom}from'./src/lib/carrom.ts';
const players=[{id:'p0',name:'Player',bot:false},{id:'p1',name:'Computer',bot:true,level:'normal'}];
const f=applyFarkleMove({...newFarkle(players),scores:[9900,1000],turnPoints:300,rolls:1},0,{t:'bank'});
const c=newCarrom(players,'disc-pool');c.phase='finished';c.winner=0;c.potted[0]=Array.from({length:9},(_,n)=>`white-${n+1}`);c.balls=c.balls.filter(v=>v.kind!=='white');
const common={code:'AB12CD34',revision:2,owner:true,status:'finished',mySeat:0,players:players.map((p,i)=>({...p,ready:true,you:i===0,occupied:true})),reward:{status:'ineligible',amount:0,tier:null,message:'Test match complete.'}};
console.log(JSON.stringify({farkle:{...common,options:{mode:'bot',seats:2,level:'normal',target:10000},state:f},carrom:{...common,options:{mode:'bot',seats:2,level:'normal',variant:'disc-pool'},state:c,shotReadyAt:0,serverTime:Date.now()}}));
"""],cwd=Path(__file__).resolve().parents[1],text=True))
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    for game in ['farkle','carrom']:
        for mode in ['normal','late-poll-error','lost-leave-reply','saved-unconfirmed-move','missing-saved-table','finished-with-unconfirmed-move']:
            context=browser.new_context(viewport={'width':390,'height':844})
            view=fixtures[game]
            state={'left':False,'hold':False,'held':[],'ids':[],'dropped':False,'new':False}
            def command(route):
                data=route.request.post_data_json
                if data['operation']=='create':
                    if state['left']:state['new']=True
                    state['left']=False
                if data['operation']=='leave':
                    if mode=='missing-saved-table':route.fulfill(status=404,json={'error':'Table not found.'});state['left']=True;return
                    state['left']=True;state['ids'].append(data['requestId'])
                    if mode=='lost-leave-reply' and not state['dropped']:
                        state['dropped']=True;route.abort('failed');return
                response={**view,'state':None,'players':[],'status':'abandoned'} if state['left'] else {**view,'code':'EF56AB78' if state['new'] else view['code']}
                route.fulfill(json={'view':response,'changed':len(state['ids'])<2})
            def read(route):
                if route.request.url.endswith('/events'):route.fulfill(status=503,json={'error':'Polling test'});return
                if mode in ['saved-unconfirmed-move','missing-saved-table'] and not state['left'] and not state['new']:
                    route.fulfill(status=404 if mode=='missing-saved-table' else 503,json={'error':'Saved table cannot reconnect.'});return
                if state['hold']:state['held'].append(route);return
                route.fulfill(json={**view,'code':'EF56AB78' if state['new'] else view['code']})
            context.route('**/api/'+game,command)
            context.route('**/api/'+game+'/room/**',read)
            if mode in ['saved-unconfirmed-move','missing-saved-table','finished-with-unconfirmed-move']:
                pending={'requestId':'11111111-1111-4111-8111-111111111111','code':view['code'],'revision':1,'operation':'move' if game=='farkle' else 'shot'}
                context.add_init_script("sessionStorage.setItem('clubhouse-"+game+":guest:room','"+view['code']+"');sessionStorage.setItem('clubhouse-"+game+":guest:uncertain',"+json.dumps(json.dumps(pending))+");")
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(BASE+'/games/'+game)
            start='Start Farkle' if game=='farkle' else 'Play Carrom'
            if mode not in ['saved-unconfirmed-move','missing-saved-table','finished-with-unconfirmed-move']:
                page.get_by_role('button',name=start,exact=True).click()
                expect(page.get_by_role('dialog')).to_be_visible()
            if mode=='finished-with-unconfirmed-move':expect(page.get_by_role('dialog')).to_be_visible()
            if mode=='late-poll-error':
                page.wait_for_timeout(150)
                state['hold']=True;page.evaluate("window.dispatchEvent(new Event('focus'))")
                page.wait_for_timeout(200);assert state['held']
            if mode in ['saved-unconfirmed-move','missing-saved-table']:
                page.get_by_role('button',name='Exit table',exact=True).click()
            else:page.get_by_role('button',name='Play another match' if game=='farkle' else 'Play again',exact=True).click()
            if mode=='lost-leave-reply':
                page.get_by_role('dialog').get_by_role('button',name='Back to game',exact=True).click()
                page.get_by_role('button',name='Retry action' if game=='farkle' else 'Retry same shot / action',exact=True).click()
                assert len(state['ids'])==2 and state['ids'][0]==state['ids'][1]
            expect(page.get_by_role('button',name=start,exact=True)).to_be_visible()
            if mode=='late-poll-error':
                state['hold']=False
                for route in state['held']:
                    try:route.fulfill(status=403,json={'error':'Old table poll failed after leaving.'})
                    except Exception:pass # A cancelled read is the correct result as well.
            page.wait_for_timeout(150)
            expect(page.get_by_role('alert')).to_have_count(0)
            assert page.evaluate("sessionStorage.getItem('clubhouse-"+game+":guest:room')") is None
            assert page.evaluate("sessionStorage.getItem('clubhouse-"+game+":guest:uncertain')") is None
            page.get_by_role('button',name=start,exact=True).click()
            expect(page.get_by_role('dialog')).to_be_visible()
            assert page.evaluate("sessionStorage.getItem('clubhouse-"+game+":guest:room')")=='EF56AB78',(game,mode,state,page.evaluate("sessionStorage.getItem('clubhouse-"+game+":guest:room')"))
            assert not errors,errors
            checks.append(game+': '+mode);context.close()
    browser.close()
print(json.dumps({'completed_table_leave':checks}))
