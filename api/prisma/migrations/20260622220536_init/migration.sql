-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "container_id" TEXT,
    "image_id" TEXT,
    "port" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'building',
    "env_vars" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_image_id" TEXT,
    "previous_container_id" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "deploy_type" TEXT,
    "basic_user" TEXT,
    "basic_hash" TEXT,
    "health_state" TEXT,
    "health_status" INTEGER,
    "health_response_ms" INTEGER,
    "health_checked_at" TEXT,
    "health_failures" INTEGER NOT NULL DEFAULT 0,
    "health_path" TEXT NOT NULL DEFAULT '/',
    "route_published" BOOLEAN NOT NULL DEFAULT false,
    "attestation_state" TEXT,
    "attestation_checked_at" TEXT,
    "last_error" TEXT,
    "last_error_stage" TEXT,
    "last_error_hint" TEXT,
    "last_error_excerpt" TEXT,
    "repo" TEXT,
    "deploy_branch" TEXT NOT NULL DEFAULT 'main',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "limit_memory_mb" INTEGER,
    "limit_cpu" DOUBLE PRECISION,
    "limit_pids" INTEGER,
    "limit_restart_policy" TEXT,
    "limit_log_max_size" TEXT,
    "limit_log_max_file" INTEGER,
    "github_deploy_status" TEXT,
    "github_deploy_detail" TEXT,
    "github_deploy_at" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prev_hash" TEXT,
    "hash" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "jti" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_bans" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "deploy_history" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "image_id" TEXT,
    "container_id" TEXT,
    "deployed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "deploy_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stats_history" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "cpu_percent" DOUBLE PRECISION,
    "memory_mb" DOUBLE PRECISION,
    "memory_limit_mb" DOUBLE PRECISION,
    "rx_bytes" BIGINT,
    "tx_bytes" BIGINT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stats_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "projects_name_key" ON "projects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_repo_idx" ON "projects"("repo");

-- CreateIndex
CREATE INDEX "projects_is_primary_idx" ON "projects"("is_primary");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_jti_key" ON "sessions"("jti");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ip_bans_ip_key" ON "ip_bans"("ip");

-- CreateIndex
CREATE INDEX "ip_bans_ip_idx" ON "ip_bans"("ip");

-- CreateIndex
CREATE INDEX "deploy_history_project_id_idx" ON "deploy_history"("project_id");

-- CreateIndex
CREATE INDEX "stats_history_project_id_recorded_at_idx" ON "stats_history"("project_id", "recorded_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_bans" ADD CONSTRAINT "ip_bans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_history" ADD CONSTRAINT "deploy_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stats_history" ADD CONSTRAINT "stats_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
