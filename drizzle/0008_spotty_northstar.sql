CREATE TABLE `monastery_requests` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`action_key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `request_id`)
);
