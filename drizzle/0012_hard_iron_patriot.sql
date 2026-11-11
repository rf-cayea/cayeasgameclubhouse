CREATE TABLE `domino_requests` (
	`principal` text NOT NULL,
	`request_id` text NOT NULL,
	`payload` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`principal`, `request_id`)
);
--> statement-breakpoint
CREATE TABLE `domino_rewards` (
	`match_id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domino_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `economy_wallets` ADD `domino_points` integer DEFAULT 0 NOT NULL;