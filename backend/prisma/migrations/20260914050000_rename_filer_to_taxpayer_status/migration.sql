RENAME TABLE `vendor_filer_status` TO `vendor_tax_status`;
ALTER TABLE `vendor_tax_status` MODIFY `status` ENUM('FILER','NON_FILER','ACTIVE','INACTIVE') NOT NULL, ADD COLUMN `valid_until` DATE NULL;
UPDATE `vendor_tax_status` SET `status` = IF(`status` = 'FILER', 'ACTIVE', 'INACTIVE');
ALTER TABLE `vendor_tax_status` MODIFY `status` ENUM('ACTIVE','INACTIVE') NOT NULL;
ALTER TABLE `account_codes`
  CHANGE COLUMN `income_tax_percent_company_filer` `income_tax_percent_company_active` DECIMAL(7,4) NOT NULL DEFAULT 0,
  CHANGE COLUMN `income_tax_percent_company_non_filer` `income_tax_percent_company_inactive` DECIMAL(7,4) NOT NULL DEFAULT 0,
  CHANGE COLUMN `income_tax_percent_individual_filer` `income_tax_percent_individual_active` DECIMAL(7,4) NOT NULL DEFAULT 0,
  CHANGE COLUMN `income_tax_percent_individual_non_filer` `income_tax_percent_individual_inactive` DECIMAL(7,4) NOT NULL DEFAULT 0;
