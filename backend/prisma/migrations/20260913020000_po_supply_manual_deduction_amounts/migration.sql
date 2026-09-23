ALTER TABLE `po_supplies`
  ADD COLUMN `manual_ld_amount` DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN `manual_shelf_life_amount` DECIMAL(18,2) NOT NULL DEFAULT 0;
