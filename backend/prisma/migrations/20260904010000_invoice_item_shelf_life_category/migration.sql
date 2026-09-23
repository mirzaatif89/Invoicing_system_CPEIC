ALTER TABLE `invoice_items`
  ADD COLUMN `item_type` ENUM('IMPORTED', 'LOCAL') NOT NULL DEFAULT 'LOCAL' AFTER `grace_period_days`;
