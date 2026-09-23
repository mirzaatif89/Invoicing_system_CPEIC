CREATE TABLE `vendor_filer_status` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payee_id` INTEGER NOT NULL,
  `status` ENUM('FILER', 'NON_FILER') NOT NULL,
  `effective_from` DATE NOT NULL,
  `notes` VARCHAR(300) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `vendor_filer_status_payee_id_effective_from_key` (`payee_id`, `effective_from`),
  INDEX `vendor_filer_status_payee_id_effective_from_idx` (`payee_id`, `effective_from`),
  CONSTRAINT `vendor_filer_status_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE `account_codes`
  ADD COLUMN `income_tax_percent_company_filer` DECIMAL(7,4) NULL,
  ADD COLUMN `income_tax_percent_company_non_filer` DECIMAL(7,4) NULL,
  ADD COLUMN `income_tax_percent_individual_filer` DECIMAL(7,4) NULL,
  ADD COLUMN `income_tax_percent_individual_non_filer` DECIMAL(7,4) NULL;
UPDATE `account_codes` SET
  `income_tax_percent_company_filer` = `income_tax_percent_company`,
  `income_tax_percent_company_non_filer` = `income_tax_percent_company`,
  `income_tax_percent_individual_filer` = `income_tax_percent_individual`,
  `income_tax_percent_individual_non_filer` = `income_tax_percent_individual`;
ALTER TABLE `account_codes`
  MODIFY `income_tax_percent_company_filer` DECIMAL(7,4) NOT NULL DEFAULT 0,
  MODIFY `income_tax_percent_company_non_filer` DECIMAL(7,4) NOT NULL DEFAULT 0,
  MODIFY `income_tax_percent_individual_filer` DECIMAL(7,4) NOT NULL DEFAULT 0,
  MODIFY `income_tax_percent_individual_non_filer` DECIMAL(7,4) NOT NULL DEFAULT 0;
