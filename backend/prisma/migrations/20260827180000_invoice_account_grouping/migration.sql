ALTER TABLE `invoices`
  DROP FOREIGN KEY `invoices_payee_id_fkey`,
  DROP INDEX `invoices_invoice_no_key`,
  DROP INDEX `invoices_payee_id_date_idx`,
  DROP COLUMN `invoice_no`,
  DROP COLUMN `payee_id`,
  DROP COLUMN `description`,
  DROP COLUMN `amount`,
  DROP COLUMN `income_tax`,
  DROP COLUMN `sales_tax`,
  DROP COLUMN `net_amount`,
  ADD COLUMN `serial_no` INTEGER NOT NULL;

CREATE UNIQUE INDEX `invoices_serial_no_key` ON `invoices`(`serial_no`);

ALTER TABLE `invoice_items`
  CHANGE COLUMN `description` `purpose` VARCHAR(191) NULL,
  ADD COLUMN `payee_id` INTEGER NOT NULL,
  ADD COLUMN `cheque_no` VARCHAR(100) NULL,
  ADD COLUMN `line_serial` INTEGER NOT NULL;

CREATE UNIQUE INDEX `invoice_items_invoice_id_line_serial_key` ON `invoice_items`(`invoice_id`, `line_serial`);
CREATE INDEX `invoice_items_payee_id_idx` ON `invoice_items`(`payee_id`);
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
