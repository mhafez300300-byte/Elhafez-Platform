CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "core_users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(160) NOT NULL UNIQUE,
  "display_name" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','DISABLED')),
  "platform_admin" BOOLEAN NOT NULL DEFAULT FALSE,
  "token_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "core_auth_credentials" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "login" VARCHAR(160) NOT NULL UNIQUE,
  "password_hash" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "core_auth_sessions" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "refresh_token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "core_auth_sessions_user_id_idx" ON "core_auth_sessions"("user_id");
CREATE INDEX "core_auth_sessions_expires_at_idx" ON "core_auth_sessions"("expires_at");

CREATE TABLE "core_roles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(80) NOT NULL UNIQUE,
  "name" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','DISABLED')),
  "company_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "core_roles_company_id_idx" ON "core_roles"("company_id");

CREATE TABLE "core_permissions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(120) NOT NULL UNIQUE,
  "description" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "core_role_permissions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "core_role_permissions_role_permission_key" UNIQUE ("role_id","permission_id")
);
CREATE INDEX "core_role_permissions_permission_id_idx" ON "core_role_permissions"("permission_id");

CREATE TABLE "core_user_role_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "scope_type" VARCHAR(20) NOT NULL CHECK ("scope_type" IN ('GLOBAL','COMPANY','BRANCH')),
  "company_id" UUID,
  "branch_id" UUID,
  "scope_key" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "core_user_role_assignments_scope_key" UNIQUE ("user_id","role_id","scope_key"),
  CONSTRAINT "core_user_role_assignments_scope_shape" CHECK (
    ("scope_type"='GLOBAL' AND "company_id" IS NULL AND "branch_id" IS NULL) OR
    ("scope_type"='COMPANY' AND "company_id" IS NOT NULL AND "branch_id" IS NULL) OR
    ("scope_type"='BRANCH' AND "company_id" IS NOT NULL AND "branch_id" IS NOT NULL)
  )
);
CREATE INDEX "core_user_role_assignments_user_id_idx" ON "core_user_role_assignments"("user_id");
CREATE INDEX "core_user_role_assignments_role_id_idx" ON "core_user_role_assignments"("role_id");
CREATE INDEX "core_user_role_assignments_company_id_idx" ON "core_user_role_assignments"("company_id");
CREATE INDEX "core_user_role_assignments_branch_id_idx" ON "core_user_role_assignments"("branch_id");

CREATE TABLE "core_companies" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(30) NOT NULL UNIQUE,
  "name" VARCHAR(160) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','SUSPENDED')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "core_branches" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','SUSPENDED')),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "core_branches_company_code_key" UNIQUE ("company_id","code")
);
CREATE INDEX "core_branches_company_id_idx" ON "core_branches"("company_id");

CREATE TABLE "core_audit_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" UUID,
  "company_id" UUID,
  "branch_id" UUID,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(120),
  "action" VARCHAR(120) NOT NULL,
  "before_data" JSONB,
  "after_data" JSONB,
  "metadata" JSONB,
  "request_id" VARCHAR(100),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "core_audit_records_actor_id_idx" ON "core_audit_records"("actor_id");
CREATE INDEX "core_audit_records_company_id_idx" ON "core_audit_records"("company_id");
CREATE INDEX "core_audit_records_branch_id_idx" ON "core_audit_records"("branch_id");
CREATE INDEX "core_audit_records_occurred_at_idx" ON "core_audit_records"("occurred_at");

CREATE TABLE "core_file_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "original_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" >= 0),
  "storage_key" VARCHAR(180) NOT NULL UNIQUE,
  "checksum_sha256" VARCHAR(64) NOT NULL,
  "uploaded_by" UUID,
  "company_id" UUID,
  "branch_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "core_file_records_uploaded_by_idx" ON "core_file_records"("uploaded_by");
CREATE INDEX "core_file_records_company_id_idx" ON "core_file_records"("company_id");
CREATE INDEX "core_file_records_branch_id_idx" ON "core_file_records"("branch_id");

CREATE TABLE "core_notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipient_user_id" UUID NOT NULL,
  "channel" VARCHAR(20) NOT NULL CHECK ("channel" IN ('IN_APP')),
  "subject" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','SENT','FAILED')),
  "error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ(6)
);
CREATE INDEX "core_notifications_recipient_user_id_idx" ON "core_notifications"("recipient_user_id");
CREATE INDEX "core_notifications_status_idx" ON "core_notifications"("status");
