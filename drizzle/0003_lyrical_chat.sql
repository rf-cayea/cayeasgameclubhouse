CREATE TABLE `social_blocks` (
	`blocker_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocker_id`, `blocked_id`),
	FOREIGN KEY (`blocker_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blocked_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "social_block_not_self" CHECK("social_blocks"."blocker_id"<>"social_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE `social_friends` (
	`low_id` text NOT NULL,
	`high_id` text NOT NULL,
	`requester_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`low_id`, `high_id`),
	FOREIGN KEY (`low_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`high_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "social_friend_pair_order" CHECK("social_friends"."low_id"<"social_friends"."high_id"),
	CONSTRAINT "social_friend_status" CHECK("social_friends"."status" in ('pending','accepted')),
	CONSTRAINT "social_requester_in_pair" CHECK("social_friends"."requester_id" in ("social_friends"."low_id","social_friends"."high_id"))
);
--> statement-breakpoint
CREATE TABLE `social_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`game` text NOT NULL,
	`room_code` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `social_profiles`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "social_invite_not_self" CHECK("social_invites"."sender_id"<>"social_invites"."recipient_id"),
	CONSTRAINT "social_invite_game" CHECK("social_invites"."game" in ('rummy','spades')),
	CONSTRAINT "social_invite_status" CHECK("social_invites"."status" in ('pending','accepted','declined','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `social_invites_recipient` ON `social_invites` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_invites_sender` ON `social_invites` (`sender_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_invite_room` ON `social_invites` (`game`,`room_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_invites_pair_room` ON `social_invites` (`sender_id`,`recipient_id`,`game`,`room_code`);--> statement-breakpoint
CREATE TABLE `social_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`gamer_name` text NOT NULL,
	`name_key` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`avatar` text DEFAULT 'jade' NOT NULL,
	`name_flagged` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "social_profile_name_key" CHECK("social_profiles"."name_key"=lower("social_profiles"."gamer_name"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_profiles_name_key_unique` ON `social_profiles` (`name_key`);