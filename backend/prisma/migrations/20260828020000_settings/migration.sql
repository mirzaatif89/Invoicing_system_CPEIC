CREATE TABLE `settings` (
  `key` VARCHAR(100) NOT NULL,
  `value` VARCHAR(500) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
