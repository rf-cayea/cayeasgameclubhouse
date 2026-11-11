"""Fictional Supabase responses; no real emails or player password changes."""
import json
from urllib.parse import urlparse,parse_qs,urlencode
from playwright.sync_api import sync_playwright,expect
from member_features_browser import session,ADMIN

def run():
 calls=[];errors=[];data=session(ADMIN);identity=data['user']
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  def context():
   ctx=b.new_context(viewport={'width':390,'height':844})
   def sdk(route):
    req=route.request;path=urlparse(req.url).path;body=req.post_data_json if req.post_data else {};calls.append((path,body,req.url))
    if path.endswith('/recover'):value={};status=200
    elif path.endswith('/verify') and body.get('token_hash')=='expired':value={'error_code':'otp_expired','code':'otp_expired','msg':'Expired'};status=403
    elif path.endswith('/verify'):value=data;status=200
    elif path.endswith('/user'):value=identity;status=200
    elif path.endswith('/logout'):value={};status=204
    else:value={};status=200
    route.fulfill(status=status,content_type='application/json',body=json.dumps(value))
   ctx.route('**/clubhouse.test.invalid/**',sdk);ctx.route('**/api/**',lambda r:r.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'Isolated account fixture'})))
   return ctx
  ctx=context();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:5174/auth');page.get_by_role('link',name='Forgot your password?',exact=True).click();page.get_by_label('Email',exact=True).fill('tester@example.invalid');page.get_by_role('button',name='Send reset email',exact=True).click();expect(page.get_by_role('button',name='Send again in 60s',exact=True)).to_be_disabled();assert any(path.endswith('/recover') and body['email']=='tester@example.invalid' and parse_qs(urlparse(url).query)['redirect_to']==['http://127.0.0.1:5174/auth/reset'] for path,body,url in calls);ctx.close()
  ctx=context();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto('http://127.0.0.1:5174/auth/reset?token_hash=test&type=recovery');expect(page.get_by_label('New password',exact=True)).to_be_visible();expect(page).to_have_url('http://127.0.0.1:5174/auth/reset');page.get_by_label('New password',exact=True).fill('new-fixture-password');page.get_by_label('Confirm new password',exact=True).fill('wrong-password');page.get_by_role('button',name='Save new password',exact=True).click();expect(page.get_by_role('alert')).to_contain_text('do not match');page.get_by_label('Confirm new password',exact=True).fill('new-fixture-password');page.get_by_role('button',name='Save new password',exact=True).click();expect(page.get_by_role('heading',name='Password updated',exact=True)).to_be_visible();assert any(path.endswith('/user') and body.get('password')=='new-fixture-password' for path,body,_ in calls);ctx.close()
  ctx=context();page=ctx.new_page();page.goto('http://127.0.0.1:5174/auth/reset?token_hash=expired&type=recovery');expect(page.get_by_role('alert')).to_contain_text('expired');expect(page.get_by_role('button',name='Send reset email',exact=True)).to_be_visible();expect(page.get_by_label('New password',exact=True)).to_have_count(0);ctx.close()
  ctx=context();page=ctx.new_page();page.goto('http://127.0.0.1:5174/auth/confirm?token_hash=test&type=recovery');expect(page.get_by_label('New password',exact=True)).to_be_visible();expect(page).to_have_url('http://127.0.0.1:5174/auth/reset');ctx.close();ctx=context();page=ctx.new_page();page.goto('http://127.0.0.1:5174/#'+urlencode({'access_token':data['access_token'],'refresh_token':data['refresh_token'],'expires_in':3600,'token_type':'bearer','type':'recovery'}));expect(page.get_by_label('New password',exact=True)).to_be_visible();expect(page).to_have_url('http://127.0.0.1:5174/auth/reset');ctx.close();b.close()
 assert not errors,errors
 print(json.dumps({'request_email':True,'site_origin_redirect':True,'password_update':True,'mismatch_and_expired_links':True,'recovery_from_confirmation_route':True,'browser_errors':errors,'real_emails_sent':False}))
if __name__=='__main__':run()
