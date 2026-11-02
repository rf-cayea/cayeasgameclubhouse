#!/usr/bin/env bash
set -euo pipefail

# Runs only against a fresh, network-isolated container. No Supabase secrets,
# host ports, bind mounts, or production database URL are used.
test_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
postgres_image='postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b'
container_name="clubhouse-sql-${BASHPID}-${RANDOM}"
log_directory="$(mktemp -d /tmp/clubhouse-sql.XXXXXX)"
container_started=0

local_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}

cleanup() {
  if [ "$container_started" -eq 1 ]; then
    local_docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$log_directory"
}
trap cleanup EXIT

local_docker info --format '{{.ServerVersion}}' >/dev/null
local_docker run --detach --rm --network none --name "$container_name" \
  --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=clubhouse_test \
  "$postgres_image" postgres -c wal_level=logical >/dev/null
container_started=1

ready=0
for _ in $(seq 1 60); do
  # The official image starts a temporary Unix-socket server during initdb.
  # TCP on loopback becomes ready only after initialization and final startup.
  if local_docker exec "$container_name" pg_isready -h 127.0.0.1 -U postgres -d clubhouse_test >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  local_docker logs "$container_name" >&2
  exit 1
fi

run_sql() {
  local sql_file="$1"
  if local_docker exec -i "$container_name" psql -X -q -U postgres -d clubhouse_test -v ON_ERROR_STOP=1 \
      < "$sql_file" > "$log_directory/sql.log" 2>&1; then
    # Only the assertions print PASS lines; setup/migration success is silent.
    if [[ "$sql_file" == *'/moderation_store.sql' || "$sql_file" == *'/rewards.sql' || "$sql_file" == *'/spades.sql' || "$sql_file" == *'/spades_partnerships.sql' ]]; then
      rg '^PASS:' "$log_directory/sql.log"
    fi
  else
    local sql_status=$?
    cat "$log_directory/sql.log" >&2
    exit "$sql_status"
  fi
}

run_sql "$test_root/supabase/tests/local_auth_bootstrap.sql"
for migration in "$test_root"/supabase/migrations/*.sql; do
  run_sql "$migration"
done
run_sql "$test_root/supabase/tests/moderation_store.sql"
run_sql "$test_root/supabase/tests/rewards.sql"
run_sql "$test_root/supabase/tests/spades.sql"
run_sql "$test_root/supabase/tests/spades_partnerships.sql"
python3 "$test_root/supabase/tests/purchase_concurrency.py" --container "$container_name"
python3 "$test_root/supabase/tests/reward_concurrency.py" --container "$container_name"
