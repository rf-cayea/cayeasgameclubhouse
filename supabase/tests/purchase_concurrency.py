"""Exercise a real overlapping duplicate purchase in the isolated local Docker database."""
import argparse
import json
import os
import subprocess
import time
import uuid


parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
parser.add_argument('--database', default='clubhouse_test')
parser.add_argument('--faith-skin', action='store_true')
args = parser.parse_args()
item = 'faith3-skin-celestial' if args.faith_skin else 'rummy-jokers'
currency = 'points' if args.faith_skin else 'rummy_points'
price = 300 if args.faith_skin else 800
environment = dict(os.environ)
for selector in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    environment.pop(selector, None)
command = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', args.container,
           'psql', '-X', '-qAt', '-U', 'postgres', '-d', args.database, '-v', 'ON_ERROR_STOP=1']
user_id = str(uuid.uuid4())
application = 'clubhouse-concurrent-' + uuid.uuid4().hex


def query(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, env=environment, check=True)
    return result.stdout.strip()


first = second = None
try:
    query(f"insert into auth.users(id) values ('{user_id}'); "
          f"update public.wallets set {currency}={price * 2} where user_id='{user_id}';")
    first_sql = f"""
set application_name='{application}-first';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','{user_id}',true);
select public.purchase_store_item('{item}');
select pg_sleep(4);
commit;
"""
    first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, env=environment)
    first.stdin.write(first_sql)
    first.stdin.close()
    # Verify that the first connection holds its wallet lock before starting the
    # second request. Waiting here is part of the race test, not startup guessing.
    deadline = time.monotonic() + 10
    while query(f"select exists(select 1 from pg_stat_activity where application_name='{application}-first' and wait_event='PgSleep');") != 't':
        if first.poll() is not None or time.monotonic() > deadline:
            raise AssertionError('The first purchase did not hold its transaction open.')
        time.sleep(0.05)
    second_sql = f"""
set application_name='{application}-second';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','{user_id}',true);
select public.purchase_store_item('{item}');
commit;
"""
    second = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, env=environment)
    second.stdin.write(second_sql)
    second.stdin.close()
    deadline = time.monotonic() + 10
    while query(f"select exists(select 1 from pg_stat_activity where application_name='{application}-second' and wait_event_type='Lock');") != 't':
        if second.poll() is not None or time.monotonic() > deadline:
            raise AssertionError('The overlapping purchase did not wait for the wallet row lock.')
        time.sleep(0.05)
    first.wait(timeout=15)
    second.wait(timeout=15)
    assert first.returncode == second.returncode == 0, (first.stderr.read(), second.stderr.read())
    first_result = next(json.loads(line) for line in first.stdout.read().splitlines() if line.startswith('{'))
    second_result = next(json.loads(line) for line in second.stdout.read().splitlines() if line.startswith('{'))
    assert first_result['already_owned'] is False and first_result['balance'] == price
    assert second_result['already_owned'] is True and second_result['balance'] == price
    assert query(f"select {currency}={price} and owned=array['{item}']::text[] from public.wallets where user_id='{user_id}';") == 't'
    assert query(f"select count(*) from public.store_purchases where user_id='{user_id}';") == '1'
    print(f'PASS: 5 concurrency assertions; overlapping {item} purchases serialize, debit {price} {currency} once, and create one ownership record')
finally:
    for process in (first, second):
        if process and process.poll() is None:
            process.kill()
            process.wait(timeout=5)
    query(f"delete from auth.users where id='{user_id}';")
