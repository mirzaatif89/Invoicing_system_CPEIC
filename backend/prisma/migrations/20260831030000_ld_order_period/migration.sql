ALTER TABLE `invoice_items`
  ADD COLUMN `order_date` DATE NULL,
  ADD COLUMN `gross_period_days` INTEGER NULL;
