CREATE TABLE IF NOT EXISTS `admins` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `admins_username_unique` ON `admins` (`username`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`date` text NOT NULL,
	`room` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`club_id` text NOT NULL,
	`representative` text NOT NULL,
	`phone` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`override` integer NOT NULL,
	`reason` text NOT NULL,
	`inspection` integer NOT NULL,
	`entry_photo` integer DEFAULT 0 NOT NULL,
	`exit_photo` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `bookings_request_key_unique` ON `bookings` (`request_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookings_day_room` ON `bookings` (`date`,`room`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookings_club_day` ON `bookings` (`club_id`,`date`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bookings_phone` ON `bookings` (`phone`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `clubs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`room` text NOT NULL,
	`password` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `clubs_name_key_unique` ON `clubs` (`name_key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `day_events` (
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`date`, `kind`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `openings` (
	`date` text NOT NULL,
	`room` text NOT NULL,
	`is_open` integer NOT NULL,
	PRIMARY KEY(`date`, `room`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `penalties` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`points` integer NOT NULL,
	`kind` text NOT NULL,
	`source_key` text,
	`voided` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `penalty_source_unique` ON `penalties` (`source_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `penalties_club_date` ON `penalties` (`club_id`,`date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
