ALTER TABLE `po_supplies` ADD COLUMN `item_types` JSON NULL;
ALTER TABLE `invoice_items` ADD COLUMN `item_types` JSON NULL;

UPDATE `po_supplies` SET `item_types` = JSON_ARRAY(`item_type`) WHERE `item_types` IS NULL;
UPDATE `invoice_items` SET `item_types` = JSON_ARRAY(`item_type`) WHERE `item_types` IS NULL;
