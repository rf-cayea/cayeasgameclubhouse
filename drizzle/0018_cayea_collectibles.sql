CREATE TABLE `collectible_albums` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collectible_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`seller` text NOT NULL,
	`buyer` text NOT NULL,
	`give_card` text NOT NULL,
	`want_card` text,
	`price` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collectible_trade_seller` ON `collectible_trades` (`seller`,`status`);--> statement-breakpoint
CREATE INDEX `collectible_trade_buyer` ON `collectible_trades` (`buyer`,`status`);