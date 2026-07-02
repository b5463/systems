-- V4 Phase 0: jobs table (in-process runner skeleton, disabled by default)
-- and request_id on audit entries for request correlation.

-- Request correlation: request_id is metadata, deliberately NOT part of the
-- audit hash-chain canonical fields, so existing chains stay verifiable.
ALTER TABLE "audit_log" ADD COLUMN "request_id" TEXT;

-- Minimal job queue with lock (locked_at/locked_by) and retry/backoff
-- (attempts/max_attempts/next_run_at) fields. Dead-letter after max_attempts.
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "job_type" TEXT NOT NULL,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "last_error" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "jobs_status_job_type_created_at_idx" ON "jobs"("status", "job_type", "created_at");
CREATE INDEX "jobs_status_next_run_at_idx" ON "jobs"("status", "next_run_at");
