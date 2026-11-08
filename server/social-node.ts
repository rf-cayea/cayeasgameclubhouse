import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { D1Binding, D1Statement } from './database';

// Keep Node initialization equivalent to the hosted social migration.
const SOCIAL_SCHEMA = "CREATE TABLE IF NOT EXISTS `social_blocks` (\\n\\t`blocker_id` text NOT NULL,\\n\\t`blocked_id` text NOT NULL,\\n\\t`created_at` integer NOT NULL,\\n\\tPRIMARY KEY(`blocker_id`, `blocked_id`),\\n\\tFOREIGN KEY (`blocker_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,\\n\\tFOREIGN KEY (`blocked_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,\\n\\tCONSTRAINT \\\"social_block_not_self\\\" CHECK(\\\"social_blocks\\\".\\\"blocker_id\\\"<>\\\"social_blocks\\\".\\\"blocked_id\\\")\\n);\\n\\nCREATE TABLE IF NOT EXISTS `social_friends` (\\n\\t`low_id` text NOT NULL,\\n\\t`high_id` text NOT NULL,\\n\\t`requester_id` text NOT NULL,\\n\\t`status` text NOT NULL,\\n\\t`created_at` integer NOT NULL,\\n\\t`updated_at` integer NOT NULL,\\n\\tPRIMARY KEY(`low_id`, `high_id`),\\n\\tFOREIGN KEY (`low_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,\\n\\tFOREIGN KEY (`high_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,\\n\\tFOREIGN KEY (`requester_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,\\n\\tCONSTRAINT \\\"social_friend_pair_order\\\" CHECK(\\\"social_friends\\\".\\\"low_id\\\"<\\\"social_friends\\\".\\\"high_id\\\"),\\n\\tCONSTRAINT \\\"social_friend_status\\\" CHECK(\\\"social_friends\\\".\\\"status\\\" in ('pending','accepted')),\\n\\tCONSTRAINT \\\"social_requester_in_pair\\\" CHECK(\\\"social_friends\\\".\\\"requester_id\\\" in (\\\"social_friends\\\".\\\"low_id\\\",\\\"social_friends\\\".\\\"high_id\\\"))\\n);\\n\\nCREATE TABLE IF NOT EXISTS `social_invites` (\\n\\t`id` text PRIMARY KEY NOT NULL,\\n\\t`sender_id` text NOT NULL,\\n\\t`recipient_id` text NOT NULL,\\n\\t`game` text NOT NULL,\\n\\t`room_code` text NOT NULL,\\n\\t`status` text DEFAULT 'pending' NOT NULL,\\n\\t`created_at` integer NOT NULL,\\n\\t`expires_at` integer NOT NULL,\\n\\tFOREIGN KEY (`sender_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,\\n\\tFOREIGN KEY (`recipient_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,\\n\\tCONSTRAINT \\\"social_invite_not_self\\\" CHECK(\\\"social_invites\\\".\\\"sender_id\\\"<>\\\"social_invites\\\".\\\"recipient_id\\\"),\\n\\tCONSTRAINT \\\"social_invite_game\\\" CHECK(\\\"social_invites\\\".\\\"game\\\" in ('rummy','spades')),\\n\\tCONSTRAINT \\\"social_invite_status\\\" CHECK(\\\"social_invites\\\".\\\"status\\\" in ('pending','accepted','declined','cancelled'))\\n);\\n\\nCREATE INDEX IF NOT EXISTS `social_invites_recipient` ON `social_invites` (`recipient_id`,`created_at`);\\nCREATE INDEX IF NOT EXISTS `social_invites_sender` ON `social_invites` (`sender_id`,`created_at`);\\nCREATE INDEX IF NOT EXISTS `social_invite_room` ON `social_invites` (`game`,`room_code`);\\nCREATE UNIQUE INDEX IF NOT EXISTS `social_invites_pair_room` ON `social_invites` (`sender_id`,`recipient_id`,`game`,`room_code`);\\nCREATE TABLE IF NOT EXISTS `social_profiles` (\\n\\t`user_id` text PRIMARY KEY NOT NULL,\\n\\t`gamer_name` text NOT NULL,\\n\\t`name_key` text NOT NULL,\\n\\t`bio` text DEFAULT '' NOT NULL,\\n\\t`avatar` text DEFAULT 'jade' NOT NULL,\\n\\t`name_flagged` integer DEFAULT 0 NOT NULL,\\n\\t`created_at` integer NOT NULL,\\n\\t`updated_at` integer NOT NULL,\\n\\tCONSTRAINT \\\"social_profile_name_key\\\" CHECK(\\\"social_profiles\\\".\\\"name_key\\\"=lower(\\\"social_profiles\\\".\\\"gamer_name\\\"))\\n);\\n\\nCREATE UNIQUE INDEX IF NOT EXISTS `social_profiles_name_key_unique` ON `social_profiles` (`name_key`);";
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
