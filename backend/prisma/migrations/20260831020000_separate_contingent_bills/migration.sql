ALTER TABLE `invoices`
  ADD COLUMN `is_contingent` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `source_invoice_serial` INTEGER NULL,
  ADD INDEX `invoices_is_contingent_date_idx`(`is_contingent`, `date`);
