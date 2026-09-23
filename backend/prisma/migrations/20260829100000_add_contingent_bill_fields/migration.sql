ALTER TABLE `account_codes`
  ADD COLUMN `print_fund_label` VARCHAR(250) NULL,
  ADD COLUMN `sanction_purpose_text` VARCHAR(500) NULL;

ALTER TABLE `invoice_items`
  ADD COLUMN `po_number` VARCHAR(100) NULL,
  ADD COLUMN `po_date` DATE NULL,
  ADD COLUMN `dc_number` VARCHAR(100) NULL,
  ADD COLUMN `procurement_mode` ENUM('TENDER', 'QUOTATION') NULL,
  ADD COLUMN `ld_charges` DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN `shelf_life_deduction` DECIMAL(18,2) NOT NULL DEFAULT 0;
