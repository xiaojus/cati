CREATE TABLE `ai_configs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`key_cipher` text NOT NULL,
	`key_hint` text NOT NULL,
	`verified_at` text,
	`use_site_key` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `ai_parses` ADD `used_site_key` integer DEFAULT 0 NOT NULL;