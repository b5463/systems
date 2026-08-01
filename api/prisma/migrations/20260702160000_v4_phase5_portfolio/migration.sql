-- CreateTable
CREATE TABLE "portfolio_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "page_type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_portfolio_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "short_description" TEXT,
    "full_description" TEXT,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "cover_media_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "completeness_score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_portfolio_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "block_type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "published_by" UUID,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_redirects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL DEFAULT 301,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_forms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "data" TEXT NOT NULL,
    "lead_status" TEXT NOT NULL DEFAULT 'new',
    "source_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "uploaded_by" UUID,
    "storage_key" TEXT NOT NULL,
    "public_url" TEXT,
    "media_type" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'quarantined',
    "alt_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_pages_organisation_id_locale_status_idx" ON "portfolio_pages"("organisation_id", "locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_pages_organisation_id_locale_slug_key" ON "portfolio_pages"("organisation_id", "locale", "slug");

-- CreateIndex
CREATE INDEX "product_portfolio_profiles_organisation_id_locale_idx" ON "product_portfolio_profiles"("organisation_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_portfolio_profiles_product_id_locale_key" ON "product_portfolio_profiles"("product_id", "locale");

-- CreateIndex
CREATE INDEX "portfolio_blocks_organisation_id_owner_type_owner_id_locale_idx" ON "portfolio_blocks"("organisation_id", "owner_type", "owner_id", "locale");

-- CreateIndex
CREATE INDEX "portfolio_snapshots_organisation_id_locale_published_at_idx" ON "portfolio_snapshots"("organisation_id", "locale", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_snapshots_organisation_id_locale_version_key" ON "portfolio_snapshots"("organisation_id", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_redirects_organisation_id_locale_from_path_key" ON "portfolio_redirects"("organisation_id", "locale", "from_path");

-- CreateIndex
CREATE UNIQUE INDEX "public_forms_organisation_id_slug_key" ON "public_forms"("organisation_id", "slug");

-- CreateIndex
CREATE INDEX "form_submissions_organisation_id_form_id_created_at_idx" ON "form_submissions"("organisation_id", "form_id", "created_at");

-- CreateIndex
CREATE INDEX "form_submissions_organisation_id_lead_status_idx" ON "form_submissions"("organisation_id", "lead_status");

-- CreateIndex
CREATE INDEX "media_assets_organisation_id_status_idx" ON "media_assets"("organisation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_versions_organisation_id_locale_doc_type_version_key" ON "legal_versions"("organisation_id", "locale", "doc_type", "version");

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "public_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

