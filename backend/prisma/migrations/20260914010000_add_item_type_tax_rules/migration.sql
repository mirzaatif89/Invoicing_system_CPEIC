CREATE TABLE `item_type_tax_rules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nature_category` ENUM('IMPORTED', 'LOCAL', 'MEDICINE', 'DISPOSABLE') NULL,
  `origin_category` ENUM('IMPORTED', 'LOCAL', 'MEDICINE', 'DISPOSABLE') NULL,
  `income_tax_percent` DECIMAL(7,4) NOT NULL DEFAULT 0,
  `sales_tax_percent` DECIMAL(7,4) NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `notes` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `item_type_tax_rules_nature_category_origin_category_key`(`nature_category`, `origin_category`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
