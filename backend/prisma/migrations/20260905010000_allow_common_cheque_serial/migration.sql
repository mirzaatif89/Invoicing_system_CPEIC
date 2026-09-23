-- A single cheque may settle multiple selected PO supply lines in one invoice.
ALTER TABLE `invoice_items` DROP FOREIGN KEY `invoice_items_invoice_id_fkey`;
DROP INDEX `invoice_items_invoice_id_line_serial_key` ON `invoice_items`;
CREATE INDEX `invoice_items_invoice_id_line_serial_idx` ON `invoice_items`(`invoice_id`, `line_serial`);
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
