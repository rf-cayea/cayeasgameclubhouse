CREATE TABLE `economy_allowances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_cash` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`applied_at` integer,
	CONSTRAINT "economy_allowance_target" CHECK("economy_allowances"."target_cash" between 0 and 2000000000)
);
--> statement-breakpoint
CREATE INDEX `economy_allowances_member` ON `economy_allowances` (`user_id`,`applied_at`);
--> statement-breakpoint
