-- CreateEnum
CREATE TYPE "locale" AS ENUM ('tet', 'pt', 'id', 'en');

-- CreateEnum
CREATE TYPE "role" AS ENUM ('SUPER_ADMIN', 'NATIONAL_SECRETARY', 'MUNICIPAL_COORDINATOR', 'MEDIA_EDITOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "member_rank" AS ENUM ('SYMPATHIZER', 'MILITANT', 'CADRE');

-- CreateEnum
CREATE TYPE "id_document_type" AS ENUM ('BILHETE_IDENTIDADE', 'CARTAO_ELEITORAL', 'PASSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "education_level" AS ENUM ('NONE', 'PRIMARY', 'PRE_SECONDARY', 'SECONDARY', 'VOCATIONAL', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE');

-- CreateEnum
CREATE TYPE "registration_channel" AS ENUM ('ONLINE', 'FIELD_IMPORT', 'BACKOFFICE', 'LEGACY_MIGRATION');

-- CreateEnum
CREATE TYPE "post_type" AS ENUM ('NEWS', 'PRESS_RELEASE', 'ARTICLE', 'STATEMENT');

-- CreateEnum
CREATE TYPE "publish_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'VIDEO_EMBED');

-- CreateEnum
CREATE TYPE "media_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('STATUTE', 'POLITICAL_PROGRAM', 'MANIFESTO', 'BULLETIN', 'LEGISLATION', 'RESOLUTION', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('CONGRESS', 'RALLY', 'COMMUNITY_DISCUSSION', 'POLITICAL_EDUCATION', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "attendance_method" AS ENUM ('QR_SCAN', 'MANUAL', 'SELF_CHECKIN');

-- CreateEnum
CREATE TYPE "leadership_level" AS ENUM ('PRESIDENCY', 'POLITICAL_COMMISSION', 'CENTRAL_COMMITTEE', 'NATIONAL_SECRETARIAT', 'MUNICIPAL_COMMITTEE', 'WING');

-- CreateEnum
CREATE TYPE "page_key" AS ENUM ('ABOUT', 'HISTORY', 'IDEOLOGY', 'PROGRAM');

-- CreateEnum
CREATE TYPE "aspiration_category" AS ENUM ('LAND_PROPERTY', 'AGRICULTURE_FISHERIES', 'LABOUR_EMPLOYMENT', 'EDUCATION', 'HEALTH', 'INFRASTRUCTURE', 'WATER_SANITATION', 'ELECTRICITY', 'SOCIAL_PROTECTION', 'CORRUPTION_GOVERNANCE', 'YOUTH', 'WOMEN_GENDER', 'VETERANS', 'OTHER');

-- CreateEnum
CREATE TYPE "submitter_type" AS ENUM ('CITIZEN', 'WORKER', 'FARMER', 'FISHER', 'STUDENT', 'VETERAN', 'PARTY_MEMBER', 'OTHER');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('NEW', 'ACKNOWLEDGED', 'IN_REVIEW', 'FORWARDED', 'RESOLVED', 'CLOSED', 'SPAM');

-- CreateEnum
CREATE TYPE "ticket_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "audit_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('TELEGRAM', 'EMAIL');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('UPLOADED', 'VALIDATING', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "municipalities" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(4) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "official_name" VARCHAR(160),
    "capital" VARCHAR(80),
    "is_special_region" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_posts" (
    "id" SERIAL NOT NULL,
    "municipality_id" INTEGER NOT NULL,
    "code" VARCHAR(16),
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucos" (
    "id" SERIAL NOT NULL,
    "admin_post_id" INTEGER NOT NULL,
    "code" VARCHAR(16),
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aldeias" (
    "id" SERIAL NOT NULL,
    "suco_id" INTEGER NOT NULL,
    "code" VARCHAR(20),
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aldeias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32),
    "role" "role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "municipality_id" INTEGER,
    "preferred_locale" "locale" NOT NULL DEFAULT 'tet',
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" INET,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret_enc" TEXT,
    "two_factor_enabled_at" TIMESTAMP(3),
    "telegram_chat_id" VARCHAR(32),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "two_factor_verified" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip_address" INET,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "member_number" VARCHAR(32),
    "registration_ref" VARCHAR(24) NOT NULL,
    "qr_token" VARCHAR(64) NOT NULL,
    "status" "member_status" NOT NULL DEFAULT 'PENDING',
    "rank" "member_rank" NOT NULL DEFAULT 'MILITANT',
    "channel" "registration_channel" NOT NULL DEFAULT 'ONLINE',
    "full_name" VARCHAR(180) NOT NULL,
    "gender" "gender" NOT NULL,
    "birth_date" DATE NOT NULL,
    "birth_place" VARCHAR(120),
    "id_document_type" "id_document_type" NOT NULL DEFAULT 'BILHETE_IDENTIDADE',
    "id_number_enc" TEXT,
    "id_number_hash" VARCHAR(64),
    "id_number_last4" VARCHAR(4),
    "occupation" VARCHAR(160),
    "education_level" "education_level",
    "phone" VARCHAR(32),
    "email" VARCHAR(160),
    "municipality_id" INTEGER NOT NULL,
    "admin_post_id" INTEGER,
    "suco_id" INTEGER,
    "aldeia_id" INTEGER,
    "address_line" VARCHAR(255),
    "photo_id" TEXT,
    "id_document_scan_id" TEXT,
    "motivation" TEXT,
    "consent_version" VARCHAR(20) NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "submitted_ip" INET,
    "joined_at" DATE,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" TEXT,
    "rejection_reason" TEXT,
    "suspension_reason" TEXT,
    "created_by_id" TEXT,
    "import_job_id" TEXT,
    "legacy_source" VARCHAR(40),
    "legacy_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_status_changes" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "from_status" "member_status",
    "to_status" "member_status" NOT NULL,
    "reason" TEXT,
    "changed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_cards" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "signing_kid" VARCHAR(32) NOT NULL,
    "pdf_key" TEXT,
    "png_key" TEXT,
    "issued_by_id" TEXT,

    CONSTRAINT "membership_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_number_sequences" (
    "municipality_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "member_number_sequences_pkey" PRIMARY KEY ("municipality_id","year")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_key" TEXT NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'UPLOADED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "created_by_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "kind" "media_kind" NOT NULL,
    "visibility" "media_visibility" NOT NULL DEFAULT 'PUBLIC',
    "storage_key" TEXT,
    "external_url" VARCHAR(500),
    "original_name" VARCHAR(255),
    "mime_type" VARCHAR(100),
    "size_bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "duration_sec" INTEGER,
    "sha256" VARCHAR(64),
    "blur_data_url" TEXT,
    "alt_text" JSONB,
    "credit" VARCHAR(160),
    "uploaded_by_id" TEXT,
    "legacy_source" VARCHAR(40),
    "legacy_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "cover_id" TEXT,
    "event_id" TEXT,
    "status" "publish_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_translations" (
    "id" TEXT NOT NULL,
    "album_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,

    CONSTRAINT "album_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_items" (
    "album_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "caption" JSONB,

    CONSTRAINT "album_items_pkey" PRIMARY KEY ("album_id","media_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "label" VARCHAR(80) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "type" "post_type" NOT NULL DEFAULT 'NEWS',
    "status" "publish_status" NOT NULL DEFAULT 'DRAFT',
    "category_id" TEXT,
    "municipality_id" INTEGER,
    "cover_id" TEXT,
    "author_id" TEXT,
    "byline" VARCHAR(160),
    "reviewed_by_id" TEXT,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "pinned_to_hero" BOOLEAN NOT NULL DEFAULT false,
    "attachment_id" TEXT,
    "published_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "legacy_source" VARCHAR(40),
    "legacy_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_translations" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "slug" VARCHAR(240) NOT NULL,
    "excerpt" TEXT,
    "content_json" JSONB,
    "content_html" TEXT,
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(170),
    "reading_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_views_daily" (
    "post_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_views_daily_pkey" PRIMARY KEY ("post_id","day")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "type" "document_type" NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "version_label" VARCHAR(40),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "legacy_source" VARCHAR(40),
    "legacy_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_translations" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "file_id" TEXT,

    CONSTRAINT "document_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_sections" (
    "id" TEXT NOT NULL,
    "page" "page_key" NOT NULL,
    "icon" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "legacy_source" VARCHAR(40),
    "legacy_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_section_translations" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_json" JSONB,

    CONSTRAINT "page_section_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_slides" (
    "id" TEXT NOT NULL,
    "image_id" TEXT,
    "cta_href" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_slide_translations" (
    "id" TEXT NOT NULL,
    "slide_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "headline" VARCHAR(160) NOT NULL,
    "subline" VARCHAR(300),
    "cta_label" VARCHAR(60),

    CONSTRAINT "hero_slide_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "leadership" (
    "id" TEXT NOT NULL,
    "level" "leadership_level" NOT NULL,
    "municipality_id" INTEGER,
    "member_id" TEXT,
    "full_name" VARCHAR(180) NOT NULL,
    "photo_id" TEXT,
    "phone" VARCHAR(32),
    "email" VARCHAR(160),
    "is_coordinator" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "term_start" DATE,
    "term_end" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "legacy_source" VARCHAR(40),
    "legacy_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leadership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leadership_translations" (
    "id" TEXT NOT NULL,
    "leadership_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "position_title" VARCHAR(220) NOT NULL,
    "bio" TEXT,

    CONSTRAINT "leadership_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_offices" (
    "id" TEXT NOT NULL,
    "municipality_id" INTEGER NOT NULL,
    "admin_post_id" INTEGER,
    "coordinator_id" TEXT,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(255),
    "phone" VARCHAR(32),
    "email" VARCHAR(160),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "opening_hours" JSONB,
    "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "type" "event_type" NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "timezone" VARCHAR(40) NOT NULL DEFAULT 'Asia/Dili',
    "municipality_id" INTEGER,
    "suco_id" INTEGER,
    "venue" VARCHAR(200),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "cover_id" TEXT,
    "capacity" INTEGER,
    "expected_turnout" INTEGER,
    "checkin_token" VARCHAR(64) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_translations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "locale" "locale" NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "summary" VARCHAR(400),
    "content_html" TEXT,

    CONSTRAINT "event_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_attendances" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "member_id" TEXT,
    "guest_name" VARCHAR(180),
    "guest_phone" VARCHAR(32),
    "guest_gender" "gender",
    "method" "attendance_method" NOT NULL DEFAULT 'MANUAL',
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_id" TEXT,

    CONSTRAINT "event_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aspirations" (
    "id" TEXT NOT NULL,
    "ticket_number" VARCHAR(24) NOT NULL,
    "tracking_code_hash" VARCHAR(64) NOT NULL,
    "category" "aspiration_category" NOT NULL,
    "submitter_type" "submitter_type" NOT NULL DEFAULT 'CITIZEN',
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "name" VARCHAR(180),
    "phone" VARCHAR(32),
    "email" VARCHAR(160),
    "municipality_id" INTEGER,
    "suco_id" INTEGER,
    "subject" VARCHAR(220) NOT NULL,
    "message" TEXT NOT NULL,
    "locale" "locale" NOT NULL DEFAULT 'tet',
    "status" "ticket_status" NOT NULL DEFAULT 'NEW',
    "priority" "ticket_priority" NOT NULL DEFAULT 'NORMAL',
    "assigned_to_id" TEXT,
    "ip_hash" VARCHAR(64),
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aspirations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aspiration_attachments" (
    "aspiration_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,

    CONSTRAINT "aspiration_attachments_pkey" PRIMARY KEY ("aspiration_id","media_id")
);

-- CreateTable
CREATE TABLE "aspiration_notes" (
    "id" TEXT NOT NULL,
    "aspiration_id" TEXT NOT NULL,
    "author_id" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aspiration_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(160),
    "phone" VARCHAR(32),
    "subject" VARCHAR(220),
    "message" TEXT NOT NULL,
    "locale" "locale" NOT NULL DEFAULT 'tet',
    "ip_hash" VARCHAR(64),
    "read_at" TIMESTAMP(3),
    "read_by_id" TEXT,
    "is_spam" BOOLEAN NOT NULL DEFAULT false,
    "legacy_source" VARCHAR(40),
    "legacy_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" TEXT,
    "actor_email" VARCHAR(160),
    "actor_role" "role",
    "action" VARCHAR(80) NOT NULL,
    "severity" "audit_severity" NOT NULL DEFAULT 'INFO',
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(64),
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" VARCHAR(512),
    "request_id" VARCHAR(64),
    "prev_hash" VARCHAR(64),
    "hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "recipient" VARCHAR(200) NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PostToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PostToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_code_key" ON "municipalities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_name_key" ON "municipalities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "municipalities_slug_key" ON "municipalities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "admin_posts_code_key" ON "admin_posts"("code");

-- CreateIndex
CREATE INDEX "admin_posts_municipality_id_idx" ON "admin_posts"("municipality_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_posts_municipality_id_slug_key" ON "admin_posts"("municipality_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "sucos_code_key" ON "sucos"("code");

-- CreateIndex
CREATE INDEX "sucos_admin_post_id_idx" ON "sucos"("admin_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "sucos_admin_post_id_slug_key" ON "sucos"("admin_post_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "aldeias_code_key" ON "aldeias"("code");

-- CreateIndex
CREATE INDEX "aldeias_suco_id_idx" ON "aldeias"("suco_id");

-- CreateIndex
CREATE UNIQUE INDEX "aldeias_suco_id_slug_key" ON "aldeias"("suco_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_municipality_id_idx" ON "users"("municipality_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "user_recovery_codes_user_id_idx" ON "user_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "members_member_number_key" ON "members"("member_number");

-- CreateIndex
CREATE UNIQUE INDEX "members_registration_ref_key" ON "members"("registration_ref");

-- CreateIndex
CREATE UNIQUE INDEX "members_qr_token_key" ON "members"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "members_id_number_hash_key" ON "members"("id_number_hash");

-- CreateIndex
CREATE UNIQUE INDEX "members_photo_id_key" ON "members"("photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_id_document_scan_id_key" ON "members"("id_document_scan_id");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "members_municipality_id_status_idx" ON "members"("municipality_id", "status");

-- CreateIndex
CREATE INDEX "members_admin_post_id_idx" ON "members"("admin_post_id");

-- CreateIndex
CREATE INDEX "members_suco_id_idx" ON "members"("suco_id");

-- CreateIndex
CREATE INDEX "members_aldeia_id_idx" ON "members"("aldeia_id");

-- CreateIndex
CREATE INDEX "members_gender_birth_date_idx" ON "members"("gender", "birth_date");

-- CreateIndex
CREATE INDEX "members_phone_idx" ON "members"("phone");

-- CreateIndex
CREATE INDEX "members_created_at_idx" ON "members"("created_at");

-- CreateIndex
CREATE INDEX "members_full_name_idx" ON "members"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "members_legacy_source_legacy_id_key" ON "members"("legacy_source", "legacy_id");

-- CreateIndex
CREATE INDEX "member_status_changes_member_id_created_at_idx" ON "member_status_changes"("member_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "membership_cards_member_id_version_key" ON "membership_cards"("member_id", "version");

-- CreateIndex
CREATE INDEX "import_jobs_created_by_id_idx" ON "import_jobs"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_kind_visibility_idx" ON "media_assets"("kind", "visibility");

-- CreateIndex
CREATE INDEX "media_assets_sha256_idx" ON "media_assets"("sha256");

-- CreateIndex
CREATE INDEX "media_assets_created_at_idx" ON "media_assets"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_legacy_source_legacy_id_key" ON "media_assets"("legacy_source", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "albums_slug_key" ON "albums"("slug");

-- CreateIndex
CREATE INDEX "albums_status_published_at_idx" ON "albums"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "album_translations_album_id_locale_key" ON "album_translations"("album_id", "locale");

-- CreateIndex
CREATE INDEX "album_items_album_id_sort_order_idx" ON "album_items"("album_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "categories_key_key" ON "categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_category_id_locale_key" ON "category_translations"("category_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "category_translations_locale_slug_key" ON "category_translations"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "posts_type_status_published_at_idx" ON "posts"("type", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "posts_status_scheduled_at_idx" ON "posts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "posts_category_id_idx" ON "posts"("category_id");

-- CreateIndex
CREATE INDEX "posts_municipality_id_idx" ON "posts"("municipality_id");

-- CreateIndex
CREATE INDEX "posts_pinned_to_hero_published_at_idx" ON "posts"("pinned_to_hero", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "posts_legacy_source_legacy_id_key" ON "posts"("legacy_source", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_translations_post_id_locale_key" ON "post_translations"("post_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "post_translations_locale_slug_key" ON "post_translations"("locale", "slug");

-- CreateIndex
CREATE INDEX "post_views_daily_day_idx" ON "post_views_daily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "documents_slug_key" ON "documents"("slug");

-- CreateIndex
CREATE INDEX "documents_type_is_public_published_at_idx" ON "documents"("type", "is_public", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "documents_legacy_source_legacy_id_key" ON "documents"("legacy_source", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_translations_document_id_locale_key" ON "document_translations"("document_id", "locale");

-- CreateIndex
CREATE INDEX "page_sections_page_sort_order_idx" ON "page_sections"("page", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "page_sections_legacy_source_legacy_id_key" ON "page_sections"("legacy_source", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_section_translations_section_id_locale_key" ON "page_section_translations"("section_id", "locale");

-- CreateIndex
CREATE INDEX "hero_slides_is_active_sort_order_idx" ON "hero_slides"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "hero_slide_translations_slide_id_locale_key" ON "hero_slide_translations"("slide_id", "locale");

-- CreateIndex
CREATE INDEX "leadership_level_is_active_sort_order_idx" ON "leadership"("level", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "leadership_municipality_id_idx" ON "leadership"("municipality_id");

-- CreateIndex
CREATE UNIQUE INDEX "leadership_legacy_source_legacy_id_key" ON "leadership"("legacy_source", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "leadership_translations_leadership_id_locale_key" ON "leadership_translations"("leadership_id", "locale");

-- CreateIndex
CREATE INDEX "branch_offices_municipality_id_is_active_idx" ON "branch_offices"("municipality_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "events_checkin_token_key" ON "events"("checkin_token");

-- CreateIndex
CREATE INDEX "events_starts_at_idx" ON "events"("starts_at");

-- CreateIndex
CREATE INDEX "events_status_is_public_starts_at_idx" ON "events"("status", "is_public", "starts_at");

-- CreateIndex
CREATE INDEX "events_municipality_id_starts_at_idx" ON "events"("municipality_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_translations_event_id_locale_key" ON "event_translations"("event_id", "locale");

-- CreateIndex
CREATE INDEX "event_attendances_event_id_checked_in_at_idx" ON "event_attendances"("event_id", "checked_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_attendances_event_id_member_id_key" ON "event_attendances"("event_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "aspirations_ticket_number_key" ON "aspirations"("ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "aspirations_tracking_code_hash_key" ON "aspirations"("tracking_code_hash");

-- CreateIndex
CREATE INDEX "aspirations_status_created_at_idx" ON "aspirations"("status", "created_at");

-- CreateIndex
CREATE INDEX "aspirations_municipality_id_status_idx" ON "aspirations"("municipality_id", "status");

-- CreateIndex
CREATE INDEX "aspirations_category_idx" ON "aspirations"("category");

-- CreateIndex
CREATE INDEX "aspirations_assigned_to_id_idx" ON "aspirations"("assigned_to_id");

-- CreateIndex
CREATE INDEX "aspiration_notes_aspiration_id_created_at_idx" ON "aspiration_notes"("aspiration_id", "created_at");

-- CreateIndex
CREATE INDEX "contact_messages_read_at_created_at_idx" ON "contact_messages"("read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contact_messages_legacy_source_legacy_id_key" ON "contact_messages"("legacy_source", "legacy_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_severity_created_at_idx" ON "audit_logs"("severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_outbox_status_scheduled_at_idx" ON "notification_outbox"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "_PostToTag_B_index" ON "_PostToTag"("B");

-- AddForeignKey
ALTER TABLE "admin_posts" ADD CONSTRAINT "admin_posts_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucos" ADD CONSTRAINT "sucos_admin_post_id_fkey" FOREIGN KEY ("admin_post_id") REFERENCES "admin_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aldeias" ADD CONSTRAINT "aldeias_suco_id_fkey" FOREIGN KEY ("suco_id") REFERENCES "sucos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_admin_post_id_fkey" FOREIGN KEY ("admin_post_id") REFERENCES "admin_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_suco_id_fkey" FOREIGN KEY ("suco_id") REFERENCES "sucos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_aldeia_id_fkey" FOREIGN KEY ("aldeia_id") REFERENCES "aldeias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_id_document_scan_id_fkey" FOREIGN KEY ("id_document_scan_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_status_changes" ADD CONSTRAINT "member_status_changes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_status_changes" ADD CONSTRAINT "member_status_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_cards" ADD CONSTRAINT "membership_cards_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_cards" ADD CONSTRAINT "membership_cards_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_number_sequences" ADD CONSTRAINT "member_number_sequences_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_translations" ADD CONSTRAINT "album_translations_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_items" ADD CONSTRAINT "album_items_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_items" ADD CONSTRAINT "album_items_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_translations" ADD CONSTRAINT "post_translations_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_views_daily" ADD CONSTRAINT "post_views_daily_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_translations" ADD CONSTRAINT "document_translations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_translations" ADD CONSTRAINT "document_translations_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_section_translations" ADD CONSTRAINT "page_section_translations_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "page_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slides" ADD CONSTRAINT "hero_slides_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_slide_translations" ADD CONSTRAINT "hero_slide_translations_slide_id_fkey" FOREIGN KEY ("slide_id") REFERENCES "hero_slides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leadership" ADD CONSTRAINT "leadership_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leadership" ADD CONSTRAINT "leadership_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leadership" ADD CONSTRAINT "leadership_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leadership_translations" ADD CONSTRAINT "leadership_translations_leadership_id_fkey" FOREIGN KEY ("leadership_id") REFERENCES "leadership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_offices" ADD CONSTRAINT "branch_offices_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_offices" ADD CONSTRAINT "branch_offices_admin_post_id_fkey" FOREIGN KEY ("admin_post_id") REFERENCES "admin_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_offices" ADD CONSTRAINT "branch_offices_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "leadership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_suco_id_fkey" FOREIGN KEY ("suco_id") REFERENCES "sucos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_translations" ADD CONSTRAINT "event_translations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendances" ADD CONSTRAINT "event_attendances_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspirations" ADD CONSTRAINT "aspirations_municipality_id_fkey" FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspirations" ADD CONSTRAINT "aspirations_suco_id_fkey" FOREIGN KEY ("suco_id") REFERENCES "sucos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspirations" ADD CONSTRAINT "aspirations_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspiration_attachments" ADD CONSTRAINT "aspiration_attachments_aspiration_id_fkey" FOREIGN KEY ("aspiration_id") REFERENCES "aspirations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspiration_attachments" ADD CONSTRAINT "aspiration_attachments_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspiration_notes" ADD CONSTRAINT "aspiration_notes_aspiration_id_fkey" FOREIGN KEY ("aspiration_id") REFERENCES "aspirations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspiration_notes" ADD CONSTRAINT "aspiration_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_read_by_id_fkey" FOREIGN KEY ("read_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PostToTag" ADD CONSTRAINT "_PostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
