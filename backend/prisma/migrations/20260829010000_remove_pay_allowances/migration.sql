-- Remove the retired Salary / Pay Allowance module.
-- The item table owns all foreign keys to its parent and account codes, so it is dropped first.
DROP TABLE `pay_allowance_entry_items`;
DROP TABLE `pay_allowance_entries`;
