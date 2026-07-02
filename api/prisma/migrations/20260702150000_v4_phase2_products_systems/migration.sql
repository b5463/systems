-- V4 Phase 2: Products/Systems data model — nine org-scoped tables created
-- beside the legacy projects world. Composite indexes ship in this same
-- migration (roadmap rule). The bridge script copies projects in;
-- legacy tables remain the operational source of truth until Phase 3.

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "systems" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "product_id" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "system_type" TEXT,
    "current_status" TEXT NOT NULL DEFAULT 'unknown',
    "repo" TEXT,
    "deploy_branch" TEXT NOT NULL DEFAULT 'main',
    "is_primary_root" BOOLEAN NOT NULL DEFAULT false,
    "runtime" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_environments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'production',
    "access_policy" TEXT NOT NULL DEFAULT 'public',
    "health_path" TEXT NOT NULL DEFAULT '/',
    "route_published" BOOLEAN NOT NULL DEFAULT false,
    "basic_user" TEXT,
    "basic_hash" TEXT,
    "current_release_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "container_id" TEXT,
    "image_id" TEXT,
    "port" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deployed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "system_id" UUID,
    "environment_id" UUID,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_secrets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infrastructure_metrics" (
    "id" SERIAL NOT NULL,
    "organisation_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "environment_id" UUID,
    "cpu_percent" DOUBLE PRECISION,
    "memory_mb" DOUBLE PRECISION,
    "memory_limit_mb" DOUBLE PRECISION,
    "rx_bytes" BIGINT,
    "tx_bytes" BIGINT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "infrastructure_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_snapshots" (
    "id" SERIAL NOT NULL,
    "organisation_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "environment_id" UUID,
    "state" TEXT,
    "status_code" INTEGER,
    "response_ms" INTEGER,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_project_map" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "project_id" INTEGER NOT NULL,
    "system_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "release_id" UUID,
    "domain_id" UUID,
    "migrated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "legacy_project_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organisation_id_status_idx" ON "products"("organisation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_organisation_id_slug_key" ON "products"("organisation_id", "slug");

-- CreateIndex
CREATE INDEX "systems_organisation_id_current_status_idx" ON "systems"("organisation_id", "current_status");

-- CreateIndex
CREATE INDEX "systems_product_id_idx" ON "systems"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "systems_organisation_id_slug_key" ON "systems"("organisation_id", "slug");

-- CreateIndex
CREATE INDEX "system_environments_organisation_id_idx" ON "system_environments"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_environments_system_id_name_key" ON "system_environments"("system_id", "name");

-- CreateIndex
CREATE INDEX "releases_environment_id_deployed_at_idx" ON "releases"("environment_id", "deployed_at" DESC);

-- CreateIndex
CREATE INDEX "releases_system_id_deployed_at_idx" ON "releases"("system_id", "deployed_at" DESC);

-- CreateIndex
CREATE INDEX "releases_organisation_id_idx" ON "releases"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "domains_hostname_key" ON "domains"("hostname");

-- CreateIndex
CREATE INDEX "domains_organisation_id_idx" ON "domains"("organisation_id");

-- CreateIndex
CREATE INDEX "domains_system_id_idx" ON "domains"("system_id");

-- CreateIndex
CREATE INDEX "environment_secrets_organisation_id_idx" ON "environment_secrets"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "environment_secrets_environment_id_key_key" ON "environment_secrets"("environment_id", "key");

-- CreateIndex
CREATE INDEX "infrastructure_metrics_system_id_recorded_at_idx" ON "infrastructure_metrics"("system_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "infrastructure_metrics_organisation_id_idx" ON "infrastructure_metrics"("organisation_id");

-- CreateIndex
CREATE INDEX "health_snapshots_system_id_checked_at_idx" ON "health_snapshots"("system_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "health_snapshots_organisation_id_idx" ON "health_snapshots"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_project_map_project_id_key" ON "legacy_project_map"("project_id");

-- CreateIndex
CREATE INDEX "legacy_project_map_organisation_id_idx" ON "legacy_project_map"("organisation_id");

-- CreateIndex
CREATE INDEX "legacy_project_map_system_id_idx" ON "legacy_project_map"("system_id");

-- AddForeignKey
ALTER TABLE "systems" ADD CONSTRAINT "systems_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_environments" ADD CONSTRAINT "system_environments_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "system_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_secrets" ADD CONSTRAINT "environment_secrets_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "system_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

