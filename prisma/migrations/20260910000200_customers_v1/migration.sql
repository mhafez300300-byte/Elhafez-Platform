CREATE TABLE "customer_categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalized_name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_categories_company_normalized_name_key" UNIQUE ("company_id","normalized_name")
);
CREATE INDEX "customer_categories_company_active_idx" ON "customer_categories"("company_id","active");

CREATE TABLE "customer_tags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "normalized_name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_tags_company_normalized_name_key" UNIQUE ("company_id","normalized_name")
);
CREATE INDEX "customer_tags_company_active_idx" ON "customer_tags"("company_id","active");

CREATE TABLE "customers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "customer_code" VARCHAR(24) NOT NULL,
  "create_request_key" VARCHAR(100),
  "customer_type" VARCHAR(20) NOT NULL CHECK ("customer_type" IN ('INDIVIDUAL','COMPANY')),
  "full_name" VARCHAR(180) NOT NULL,
  "normalized_name" VARCHAR(180) NOT NULL,
  "trade_name" VARCHAR(180),
  "normalized_trade_name" VARCHAR(180),
  "primary_phone" VARCHAR(20),
  "secondary_phone" VARCHAR(20),
  "whatsapp_phone" VARCHAR(20),
  "email" VARCHAR(254),
  "national_id" VARCHAR(40),
  "tax_number" VARCHAR(40),
  "commercial_registration" VARCHAR(80),
  "birth_date" DATE,
  "gender" VARCHAR(30),
  "category_id" UUID,
  "source" VARCHAR(40),
  "notes" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customers_company_code_key" UNIQUE ("company_id","customer_code"),
  CONSTRAINT "customers_company_create_request_key" UNIQUE ("company_id","create_request_key"),
  CONSTRAINT "customers_company_national_id_key" UNIQUE ("company_id","national_id"),
  CONSTRAINT "customers_company_tax_number_key" UNIQUE ("company_id","tax_number"),
  CONSTRAINT "customers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "customer_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "customers_company_status_updated_idx" ON "customers"("company_id","status","updated_at");
CREATE INDEX "customers_company_normalized_name_idx" ON "customers"("company_id","normalized_name");
CREATE INDEX "customers_company_primary_phone_idx" ON "customers"("company_id","primary_phone");
CREATE INDEX "customers_company_whatsapp_phone_idx" ON "customers"("company_id","whatsapp_phone");
CREATE INDEX "customers_category_id_idx" ON "customers"("category_id");

CREATE TABLE "customer_addresses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
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
  CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "customer_addresses_customer_active_idx" ON "customer_addresses"("customer_id","active");
CREATE INDEX "customer_addresses_governorate_city_idx" ON "customer_addresses"("governorate","city");
CREATE UNIQUE INDEX "customer_addresses_one_active_default_idx" ON "customer_addresses"("customer_id") WHERE "active" = TRUE AND "is_default" = TRUE;

CREATE TABLE "customer_tag_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_tag_assignments_customer_tag_key" UNIQUE ("customer_id","tag_id"),
  CONSTRAINT "customer_tag_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "customer_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "customer_tag_assignments_tag_id_idx" ON "customer_tag_assignments"("tag_id");
