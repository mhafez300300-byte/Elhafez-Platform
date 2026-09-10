CREATE TABLE "supplier_categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalized_name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_categories_company_normalized_name_key" UNIQUE ("company_id","normalized_name")
);
CREATE INDEX "supplier_categories_company_active_idx" ON "supplier_categories"("company_id","active");

CREATE TABLE "supplier_tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalized_name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_tags_company_normalized_name_key" UNIQUE ("company_id","normalized_name")
);
CREATE INDEX "supplier_tags_company_active_idx" ON "supplier_tags"("company_id","active");

CREATE TABLE "suppliers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "supplier_code" VARCHAR(24) NOT NULL,
  "create_request_key" VARCHAR(100),
  "supplier_type" VARCHAR(20) NOT NULL CHECK ("supplier_type" IN ('INDIVIDUAL','COMPANY')),
  "legal_name" VARCHAR(180) NOT NULL,
  "normalized_name" VARCHAR(180) NOT NULL,
  "trade_name" VARCHAR(180),
  "normalized_trade_name" VARCHAR(180),
  "primary_phone" VARCHAR(20),
  "secondary_phone" VARCHAR(20),
  "whatsapp_phone" VARCHAR(20),
  "email" VARCHAR(254),
  "website" VARCHAR(300),
  "national_id" VARCHAR(40),
  "tax_number" VARCHAR(40),
  "commercial_registration" VARCHAR(80),
  "category_id" UUID,
  "notes" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suppliers_company_code_key" UNIQUE ("company_id","supplier_code"),
  CONSTRAINT "suppliers_company_create_request_key" UNIQUE ("company_id","create_request_key"),
  CONSTRAINT "suppliers_company_national_id_key" UNIQUE ("company_id","national_id"),
  CONSTRAINT "suppliers_company_tax_number_key" UNIQUE ("company_id","tax_number"),
  CONSTRAINT "suppliers_company_commercial_registration_key" UNIQUE ("company_id","commercial_registration"),
  CONSTRAINT "suppliers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "supplier_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "suppliers_company_status_updated_idx" ON "suppliers"("company_id","status","updated_at");
CREATE INDEX "suppliers_company_normalized_name_idx" ON "suppliers"("company_id","normalized_name");
CREATE INDEX "suppliers_company_primary_phone_idx" ON "suppliers"("company_id","primary_phone");
CREATE INDEX "suppliers_company_whatsapp_phone_idx" ON "suppliers"("company_id","whatsapp_phone");
CREATE INDEX "suppliers_company_email_idx" ON "suppliers"("company_id","email");
CREATE INDEX "suppliers_category_id_idx" ON "suppliers"("category_id");

CREATE TABLE "supplier_addresses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL,
  "label" VARCHAR(80),
  "governorate" VARCHAR(120),
  "city" VARCHAR(120),
  "street" VARCHAR(180),
  "details" VARCHAR(600),
  "landmark" VARCHAR(180),
  "phone" VARCHAR(20),
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_addresses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "supplier_addresses_supplier_active_idx" ON "supplier_addresses"("supplier_id","active");
CREATE INDEX "supplier_addresses_governorate_city_idx" ON "supplier_addresses"("governorate","city");
CREATE UNIQUE INDEX "supplier_addresses_one_active_default_idx" ON "supplier_addresses"("supplier_id") WHERE "active" = TRUE AND "is_default" = TRUE;

CREATE TABLE "supplier_contacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "job_title" VARCHAR(120),
  "phone" VARCHAR(20),
  "whatsapp_phone" VARCHAR(20),
  "email" VARCHAR(254),
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_contacts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "supplier_contacts_supplier_active_idx" ON "supplier_contacts"("supplier_id","active");
CREATE INDEX "supplier_contacts_supplier_name_idx" ON "supplier_contacts"("supplier_id","name");
CREATE INDEX "supplier_contacts_phone_idx" ON "supplier_contacts"("phone");
CREATE INDEX "supplier_contacts_email_idx" ON "supplier_contacts"("email");
CREATE UNIQUE INDEX "supplier_contacts_one_active_primary_idx" ON "supplier_contacts"("supplier_id") WHERE "active" = TRUE AND "is_primary" = TRUE;

CREATE TABLE "supplier_tag_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_tag_assignments_supplier_tag_key" UNIQUE ("supplier_id","tag_id"),
  CONSTRAINT "supplier_tag_assignments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "supplier_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "supplier_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "supplier_tag_assignments_tag_id_idx" ON "supplier_tag_assignments"("tag_id");
