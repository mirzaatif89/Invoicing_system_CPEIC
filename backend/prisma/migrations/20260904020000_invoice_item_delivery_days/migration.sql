ALTER TABLE `invoice_items`
  ADD COLUMN `delivery_days` INTEGER NULL AFTER `item_type`;
