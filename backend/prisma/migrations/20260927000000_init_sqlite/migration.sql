-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "payees" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "itax_no" TEXT,
    "phone" TEXT,
    "vendor_type" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "ntn_number" TEXT,
    "tax_status" TEXT NOT NULL DEFAULT 'NORMAL',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "account_codes" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "income_tax_percent_company" DECIMAL NOT NULL DEFAULT 0,
    "income_tax_percent_individual" DECIMAL NOT NULL DEFAULT 0,
    "income_tax_percent_company_active" DECIMAL NOT NULL DEFAULT 0,
    "income_tax_percent_company_inactive" DECIMAL NOT NULL DEFAULT 0,
    "income_tax_percent_individual_active" DECIMAL NOT NULL DEFAULT 0,
    "income_tax_percent_individual_inactive" DECIMAL NOT NULL DEFAULT 0,
    "sales_tax_percent_company" DECIMAL NOT NULL DEFAULT 0,
    "sales_tax_percent_individual" DECIMAL NOT NULL DEFAULT 0,
    "print_fund_label" TEXT,
    "sanction_purpose_text" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "vendor_tax_status" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "payee_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "effective_from" DATETIME NOT NULL,
    "valid_until" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "vendor_tax_status_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budget_documents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "budget_type" TEXT NOT NULL,
    "document_no" INTEGER NOT NULL,
    "details" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "budget_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budget_document_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "budget_document_id" INTEGER NOT NULL,
    "account_code_id" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "line_serial" INTEGER NOT NULL,
    CONSTRAINT "budget_document_items_budget_document_id_fkey" FOREIGN KEY ("budget_document_id") REFERENCES "budget_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "budget_document_items_account_code_id_fkey" FOREIGN KEY ("account_code_id") REFERENCES "account_codes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serial_no" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "account_code_id" INTEGER NOT NULL,
    "is_contingent" BOOLEAN NOT NULL DEFAULT false,
    "source_invoice_serial" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "invoices_account_code_id_fkey" FOREIGN KEY ("account_code_id") REFERENCES "account_codes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "po_supplies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "po_number" TEXT NOT NULL,
    "po_date" DATETIME NOT NULL,
    "account_code_id" INTEGER NOT NULL,
    "payee_id" INTEGER NOT NULL,
    "dc_number" TEXT,
    "amount" DECIMAL NOT NULL,
    "delivery_days" INTEGER,
    "grace_period_days" INTEGER,
    "manual_ld_percent" DECIMAL,
    "manual_shelf_life_percent" DECIMAL,
    "manual_ld_amount" DECIMAL NOT NULL DEFAULT 0,
    "manual_shelf_life_amount" DECIMAL NOT NULL DEFAULT 0,
    "actual_delivery_date" DATETIME,
    "manufacturing_date" DATETIME,
    "expiry_date" DATETIME,
    "item_type" TEXT NOT NULL DEFAULT 'LOCAL',
    "item_types" JSONB,
    "procurement_mode" TEXT,
    "contingent_invoice_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "po_supplies_account_code_id_fkey" FOREIGN KEY ("account_code_id") REFERENCES "account_codes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "po_supplies_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "po_supplies_contingent_invoice_id_fkey" FOREIGN KEY ("contingent_invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "item_type_tax_rules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nature_category" TEXT,
    "origin_category" TEXT,
    "income_tax_percent" DECIMAL NOT NULL DEFAULT 0,
    "sales_tax_percent" DECIMAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "payee_id" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "income_tax" DECIMAL NOT NULL DEFAULT 0,
    "sales_tax" DECIMAL NOT NULL DEFAULT 0,
    "applied_income_tax_rate" DECIMAL,
    "tax_certificate_id" INTEGER,
    "po_number" TEXT,
    "po_date" DATETIME,
    "dc_number" TEXT,
    "procurement_mode" TEXT,
    "delivery_due_date" DATETIME,
    "actual_delivery_date" DATETIME,
    "manufacturing_date" DATETIME,
    "expiry_date" DATETIME,
    "order_date" DATETIME,
    "gross_period_days" INTEGER,
    "grace_period_days" INTEGER,
    "item_type" TEXT NOT NULL DEFAULT 'LOCAL',
    "item_types" JSONB,
    "delivery_days" INTEGER,
    "ld_charges" DECIMAL NOT NULL DEFAULT 0,
    "shelf_life_deduction" DECIMAL NOT NULL DEFAULT 0,
    "shelf_life_deduction_percent" DECIMAL,
    "cheque_no" TEXT,
    "bank_branch_id" INTEGER,
    "cheque_paid" BOOLEAN NOT NULL DEFAULT false,
    "income_tax_paid" BOOLEAN NOT NULL DEFAULT false,
    "sales_tax_paid" BOOLEAN NOT NULL DEFAULT false,
    "purpose" TEXT,
    "line_serial" INTEGER NOT NULL,
    CONSTRAINT "invoice_items_bank_branch_id_fkey" FOREIGN KEY ("bank_branch_id") REFERENCES "bank_branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invoice_items_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_items_tax_certificate_id_fkey" FOREIGN KEY ("tax_certificate_id") REFERENCES "vendor_tax_certificates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "banks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bank_branches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bank_id" INTEGER NOT NULL,
    "branch_name" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "bank_branches_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "banks" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "invoice_cheques" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoice_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "cheque_no" TEXT NOT NULL,
    "cheque_serial" TEXT,
    "cheque_date" DATETIME,
    "amount" DECIMAL NOT NULL,
    "bank_branch_id" INTEGER,
    "cheque_authority_schedule_id" INTEGER,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "recipient_name" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "invoice_cheques_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invoice_cheques_bank_branch_id_fkey" FOREIGN KEY ("bank_branch_id") REFERENCES "bank_branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "invoice_cheques_cheque_authority_schedule_id_fkey" FOREIGN KEY ("cheque_authority_schedule_id") REFERENCES "cheque_authority_schedules" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cheque_authority_schedules" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serial_no" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "dao_reference_no" TEXT,
    "dao_reference_date" DATETIME,
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "cheque_authority_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vendor_tax_certificates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "vendor_id" INTEGER NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "issue_date" DATETIME NOT NULL,
    "valid_from" DATETIME NOT NULL,
    "valid_to" DATETIME NOT NULL,
    "applicable_rate" DECIMAL NOT NULL,
    "certificate_file_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verified_by" INTEGER,
    "verified_date" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "vendor_tax_certificates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "payees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "vendor_tax_certificates_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shelf_life_penalty_slabs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "item_category" TEXT NOT NULL DEFAULT 'LOCAL',
    "remaining_percent_min" DECIMAL NOT NULL,
    "remaining_percent_max" DECIMAL,
    "penalty_percent" DECIMAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGINT NOT NULL PRIMARY KEY,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "payees_code_key" ON "payees"("code");

