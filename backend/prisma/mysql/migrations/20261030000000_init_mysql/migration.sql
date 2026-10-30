-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'ACCOUNTANT', 'FINANCE_MANAGER', 'USER') NOT NULL DEFAULT 'USER',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address_line_1` VARCHAR(191) NULL,
    `address_line_2` VARCHAR(191) NULL,
    `itax_no` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `vendor_type` ENUM('COMPANY', 'INDIVIDUAL') NOT NULL DEFAULT 'INDIVIDUAL',
    `ntn_number` VARCHAR(191) NULL,
    `tax_status` ENUM('NORMAL', 'EXEMPT', 'REDUCED') NOT NULL DEFAULT 'NORMAL',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payees_code_key`(`code`),
    INDEX `payees_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `income_tax_percent_company` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `income_tax_percent_individual` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `income_tax_percent_company_active` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `income_tax_percent_company_inactive` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `income_tax_percent_individual_active` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `income_tax_percent_individual_inactive` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `sales_tax_percent_company` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `sales_tax_percent_individual` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `print_fund_label` VARCHAR(191) NULL,
    `sanction_purpose_text` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `account_codes_code_key`(`code`),
    INDEX `account_codes_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendor_tax_status` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payee_id` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL,
    `effective_from` DATETIME(3) NOT NULL,
    `valid_until` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vendor_tax_status_payee_id_effective_from_idx`(`payee_id`, `effective_from`),
    UNIQUE INDEX `vendor_tax_status_payee_id_effective_from_key`(`payee_id`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `budget_type` ENUM('Original', 'Revised', 'Supplementary') NOT NULL,
    `document_no` INTEGER NOT NULL,
    `details` VARCHAR(191) NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_by` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `budget_documents_document_no_key`(`document_no`),
    INDEX `budget_documents_date_idx`(`date`),
    INDEX `budget_documents_budget_type_date_idx`(`budget_type`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `budget_document_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `budget_document_id` INTEGER NOT NULL,
    `account_code_id` INTEGER NOT NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `line_serial` INTEGER NOT NULL,

    INDEX `budget_document_items_account_code_id_idx`(`account_code_id`),
    UNIQUE INDEX `budget_document_items_budget_document_id_line_serial_key`(`budget_document_id`, `line_serial`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serial_no` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `account_code_id` INTEGER NOT NULL,
    `is_contingent` BOOLEAN NOT NULL DEFAULT false,
    `source_invoice_serial` INTEGER NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_by` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `invoices_date_idx`(`date`),
    INDEX `invoices_account_code_id_date_idx`(`account_code_id`, `date`),
    INDEX `invoices_is_contingent_date_idx`(`is_contingent`, `date`),
    UNIQUE INDEX `invoices_serial_no_is_contingent_key`(`serial_no`, `is_contingent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `po_supplies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `po_number` VARCHAR(191) NOT NULL,
    `po_date` DATETIME(3) NOT NULL,
    `account_code_id` INTEGER NOT NULL,
    `payee_id` INTEGER NOT NULL,
    `dc_number` VARCHAR(191) NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `delivery_days` INTEGER NULL,
    `grace_period_days` INTEGER NULL,
    `manual_ld_percent` DECIMAL(65, 30) NULL,
    `manual_shelf_life_percent` DECIMAL(65, 30) NULL,
    `manual_ld_amount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `manual_shelf_life_amount` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `actual_delivery_date` DATETIME(3) NULL,
    `manufacturing_date` DATETIME(3) NULL,
    `expiry_date` DATETIME(3) NULL,
    `item_type` ENUM('IMPORTED', 'LOCAL', 'MEDICINE', 'DISPOSABLE') NOT NULL DEFAULT 'LOCAL',
    `item_types` JSON NULL,
    `procurement_mode` ENUM('TENDER', 'QUOTATION') NULL,
    `contingent_invoice_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `po_supplies_po_number_contingent_invoice_id_idx`(`po_number`, `contingent_invoice_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_type_tax_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nature_category` ENUM('IMPORTED', 'LOCAL', 'MEDICINE', 'DISPOSABLE') NULL,
    `origin_category` ENUM('IMPORTED', 'LOCAL', 'MEDICINE', 'DISPOSABLE') NULL,
    `income_tax_percent` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `sales_tax_percent` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `item_type_tax_rules_nature_category_origin_category_key`(`nature_category`, `origin_category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `payee_id` INTEGER NOT NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `income_tax` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `sales_tax` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `applied_income_tax_rate` DECIMAL(65, 30) NULL,
    `tax_certificate_id` INTEGER NULL,
    `po_number` VARCHAR(191) NULL,
    `po_date` DATETIME(3) NULL,
    `dc_number` VARCHAR(191) NULL,
    `procurement_mode` ENUM('TENDER', 'QUOTATION') NULL,
    `delivery_due_date` DATETIME(3) NULL,
    `actual_delivery_date` DATETIME(3) NULL,
    `manufacturing_date` DATETIME(3) NULL,
    `expiry_date` DATETIME(3) NULL,
    `order_date` DATETIME(3) NULL,
    `gross_period_days` INTEGER NULL,
    `grace_period_days` INTEGER NULL,
    `item_type` ENUM('IMPORTED', 'LOCAL', 'MEDICINE', 'DISPOSABLE') NOT NULL DEFAULT 'LOCAL',
    `item_types` JSON NULL,
    `delivery_days` INTEGER NULL,
    `ld_charges` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `shelf_life_deduction` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    `shelf_life_deduction_percent` DECIMAL(65, 30) NULL,
    `cheque_no` VARCHAR(191) NULL,
    `bank_branch_id` INTEGER NULL,
    `cheque_paid` BOOLEAN NOT NULL DEFAULT false,
    `income_tax_paid` BOOLEAN NOT NULL DEFAULT false,
    `sales_tax_paid` BOOLEAN NOT NULL DEFAULT false,
    `purpose` VARCHAR(191) NULL,
    `line_serial` INTEGER NOT NULL,

    INDEX `invoice_items_invoice_id_line_serial_idx`(`invoice_id`, `line_serial`),
    INDEX `invoice_items_payee_id_idx`(`payee_id`),
    INDEX `invoice_items_tax_certificate_id_idx`(`tax_certificate_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `banks_code_key`(`code`),
    UNIQUE INDEX `banks_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bank_id` INTEGER NOT NULL,
    `branch_name` VARCHAR(191) NOT NULL,
    `branch_code` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bank_branches_bank_id_branch_name_key`(`bank_id`, `branch_name`),
    UNIQUE INDEX `bank_branches_bank_id_branch_code_key`(`bank_id`, `branch_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_cheques` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `type` ENUM('VENDOR', 'SHELF_LIFE', 'INCOME_TAX', 'SALES_TAX', 'OTHER') NOT NULL,
    `label` VARCHAR(191) NULL,
    `cheque_no` VARCHAR(191) NOT NULL,
    `cheque_serial` VARCHAR(191) NULL,
    `cheque_date` DATETIME(3) NULL,
    `amount` DECIMAL(65, 30) NOT NULL,
    `bank_branch_id` INTEGER NULL,
    `cheque_authority_schedule_id` INTEGER NULL,
    `paid` BOOLEAN NOT NULL DEFAULT false,
    `recipient_name` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `invoice_cheques_bank_branch_id_cheque_no_idx`(`bank_branch_id`, `cheque_no`),
    INDEX `invoice_cheques_cheque_authority_schedule_id_idx`(`cheque_authority_schedule_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cheque_authority_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serial_no` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `dao_reference_no` VARCHAR(191) NULL,
    `dao_reference_date` DATETIME(3) NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cheque_authority_schedules_serial_no_key`(`serial_no`),
    INDEX `cheque_authority_schedules_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendor_tax_certificates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vendor_id` INTEGER NOT NULL,
    `certificate_number` VARCHAR(191) NOT NULL,
    `issue_date` DATETIME(3) NOT NULL,
    `valid_from` DATETIME(3) NOT NULL,
    `valid_to` DATETIME(3) NOT NULL,
    `applicable_rate` DECIMAL(65, 30) NOT NULL,
    `certificate_file_path` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `verified_by` INTEGER NULL,
    `verified_date` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vendor_tax_certificates_certificate_number_key`(`certificate_number`),
    INDEX `vendor_tax_certificates_vendor_id_status_valid_from_valid_to_idx`(`vendor_id`, `status`, `valid_from`, `valid_to`),
    INDEX `vendor_tax_certificates_status_valid_to_idx`(`status`, `valid_to`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shelf_life_penalty_slabs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `item_category` ENUM('IMPORTED', 'LOCAL', 'MEDICINE', 'DISPOSABLE') NOT NULL DEFAULT 'LOCAL',
    `remaining_percent_min` DECIMAL(65, 30) NOT NULL,
    `remaining_percent_max` DECIMAL(65, 30) NULL,
    `penalty_percent` DECIMAL(65, 30) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shelf_life_penalty_slabs_item_category_active_remaining_perc_idx`(`item_category`, `active`, `remaining_percent_min`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `details` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `vendor_tax_status` ADD CONSTRAINT `vendor_tax_status_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_documents` ADD CONSTRAINT `budget_documents_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_documents` ADD CONSTRAINT `budget_documents_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_document_items` ADD CONSTRAINT `budget_document_items_budget_document_id_fkey` FOREIGN KEY (`budget_document_id`) REFERENCES `budget_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `budget_document_items` ADD CONSTRAINT `budget_document_items_account_code_id_fkey` FOREIGN KEY (`account_code_id`) REFERENCES `account_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_account_code_id_fkey` FOREIGN KEY (`account_code_id`) REFERENCES `account_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_supplies` ADD CONSTRAINT `po_supplies_account_code_id_fkey` FOREIGN KEY (`account_code_id`) REFERENCES `account_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_supplies` ADD CONSTRAINT `po_supplies_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `po_supplies` ADD CONSTRAINT `po_supplies_contingent_invoice_id_fkey` FOREIGN KEY (`contingent_invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_bank_branch_id_fkey` FOREIGN KEY (`bank_branch_id`) REFERENCES `bank_branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_tax_certificate_id_fkey` FOREIGN KEY (`tax_certificate_id`) REFERENCES `vendor_tax_certificates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_branches` ADD CONSTRAINT `bank_branches_bank_id_fkey` FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_cheques` ADD CONSTRAINT `invoice_cheques_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_cheques` ADD CONSTRAINT `invoice_cheques_bank_branch_id_fkey` FOREIGN KEY (`bank_branch_id`) REFERENCES `bank_branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_cheques` ADD CONSTRAINT `invoice_cheques_cheque_authority_schedule_id_fkey` FOREIGN KEY (`cheque_authority_schedule_id`) REFERENCES `cheque_authority_schedules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cheque_authority_schedules` ADD CONSTRAINT `cheque_authority_schedules_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_tax_certificates` ADD CONSTRAINT `vendor_tax_certificates_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `payees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_tax_certificates` ADD CONSTRAINT `vendor_tax_certificates_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
