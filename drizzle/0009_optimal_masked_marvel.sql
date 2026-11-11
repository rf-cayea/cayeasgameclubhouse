CREATE TABLE `gems_extended_progress` (
	`user_id` text NOT NULL,
	`level` integer NOT NULL,
	`stars` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `level`),
	FOREIGN KEY (`user_id`) REFERENCES `economy_wallets`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gems_extended_range" CHECK("gems_extended_progress"."level" between 151 and 200 and "gems_extended_progress"."stars" between 1 and 3)
);
