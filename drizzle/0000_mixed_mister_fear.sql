CREATE TABLE `api_limits` (
	`identity` text PRIMARY KEY NOT NULL,
	`bucket` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_guards` (
	`valid` integer NOT NULL,
	CONSTRAINT "room_revision_matches" CHECK("command_guards"."valid"=1)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`code` text NOT NULL,
	`actor` text NOT NULL,
	`id` text NOT NULL,
	`fingerprint` text NOT NULL,
	PRIMARY KEY(`code`, `actor`, `id`)
);
--> statement-breakpoint
CREATE TABLE `reward_outbox` (
	`match_id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`receipt` text
);
--> statement-breakpoint
CREATE INDEX `rummy_reward_due` ON `reward_outbox` (`status`,`next_attempt`,`lease_until`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_updated` ON `rooms` (`updated_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spades_requests` (
	`code` text NOT NULL,
	`actor` text NOT NULL,
	`id` text NOT NULL,
	`fingerprint` text NOT NULL,
	PRIMARY KEY(`code`, `actor`, `id`)
);
--> statement-breakpoint
CREATE TABLE `spades_rewards` (
	`match_id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`receipt` text
);
--> statement-breakpoint
CREATE INDEX `spades_reward_due` ON `spades_rewards` (`status`,`next_attempt`,`lease_until`);--> statement-breakpoint
CREATE TABLE `spades_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `spades_rooms_updated` ON `spades_rooms` (`updated_at`);