ALTER TABLE `payees`
  ADD COLUMN `vendor_type` ENUM('COMPANY', 'INDIVIDUAL') NOT NULL DEFAULT 'INDIVIDUAL';

UPDATE `payees`
SET `vendor_type` = 'COMPANY'
WHERE LOWER(`name`) REGEXP '(^|[^a-z])(pvt|private|ltd|limited)([^a-z]|$)';

ALTER TABLE `account_codes`
  ADD COLUMN `income_tax_percent_company` DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN `income_tax_percent_individual` DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN `sales_tax_percent_company` DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN `sales_tax_percent_individual` DECIMAL(7,4) NOT NULL DEFAULT 0;

UPDATE `account_codes`
SET
  `income_tax_percent_company` = COALESCE(`income_tax_percent`, 0),
  `income_tax_percent_individual` = COALESCE(`income_tax_percent`, 0),
  `sales_tax_percent_company` = COALESCE(`sales_tax_percent`, 0),
  `sales_tax_percent_individual` = COALESCE(`sales_tax_percent`, 0);

ALTER TABLE `account_codes`
  DROP COLUMN `income_tax_percent`,
  DROP COLUMN `sales_tax_percent`;

ALTER TABLE `invoice_items`
  ADD COLUMN `delivery_due_date` DATE NULL,
  ADD COLUMN `actual_delivery_date` DATE NULL,
  ADD COLUMN `manufacturing_date` DATE NULL,
  ADD COLUMN `expiry_date` DATE NULL;

CREATE TABLE `ld_penalty_slabs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `days_late_min` INTEGER NOT NULL,
  `days_late_max` INTEGER NULL,
  `penalty_percent` DECIMAL(7,4) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `notes` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `ld_penalty_slabs_active_days_late_min_idx`(`active`, `days_late_min`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shelf_life_penalty_slabs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `remaining_percent_min` DECIMAL(7,4) NOT NULL,
  `remaining_percent_max` DECIMAL(7,4) NULL,
  `penalty_percent` DECIMAL(7,4) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `notes` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `shelf_life_penalty_slabs_active_remaining_percent_min_idx`(`active`, `remaining_percent_min`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ld_penalty_slabs` (`days_late_min`, `days_late_max`, `penalty_percent`, `active`, `notes`, `updated_at`) VALUES
  (1, 7, 2.0000, true, 'Starting default: review and adjust as per institute policy', CURRENT_TIMESTAMP(3)),
  (8, 15, 5.0000, true, 'Starting default: review and adjust as per institute policy', CURRENT_TIMESTAMP(3)),
  (16, 30, 10.0000, true, 'Starting default: review and adjust as per institute policy', CURRENT_TIMESTAMP(3)),
  (31, NULL, 15.0000, true, 'Starting default: review and adjust as per institute policy', CURRENT_TIMESTAMP(3));

INSERT INTO `shelf_life_penalty_slabs` (`remaining_percent_min`, `remaining_percent_max`, `penalty_percent`, `active`, `notes`, `updated_at`) VALUES
  (75.0000, 100.0000, 0.0000, true, 'Starting default: meets shelf-life requirement', CURRENT_TIMESTAMP(3)),
  (60.0000, 75.0000, 5.0000, true, 'Starting default: review and adjust as per institute policy', CURRENT_TIMESTAMP(3)),
  (50.0000, 60.0000, 10.0000, true, 'Starting default: review and adjust as per institute policy', CURRENT_TIMESTAMP(3)),
  (0.0000, 50.0000, 20.0000, true, 'Starting default: review and adjust as per institute policy', CURRENT_TIMESTAMP(3));
