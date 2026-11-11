CREATE TABLE `matchmaking_listings` (
	`game` text NOT NULL,
	`code` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`game`, `code`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matchmaking_owner` ON `matchmaking_listings` (`game`,`owner`);--> statement-breakpoint
CREATE INDEX `matchmaking_available` ON `matchmaking_listings` (`game`,`expires_at`);