CREATE TABLE `invoice_cheques` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `invoice_id` INTEGER NOT NULL,
  `type` ENUM('VENDOR', 'INCOME_TAX', 'SALES_TAX') NOT NULL,
  `cheque_no` VARCHAR(50) NOT NULL,
  `cheque_serial` VARCHAR(50) NULL,
  `cheque_date` DATE NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `bank_branch_id` INTEGER NULL,
  `paid` BOOLEAN NOT NULL DEFAULT false,
  `recipient_name` VARCHAR(150) NULL,
  `notes` VARCHAR(300) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `invoice_cheques_invoice_id_type_key`(`invoice_id`, `type`),
  INDEX `invoice_cheques_bank_branch_id_cheque_no_idx`(`bank_branch_id`, `cheque_no`),
  CONSTRAINT `invoice_cheques_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `invoice_cheques_bank_branch_id_fkey` FOREIGN KEY (`bank_branch_id`) REFERENCES `bank_branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO `invoice_cheques` (`invoice_id`, `type`, `cheque_no`, `amount`, `bank_branch_id`, `paid`, `recipient_name`, `updated_at`)
SELECT i.`invoice_id`, 'VENDOR', MIN(i.`cheque_no`),
       SUM(i.`amount` - i.`income_tax` - i.`sales_tax` - i.`ld_charges` - i.`shelf_life_deduction`),
       MAX(i.`bank_branch_id`), MAX(i.`cheque_paid`), MAX(p.`name`), CURRENT_TIMESTAMP(3)
FROM `invoice_items` i
JOIN `invoices` inv ON inv.`id` = i.`invoice_id`
JOIN `payees` p ON p.`id` = i.`payee_id`
WHERE inv.`is_contingent` = true AND i.`cheque_no` IS NOT NULL
GROUP BY i.`invoice_id`;
