ALTER TABLE `invoice_items`
  ADD COLUMN `cheque_paid` BOOLEAN NOT NULL DEFAULT FALSE AFTER `cheque_no`;
