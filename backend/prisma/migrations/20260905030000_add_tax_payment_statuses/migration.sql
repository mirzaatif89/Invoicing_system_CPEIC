ALTER TABLE `invoice_items`
  ADD COLUMN `income_tax_paid` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `sales_tax_paid` BOOLEAN NOT NULL DEFAULT false;
