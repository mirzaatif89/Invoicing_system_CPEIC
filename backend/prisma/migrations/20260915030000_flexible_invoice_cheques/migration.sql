ALTER TABLE `invoice_cheques`
  ADD INDEX `invoice_cheques_invoice_id_idx`(`invoice_id`),
  DROP INDEX `invoice_cheques_invoice_id_type_key`,
  ADD COLUMN `label` VARCHAR(150) NULL AFTER `type`,
  MODIFY COLUMN `type` ENUM('VENDOR', 'INCOME_TAX', 'SALES_TAX', 'OTHER') NOT NULL;

UPDATE `invoice_cheques`
SET `label` = CASE `type`
  WHEN 'VENDOR' THEN 'Vendor Payment'
  WHEN 'INCOME_TAX' THEN 'Income Tax'
  WHEN 'SALES_TAX' THEN 'Sales Tax (GST)'
  ELSE `label`
END
WHERE `label` IS NULL;
