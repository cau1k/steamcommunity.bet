CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `cheat_signal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_id` text NOT NULL,
	`provider` text NOT NULL,
	`signal` text NOT NULL,
	`value` text NOT NULL,
	`weight` integer NOT NULL,
	`confidence` text NOT NULL,
	`source_url` text,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`steam_id`) REFERENCES `steam_profile`(`steam_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cheat_signal_steam_idx` ON `cheat_signal` (`steam_id`);--> statement-breakpoint
CREATE TABLE `external_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_profile_url` text NOT NULL,
	`raw_payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`steam_id`) REFERENCES `steam_profile`(`steam_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `external_profile_steam_provider_idx` ON `external_profile` (`steam_id`,`provider`);--> statement-breakpoint
CREATE TABLE `generated_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_id` text NOT NULL,
	`source_path` text NOT NULL,
	`verdict` text NOT NULL,
	`explanation` text NOT NULL,
	`strongest_evidence` text NOT NULL,
	`missing_data` text NOT NULL,
	`provider_freshness` text NOT NULL,
	`source_links` text NOT NULL,
	`report_count` integer DEFAULT 0 NOT NULL,
	`generated_at` integer NOT NULL,
	`refreshed_at` integer NOT NULL,
	FOREIGN KEY (`steam_id`) REFERENCES `steam_profile`(`steam_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generated_report_steam_idx` ON `generated_report` (`steam_id`);--> statement-breakpoint
CREATE INDEX `generated_report_refreshed_idx` ON `generated_report` (`refreshed_at`);--> statement-breakpoint
CREATE TABLE `player_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_user_id` text NOT NULL,
	`steam_id` text NOT NULL,
	`reason` text NOT NULL,
	`match_url` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`steam_id`) REFERENCES `steam_profile`(`steam_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_report_reporter_target_idx` ON `player_report` (`reporter_user_id`,`steam_id`);--> statement-breakpoint
CREATE INDEX `player_report_steam_idx` ON `player_report` (`steam_id`);--> statement-breakpoint
CREATE TABLE `provider_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`cache_key` text NOT NULL,
	`steam_id` text,
	`payload_hash` text,
	`raw_payload` text,
	`fetch_status` text NOT NULL,
	`error_message` text,
	`fetched_at` integer NOT NULL,
	`stale_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`steam_id`) REFERENCES `steam_profile`(`steam_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_cache_provider_key_idx` ON `provider_cache` (`provider`,`cache_key`);--> statement-breakpoint
CREATE INDEX `provider_cache_steam_provider_idx` ON `provider_cache` (`steam_id`,`provider`);--> statement-breakpoint
CREATE TABLE `risk_score` (
	`steam_id` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`confidence` text NOT NULL,
	`explanation` text NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`steam_id`) REFERENCES `steam_profile`(`steam_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `steam_profile` (
	`steam_id` text PRIMARY KEY NOT NULL,
	`persona_name` text,
	`avatar_url` text,
	`profile_url` text,
	`visibility_state` integer,
	`last_seen_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `todo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL
);
