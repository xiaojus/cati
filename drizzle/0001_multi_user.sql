CREATE TABLE `invites` (
	`code` text PRIMARY KEY NOT NULL,
	`cat_id` text NOT NULL,
	`created_by` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`expires_at` text NOT NULL,
	`used_by` text,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`cat_id`) REFERENCES `cats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `daily_logs` ADD `updated_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `daily_logs` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `is_site_admin` integer DEFAULT 0;