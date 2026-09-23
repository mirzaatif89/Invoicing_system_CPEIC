ALTER TABLE `invoices` DROP INDEX `invoices_serial_no_key`;
CREATE UNIQUE INDEX `invoices_serial_no_is_contingent_key` ON `invoices`(`serial_no`, `is_contingent`);
