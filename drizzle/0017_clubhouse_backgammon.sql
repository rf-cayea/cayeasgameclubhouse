CREATE TABLE `backgammon_requests` (
	`principal` text NOT NULL,
	`request_id` text NOT NULL,
	`payload` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`principal`, `request_id`)
);
--> statement-breakpoint
CREATE TABLE `backgammon_rewards` (
	`match_id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backgammon_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