-- CreateIndex
CREATE INDEX "payees_name_idx" ON "payees"("name");

-- CreateIndex
CREATE UNIQUE INDEX "account_codes_code_key" ON "account_codes"("code");

-- CreateIndex
CREATE INDEX "account_codes_name_idx" ON "account_codes"("name");

-- CreateIndex
CREATE INDEX "vendor_tax_status_payee_id_effective_from_idx" ON "vendor_tax_status"("payee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_tax_status_payee_id_effective_from_key" ON "vendor_tax_status"("payee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "budget_documents_document_no_key" ON "budget_documents"("document_no");

-- CreateIndex
CREATE INDEX "budget_documents_date_idx" ON "budget_documents"("date");

-- CreateIndex
CREATE INDEX "budget_documents_budget_type_date_idx" ON "budget_documents"("budget_type", "date");

-- CreateIndex
CREATE INDEX "budget_document_items_account_code_id_idx" ON "budget_document_items"("account_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_document_items_budget_document_id_line_serial_key" ON "budget_document_items"("budget_document_id", "line_serial");

-- CreateIndex
CREATE INDEX "invoices_date_idx" ON "invoices"("date");

-- CreateIndex
CREATE INDEX "invoices_account_code_id_date_idx" ON "invoices"("account_code_id", "date");

-- CreateIndex
CREATE INDEX "invoices_is_contingent_date_idx" ON "invoices"("is_contingent", "date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_serial_no_is_contingent_key" ON "invoices"("serial_no", "is_contingent");

-- CreateIndex
CREATE INDEX "po_supplies_po_number_contingent_invoice_id_idx" ON "po_supplies"("po_number", "contingent_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_type_tax_rules_nature_category_origin_category_key" ON "item_type_tax_rules"("nature_category", "origin_category");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_line_serial_idx" ON "invoice_items"("invoice_id", "line_serial");

-- CreateIndex
CREATE INDEX "invoice_items_payee_id_idx" ON "invoice_items"("payee_id");

-- CreateIndex
CREATE INDEX "invoice_items_tax_certificate_id_idx" ON "invoice_items"("tax_certificate_id");

-- CreateIndex
CREATE UNIQUE INDEX "banks_code_key" ON "banks"("code");

-- CreateIndex
CREATE UNIQUE INDEX "banks_name_key" ON "banks"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_branches_bank_id_branch_name_key" ON "bank_branches"("bank_id", "branch_name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_branches_bank_id_branch_code_key" ON "bank_branches"("bank_id", "branch_code");

-- CreateIndex
CREATE INDEX "invoice_cheques_bank_branch_id_cheque_no_idx" ON "invoice_cheques"("bank_branch_id", "cheque_no");

-- CreateIndex
CREATE INDEX "invoice_cheques_cheque_authority_schedule_id_idx" ON "invoice_cheques"("cheque_authority_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "cheque_authority_schedules_serial_no_key" ON "cheque_authority_schedules"("serial_no");

-- CreateIndex
CREATE INDEX "cheque_authority_schedules_date_idx" ON "cheque_authority_schedules"("date");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_tax_certificates_certificate_number_key" ON "vendor_tax_certificates"("certificate_number");

-- CreateIndex
CREATE INDEX "vendor_tax_certificates_vendor_id_status_valid_from_valid_to_idx" ON "vendor_tax_certificates"("vendor_id", "status", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "vendor_tax_certificates_status_valid_to_idx" ON "vendor_tax_certificates"("status", "valid_to");

-- CreateIndex
CREATE INDEX "shelf_life_penalty_slabs_item_category_active_remaining_percent_min_idx" ON "shelf_life_penalty_slabs"("item_category", "active", "remaining_percent_min");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
