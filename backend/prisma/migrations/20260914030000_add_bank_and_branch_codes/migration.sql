ALTER TABLE `banks` ADD COLUMN `code` VARCHAR(30) NULL;
SET @bank_code := 0;
UPDATE `banks` SET `code` = (@bank_code := @bank_code + 1) ORDER BY `id`;
ALTER TABLE `banks` MODIFY `code` VARCHAR(30) NOT NULL, ADD UNIQUE INDEX `banks_code_key` (`code`);

UPDATE `bank_branches` AS `target`
JOIN (
  SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `bank_id` ORDER BY `id`) AS `next_code`
  FROM `bank_branches`
  WHERE `branch_code` IS NULL
) AS `numbered` ON `numbered`.`id` = `target`.`id`
SET `target`.`branch_code` = CAST(`numbered`.`next_code` AS CHAR);
ALTER TABLE `bank_branches` MODIFY `branch_code` VARCHAR(30) NOT NULL, ADD UNIQUE INDEX `bank_branches_bank_id_branch_code_key` (`bank_id`, `branch_code`);
