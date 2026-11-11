CREATE TABLE `rummy_appearance` (
	`principal` text PRIMARY KEY NOT NULL,
	`background` text NOT NULL,
	`table_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rummy_wins_by_user` ON `reward_outbox` (`user_id`);