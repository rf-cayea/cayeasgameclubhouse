CREATE TABLE `economy_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`cash` integer DEFAULT 0 NOT NULL,
	`label` text NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `economy_wallets`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `economy_award_source` ON `economy_ledger` (`user_id`,`source`);--> statement-breakpoint
CREATE INDEX `economy_history` ON `economy_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `economy_progress` (
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`level` integer NOT NULL,
	`stars` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `game`, `level`),
	FOREIGN KEY (`user_id`) REFERENCES `economy_wallets`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "economy_progress_range" CHECK("economy_progress"."game" in ('faith-3','3-gems') and "economy_progress"."level" between 1 and case when "economy_progress"."game"='faith-3' then 280 else 150 end and "economy_progress"."stars" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE `economy_visits` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `economy_wallets`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `economy_wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`f3_points` integer DEFAULT 0 NOT NULL,
	`gems_points` integer DEFAULT 0 NOT NULL,
	`rummy_points` integer DEFAULT 0 NOT NULL,
	`spades_points` integer DEFAULT 0 NOT NULL,
	`lifetime_points` integer DEFAULT 0 NOT NULL,
	`owned` text DEFAULT '[]' NOT NULL,
	`equipped` text DEFAULT '{}' NOT NULL,
	`pending_perks` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`import_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "economy_balances_nonnegative" CHECK("economy_wallets"."points">=0 and "economy_wallets"."f3_points">=0 and "economy_wallets"."gems_points">=0 and "economy_wallets"."rummy_points">=0 and "economy_wallets"."spades_points">=0 and "economy_wallets"."lifetime_points">=0)
);
--> statement-breakpoint
CREATE TABLE `puzzle_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`level` integer NOT NULL,
	`attempt` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`proof` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `puzzle_runs_member_game` ON `puzzle_runs` (`user_id`,`game`);