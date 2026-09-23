ALTER TABLE `payees`
  CHANGE COLUMN `address` `address_line_1` TEXT NULL,
  ADD COLUMN `address_line_2` TEXT NULL,
  ADD COLUMN `itax_no` VARCHAR(100) NULL,
  DROP COLUMN `cnic_ntn`,
  DROP COLUMN `bank_account`;
