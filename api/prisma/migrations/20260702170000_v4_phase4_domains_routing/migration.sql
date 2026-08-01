-- AlterTable
ALTER TABLE "domains" ADD COLUMN     "is_canonical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "tls_status" TEXT,
ADD COLUMN     "verification_expires_at" TIMESTAMP(3),
ADD COLUMN     "verification_method" TEXT,
ADD COLUMN     "verification_token" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "system_environments" ADD COLUMN     "route_last_error" TEXT,
ADD COLUMN     "route_last_published_at" TIMESTAMP(3),
ADD COLUMN     "route_status" TEXT NOT NULL DEFAULT 'inactive';

-- CreateTable
CREATE TABLE "system_environment_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "domain_id" UUID NOT NULL,
    "route_status" TEXT NOT NULL DEFAULT 'inactive',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_environment_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_publication_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "domain_id" UUID,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_publication_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "system_id" UUID NOT NULL,
    "environment_id" UUID,
    "message" TEXT NOT NULL DEFAULT 'This service is temporarily unavailable for maintenance.',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_environment_routes_organisation_id_system_id_idx" ON "system_environment_routes"("organisation_id", "system_id");

-- CreateIndex
CREATE INDEX "system_environment_routes_organisation_id_route_status_idx" ON "system_environment_routes"("organisation_id", "route_status");

-- CreateIndex
CREATE UNIQUE INDEX "system_environment_routes_environment_id_domain_id_key" ON "system_environment_routes"("environment_id", "domain_id");

-- CreateIndex
CREATE INDEX "route_publication_attempts_organisation_id_system_id_attemp_idx" ON "route_publication_attempts"("organisation_id", "system_id", "attempted_at" DESC);

-- CreateIndex
CREATE INDEX "maintenance_windows_organisation_id_system_id_idx" ON "maintenance_windows"("organisation_id", "system_id");

-- CreateIndex
CREATE INDEX "maintenance_windows_organisation_id_active_starts_at_ends_a_idx" ON "maintenance_windows"("organisation_id", "active", "starts_at", "ends_at");

