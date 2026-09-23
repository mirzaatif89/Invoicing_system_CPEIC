ALTER TABLE `shelf_life_penalty_slabs`
  ADD COLUMN `item_category` ENUM('IMPORTED', 'LOCAL') NOT NULL DEFAULT 'LOCAL' AFTER `id`;

CREATE INDEX `slps_category_active_min_idx`
  ON `shelf_life_penalty_slabs`(`item_category`, `active`, `remaining_percent_min`);
