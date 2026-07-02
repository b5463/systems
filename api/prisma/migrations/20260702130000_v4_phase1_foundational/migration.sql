-- V4 Phase 1: foundational org-scoped tables. New tables beside the legacy
-- ones; nothing reads them until the owning feature flags are enabled.
-- Composite indexes ship in the same migration as each table (roadmap rule).

CREATE TABLE "organisations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

CREATE TABLE "admin_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");
CREATE INDEX "admin_users_organisation_id_idx" ON "admin_users"("organisation_id");

ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");
CREATE INDEX "admin_sessions_admin_user_id_created_at_idx" ON "admin_sessions"("admin_user_id", "created_at" DESC);

ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Org-scoped, entity-addressed, hash-chained audit (canonicalV4 in util/audit).
CREATE TABLE "audit_log_v4" (
    "id" SERIAL NOT NULL,
    "organisation_id" UUID NOT NULL,
    "admin_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "request_id" TEXT,
    "prev_hash" TEXT,
    "hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_v4_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_v4_admin_user_id_created_at_idx" ON "audit_log_v4"("admin_user_id", "created_at" DESC);
CREATE INDEX "audit_log_v4_entity_type_entity_id_created_at_idx" ON "audit_log_v4"("entity_type", "entity_id", "created_at" DESC);
CREATE INDEX "audit_log_v4_organisation_id_created_at_idx" ON "audit_log_v4"("organisation_id", "created_at" DESC);
