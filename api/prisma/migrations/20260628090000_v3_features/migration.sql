-- v3 features: secrets, API tokens, nodes, backup records, preview/runtime/node on projects

-- Secrets store (per-system encrypted key-value with versioned rotation)
CREATE TABLE "secrets" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "secrets_project_id_idx" ON "secrets"("project_id");
CREATE UNIQUE INDEX "secrets_project_id_key_key" ON "secrets"("project_id", "key");

ALTER TABLE "secrets" ADD CONSTRAINT "secrets_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Scoped API tokens
CREATE TABLE "api_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens"("user_id");

ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Multi-node registry
CREATE TABLE "nodes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "last_health_at" TIMESTAMP(3),
    "capacity" TEXT,
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nodes_name_key" ON "nodes"("name");

-- Backup records (tracks backups across storage backends)
CREATE TABLE "backup_records" (
    "id" SERIAL NOT NULL,
    "stamp" TEXT NOT NULL,
    "backend" TEXT NOT NULL DEFAULT 'local',
    "location" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "manifest" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backup_records_stamp_key" ON "backup_records"("stamp");
CREATE INDEX "backup_records_created_at_idx" ON "backup_records"("created_at");

-- Extend projects for preview environments, selectable runtimes, and multi-node placement
ALTER TABLE "projects" ADD COLUMN "is_preview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN "source_branch" TEXT;
ALTER TABLE "projects" ADD COLUMN "pull_request_number" INTEGER;
ALTER TABLE "projects" ADD COLUMN "preview_expires_at" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN "runtime" TEXT;
ALTER TABLE "projects" ADD COLUMN "node_id" INTEGER;

CREATE INDEX "projects_is_preview_idx" ON "projects"("is_preview");
CREATE INDEX "projects_node_id_idx" ON "projects"("node_id");

ALTER TABLE "projects" ADD CONSTRAINT "projects_node_id_fkey"
    FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
