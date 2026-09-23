DROP TABLE `salary_entries`;

CREATE TABLE `pay_allowance_entries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payee_id` INTEGER NOT NULL,
  `date` DATE NOT NULL,
  `serial_no` INTEGER NOT NULL,
  `purpose` VARCHAR(191) NULL,
  `cheque_no` VARCHAR(100) NULL,
  `created_by` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_by` INTEGER NULL,
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `pay_allowance_entries_serial_no_key`(`serial_no`),
  INDEX `pay_allowance_entries_date_idx`(`date`),
  INDEX `pay_allowance_entries_payee_id_date_idx`(`payee_id`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `pay_allowance_entry_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `pay_allowance_entry_id` INTEGER NOT NULL,
  `account_code_id` INTEGER NOT NULL,
  `amount` DECIMAL(18,2) NOT NULL,
  `line_serial` INTEGER NOT NULL,
  UNIQUE INDEX `pay_allowance_entry_items_pay_allowance_entry_id_line_serial_key`(`pay_allowance_entry_id`, `line_serial`),
  INDEX `pay_allowance_entry_items_account_code_id_idx`(`account_code_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pay_allowance_entries` ADD CONSTRAINT `pay_allowance_entries_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `pay_allowance_entries` ADD CONSTRAINT `pay_allowance_entries_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `pay_allowance_entries` ADD CONSTRAINT `pay_allowance_entries_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `pay_allowance_entry_items` ADD CONSTRAINT `pay_allowance_entry_items_pay_allowance_entry_id_fkey` FOREIGN KEY (`pay_allowance_entry_id`) REFERENCES `pay_allowance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `pay_allowance_entry_items` ADD CONSTRAINT `pay_allowance_entry_items_account_code_id_fkey` FOREIGN KEY (`account_code_id`) REFERENCES `account_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
