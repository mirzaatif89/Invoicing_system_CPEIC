-- Maker-checker role for certificate verification.
ALTER TABLE `users` MODIFY `role` ENUM('ADMIN', 'ACCOUNTANT', 'FINANCE_MANAGER', 'USER') NOT NULL DEFAULT 'USER';

-- Vendor tax profile.
ALTER TABLE `payees`
  ADD COLUMN `ntn_number` VARCHAR(100) NULL,
  ADD COLUMN `tax_status` ENUM('NORMAL', 'EXEMPT', 'REDUCED') NOT NULL DEFAULT 'NORMAL';

CREATE TABLE `vendor_tax_certificates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `vendor_id` INTEGER NOT NULL,
  `certificate_number` VARCHAR(100) NOT NULL,
  `issue_date` DATE NOT NULL,
  `valid_from` DATE NOT NULL,
  `valid_to` DATE NOT NULL,
  `applicable_rate` DECIMAL(7,4) NOT NULL,
  `certificate_file_path` VARCHAR(500) NULL,
  `status` ENUM('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  `verified_by` INTEGER NULL,
  `verified_date` DATETIME(3) NULL,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `vendor_tax_certificates_certificate_number_key`(`certificate_number`),
  INDEX `vendor_tax_certificates_vendor_id_status_valid_from_valid_to_idx`(`vendor_id`, `status`, `valid_from`, `valid_to`),
  INDEX `vendor_tax_certificates_status_valid_to_idx`(`status`, `valid_to`),
  PRIMARY KEY (`id`),
  CONSTRAINT `vendor_tax_certificates_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `payees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `vendor_tax_certificates_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Snapshot of the approved certificate/rate used when a payment line is saved.
ALTER TABLE `invoice_items`
  ADD COLUMN `applied_income_tax_rate` DECIMAL(7,4) NULL,
  ADD COLUMN `tax_certificate_id` INTEGER NULL,
  ADD INDEX `invoice_items_tax_certificate_id_idx`(`tax_certificate_id`),
  ADD CONSTRAINT `invoice_items_tax_certificate_id_fkey` FOREIGN KEY (`tax_certificate_id`) REFERENCES `vendor_tax_certificates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
