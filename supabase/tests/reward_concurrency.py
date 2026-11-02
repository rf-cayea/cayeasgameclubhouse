"""Real overlapping credits and conversions in the isolated local database."""
import argparse
import json
import os
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
environment = dict(os.environ)
for name in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    environment.pop(name, None)
command = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', args.container,
           'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'clubhouse_test', '-v', 'ON_ERROR_STOP=1']
user = str(uuid.uuid4())
spades_peers = [str(uuid.uuid4()) for _ in range(3)]


def query(sql):
    return subprocess.run(command, input=sql, text=True, capture_output=True, env=environment, check=True).stdout.strip()


def credit(match_id):
    result = {'version': 1, 'match_id': match_id, 'mode': 'bot', 'variant': 'classic',
              'winner_index': 0, 'completed_at': '2020-01-01T00:00:00Z', 'participants': [
                  {'user_id': user, 'bot': False, 'level': None, 'score': 105},
                  {'user_id': None, 'bot': True, 'level': 'normal', 'score': 0}]}
    return "set local role service_role; select public.credit_rummy_match('" + json.dumps(result) + "'::jsonb);"


def convert(request_id, amount):
    return f"set local role authenticated; select set_config('request.jwt.claim.sub','{user}',true); select public.convert_game_points('rummy',{amount},'{request_id}');"


def spades_credit(match_id):
    result = {'version': 1, 'match_id': match_id, 'mode': 'online', 'variant': 'teams', 'target': 500, 'winner': 0,
              'scores': [510, 400], 'completed_at': '2020-01-01T00:00:00Z',
              'players': [{'user_id': uid, 'bot': False, 'level': None} for uid in [user, *spades_peers]]}
    return "set local role service_role; select public.credit_spades_match('" + json.dumps(result) + "'::jsonb);"


def overlap(first_action, second_action, second_succeeds=True):
    processes = []
    application = 'reward-race-' + uuid.uuid4().hex
    try:
        for index, action in enumerate((first_action, second_action)):
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, env=environment)
            processes.append(process)
            process.stdin.write(f"set application_name='{application}-{index}'; begin; {action} " + ('select pg_sleep(2); ' if index == 0 else '') + 'commit;')
            process.stdin.close()
            deadline = time.monotonic() + 10
            predicate = "wait_event='PgSleep'" if index == 0 else "wait_event_type='Lock'"
            while query(f"select exists(select 1 from pg_stat_activity where application_name='{application}-{index}' and {predicate});") != 't':
                if process.poll() is not None or time.monotonic() > deadline:
                    raise AssertionError('Requests did not overlap under the expected database lock: ' + process.stderr.read())
                time.sleep(0.05)
        for process in processes:
            process.wait(timeout=15)
        assert processes[0].returncode == 0, processes[0].stderr.read()
        assert (processes[1].returncode == 0) == second_succeeds, processes[1].stderr.read()
        if not second_succeeds:
            assert 'Not enough game points' in processes[1].stderr.read()
        return [[json.loads(line) for line in process.stdout.read().splitlines() if line.startswith('{')] for process in processes]
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


try:
    query(f"insert into auth.users(id) values('{user}');")
    match_id = str(uuid.uuid4())
    first, second = overlap(credit(match_id), credit(match_id))
    assert not first[0]['already_credited'] and second[0]['already_credited']
    assert query(f"select rummy_points=70 and lifetime_points=70 from public.wallets where user_id='{user}';") == 't'
    overlap(credit(str(uuid.uuid4())), credit(str(uuid.uuid4())))
    assert query(f"select rummy_points=210 and lifetime_points=210 from public.wallets where user_id='{user}';") == 't'
    overlap(convert(str(uuid.uuid4()), 150), convert(str(uuid.uuid4()), 150), second_succeeds=False)
    request_id = str(uuid.uuid4())
    first, second = overlap(convert(request_id, 50), convert(request_id, 50))
    assert not first[0]['already_converted'] and second[0]['already_converted']
    assert query(f"select rummy_points=10 and points=140 and lifetime_points=210 from public.wallets where user_id='{user}';") == 't'
    assert query(f"select count(*) from public.point_awards where user_id='{user}';") == '3'
    assert query(f"select count(*) from public.point_conversions where user_id='{user}';") == '2'
    print('PASS: 4 overlapping reward races; duplicate wins credit once, independent wins preserve totals, conversions cannot overspend or double-debit')
    for peer in spades_peers:
        query(f"insert into auth.users(id) values('{peer}');")
    match_id = str(uuid.uuid4())
    first, second = overlap(spades_credit(match_id), spades_credit(match_id))
    assert not first[0]['already_credited'] and second[0]['already_credited']
    assert len(first[0]['user_ids']) == 2
    overlap(spades_credit(str(uuid.uuid4())), spades_credit(str(uuid.uuid4())))
    assert query(f"select spades_points=450 and rummy_points=10 and lifetime_points=660 from public.wallets where user_id='{user}';") == 't'
    assert query(f"select spades_points=450 and lifetime_points=450 from public.wallets where user_id='{spades_peers[1]}';") == 't'
    assert query(f"select spades_points=0 from public.wallets where user_id='{spades_peers[0]}';") == 't'
    purchase = f"set local role authenticated; select set_config('request.jwt.claim.sub','{user}',true); select public.purchase_store_item('spades-deck-atlas');"
    first, second = overlap(purchase, purchase)
    assert not first[0]['already_owned'] and second[0]['already_owned']
    assert query(f"select spades_points=100 and rummy_points=10 and owned=array['spades-deck-atlas']::text[] from public.wallets where user_id='{user}';") == 't'
    print('PASS: 3 Spades concurrency races; both team winners credit once, simultaneous matches preserve both wallets, duplicate cosmetic purchases charge once')
    query(f"update public.wallets set spades_points=1600 where user_id='{user}';")
    unlock = f"set local role authenticated; select set_config('request.jwt.claim.sub','{user}',true); select public.purchase_store_item('spades-partnerships');"
    first, second = overlap(unlock, unlock)
    assert first[0]['balance'] == second[0]['balance'] == 800
    assert not first[0]['already_owned'] and second[0]['already_owned']
    assert query(f"select spades_points=800 and rummy_points=10 and owned @> array['spades-partnerships']::text[] from public.wallets where user_id='{user}';") == 't'
    assert query(f"select count(*) from public.store_purchases where user_id='{user}' and item_id='spades-partnerships';") == '1'
    print('PASS: simultaneous partnership unlocks debit exactly 800 Spades points once and create one permanent ownership record')
finally:
    query(f"delete from auth.users where id='{user}';")
    for peer in spades_peers:
        query(f"delete from auth.users where id='{peer}';")
