CREATE TABLE `cheque_authority_schedules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `serial_no` INT NOT NULL,
  `date` DATE NOT NULL,
  `dao_reference_no` VARCHAR(150) NULL,
  `dao_reference_date` DATE NULL,
  `created_by` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cheque_authority_schedules_serial_no_key` (`serial_no`),
  INDEX `cheque_authority_schedules_date_idx` (`date`),
  INDEX `cheque_authority_schedules_created_by_idx` (`created_by`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cheque_authority_schedules_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `invoice_cheques`
  ADD COLUMN `cheque_authority_schedule_id` INT NULL,
  ADD INDEX `invoice_cheques_cheque_authority_schedule_id_idx` (`cheque_authority_schedule_id`),
  ADD CONSTRAINT `invoice_cheques_cheque_authority_schedule_id_fkey`
    FOREIGN KEY (`cheque_authority_schedule_id`) REFERENCES `cheque_authority_schedules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
