CREATE TABLE `gems_monastery` (
	`user_id` text PRIMARY KEY NOT NULL,
	`completed_tasks` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "monastery_task_range" CHECK("gems_monastery"."completed_tasks" between 0 and 50)
);
