ALTER TABLE `account_codes`
  ADD COLUMN `income_tax_percent` DECIMAL(7, 4) NOT NULL DEFAULT 0,
  ADD COLUMN `sales_tax_percent` DECIMAL(7, 4) NOT NULL DEFAULT 0;
