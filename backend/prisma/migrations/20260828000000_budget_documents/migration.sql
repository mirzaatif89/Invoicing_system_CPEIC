DROP TABLE IF EXISTS `budgets`;

CREATE TABLE `budget_documents` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `budget_type` ENUM('Original', 'Revised', 'Supplementary') NOT NULL,
  `document_no` INTEGER NOT NULL,
  `details` TEXT NULL,
  `created_by` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_by` INTEGER NULL,
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `budget_documents_document_no_key`(`document_no`),
  INDEX `budget_documents_date_idx`(`date`),
  INDEX `budget_documents_budget_type_date_idx`(`budget_type`, `date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `budget_document_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `budget_document_id` INTEGER NOT NULL,
  `account_code_id` INTEGER NOT NULL,
  `amount` DECIMAL(18, 2) NOT NULL,
  `line_serial` INTEGER NOT NULL,
  UNIQUE INDEX `budget_document_items_budget_document_id_line_serial_key`(`budget_document_id`, `line_serial`),
  INDEX `budget_document_items_account_code_id_idx`(`account_code_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `budget_documents` ADD CONSTRAINT `budget_documents_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `budget_documents` ADD CONSTRAINT `budget_documents_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `budget_document_items` ADD CONSTRAINT `budget_document_items_budget_document_id_fkey` FOREIGN KEY (`budget_document_id`) REFERENCES `budget_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `budget_document_items` ADD CONSTRAINT `budget_document_items_account_code_id_fkey` FOREIGN KEY (`account_code_id`) REFERENCES `account_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
