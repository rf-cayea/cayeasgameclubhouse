-- Cloudflare D1 schema; tables are provisioned by Sites migrations.
CREATE TABLE rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE requests(code TEXT NOT NULL, actor TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(code,actor,id));
CREATE TABLE sessions(hash TEXT PRIMARY KEY, seen INTEGER NOT NULL);
CREATE TABLE reward_outbox(match_id TEXT PRIMARY KEY,room_code TEXT NOT NULL,user_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,receipt TEXT);
CREATE TABLE spades_rooms(code TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE spades_requests(code TEXT NOT NULL,actor TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(code,actor,id));
CREATE TABLE spades_rewards(match_id TEXT PRIMARY KEY,room_code TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,receipt TEXT);
CREATE TABLE command_guards(valid INTEGER NOT NULL CONSTRAINT room_revision_matches CHECK(valid=1));
CREATE INDEX rooms_updated ON rooms(updated_at);
CREATE INDEX spades_rooms_updated ON spades_rooms(updated_at);
CREATE INDEX rummy_reward_due ON reward_outbox(status,next_attempt,lease_until);
CREATE INDEX spades_reward_due ON spades_rewards(status,next_attempt,lease_until);
CREATE TABLE api_limits(identity TEXT PRIMARY KEY,bucket INTEGER NOT NULL,count INTEGER NOT NULL);
