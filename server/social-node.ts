import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { D1Binding, D1Statement } from './database';

// Keep Node initialization equivalent to the hosted social migration.
const SOCIAL_SCHEMA = `CREATE TABLE IF NOT EXISTS \`social_blocks\` (
	\`blocker_id\` text NOT NULL,
	\`blocked_id\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	PRIMARY KEY(\`blocker_id\`, \`blocked_id\`),
	FOREIGN KEY (\`blocker_id\`) REFERENCES \`social_profiles\`(\`user_id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`blocked_id\`) REFERENCES \`social_profiles\`(\`user_id\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "social_block_not_self" CHECK("social_blocks"."blocker_id"<>"social_blocks"."blocked_id")
);

CREATE TABLE IF NOT EXISTS \`social_friends\` (
	\`low_id\` text NOT NULL,
	\`high_id\` text NOT NULL,
	\`requester_id\` text NOT NULL,
	\`status\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	PRIMARY KEY(\`low_id\`, \`high_id\`),
	FOREIGN KEY (\`low_id\`) REFERENCES \`social_profiles\`(\`user_id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`high_id\`) REFERENCES \`social_profiles\`(\`user_id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`requester_id\`) REFERENCES \`social_profiles\`(\`user_id\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "social_friend_pair_order" CHECK("social_friends"."low_id"<"social_friends"."high_id"),
	CONSTRAINT "social_friend_status" CHECK("social_friends"."status" in ('pending','accepted')),
	CONSTRAINT "social_requester_in_pair" CHECK("social_friends"."requester_id" in ("social_friends"."low_id","social_friends"."high_id"))
);

CREATE TABLE IF NOT EXISTS \`social_invites\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`sender_id\` text NOT NULL,
	\`recipient_id\` text NOT NULL,
	\`game\` text NOT NULL,
	\`room_code\` text NOT NULL,
	\`status\` text DEFAULT 'pending' NOT NULL,
	\`created_at\` integer NOT NULL,
	\`expires_at\` integer NOT NULL,
	FOREIGN KEY (\`sender_id\`) REFERENCES \`social_profiles\`(\`user_id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`recipient_id\`) REFERENCES \`social_profiles\`(\`user_id\`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "social_invite_not_self" CHECK("social_invites"."sender_id"<>"social_invites"."recipient_id"),
	CONSTRAINT "social_invite_game" CHECK("social_invites"."game" in ('rummy','spades')),
	CONSTRAINT "social_invite_status" CHECK("social_invites"."status" in ('pending','accepted','declined','cancelled'))
);

CREATE INDEX IF NOT EXISTS \`social_invites_recipient\` ON \`social_invites\` (\`recipient_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`social_invites_sender\` ON \`social_invites\` (\`sender_id\`,\`created_at\`);
CREATE INDEX IF NOT EXISTS \`social_invite_room\` ON \`social_invites\` (\`game\`,\`room_code\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`social_invites_pair_room\` ON \`social_invites\` (\`sender_id\`,\`recipient_id\`,\`game\`,\`room_code\`);
CREATE TABLE IF NOT EXISTS \`social_profiles\` (
	\`user_id\` text PRIMARY KEY NOT NULL,
	\`gamer_name\` text NOT NULL,
	\`name_key\` text NOT NULL,
	\`bio\` text DEFAULT '' NOT NULL,
	\`avatar\` text DEFAULT 'jade' NOT NULL,
	\`name_flagged\` integer DEFAULT 0 NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	CONSTRAINT "social_profile_name_key" CHECK("social_profiles"."name_key"=lower("social_profiles"."gamer_name"))
);

CREATE UNIQUE INDEX IF NOT EXISTS \`social_profiles_name_key_unique\` ON \`social_profiles\` (\`name_key\`);`;
export function initializeSocialNode(db: DatabaseSync) { db.exec(SOCIAL_SCHEMA); }
export function nodeSocialBinding(db: DatabaseSync): D1Binding {
  return {
    prepare(sql: string): D1Statement {
      let values: SQLInputValue[] = [];
      const statement = {
        bind(...input: unknown[]) { values = input as SQLInputValue[]; return statement; },
        async first<T>() { return (db.prepare(sql).get(...values) ?? null) as T | null; },
        async run() { return db.prepare(sql).run(...values); },
        execute() { return db.prepare(sql).run(...values); },
      };
      return statement;
    },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const statement of statements) (statement as D1Statement & { execute(): unknown }).execute();
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
