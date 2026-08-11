-- Sync DB with current Prisma schema (safe to re-run where objects already exist)

DO $$ BEGIN CREATE TYPE "AiAnalysisSource" AS ENUM ('TEXT', 'IMAGE', 'TEXT_IMAGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiSafetyLevel" AS ENUM ('NORMAL', 'CAUTION', 'URGENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiFeedbackUsefulness" AS ENUM ('YES', 'NO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TechnicianAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'UNAVAILABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AttachmentKind" AS ENUM ('REQUEST', 'COMPLETION_BEFORE', 'COMPLETION_AFTER', 'COMPLETION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "CostType" ADD VALUE IF NOT EXISTS 'SERVICE';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_REASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_STARTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_CLOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MAINTENANCE_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AI_ANALYSIS_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXPENSE_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXPENSE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXPENSE_REJECTED';

ALTER TABLE "Technician"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "availability" "TechnicianAvailability" NOT NULL DEFAULT 'AVAILABLE';

CREATE INDEX IF NOT EXISTS "Technician_isActive_idx" ON "Technician"("isActive");
CREATE INDEX IF NOT EXISTS "Technician_availability_idx" ON "Technician"("availability");

ALTER TABLE "MaintenanceAttachment"
  ADD COLUMN IF NOT EXISTS "workOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "kind" "AttachmentKind" NOT NULL DEFAULT 'REQUEST';

CREATE INDEX IF NOT EXISTS "MaintenanceAttachment_workOrderId_idx" ON "MaintenanceAttachment"("workOrderId");
CREATE INDEX IF NOT EXISTS "MaintenanceAttachment_kind_idx" ON "MaintenanceAttachment"("kind");

DO $$ BEGIN
  ALTER TABLE "MaintenanceAttachment"
    ADD CONSTRAINT "MaintenanceAttachment_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "WorkOrder"
  ADD COLUMN IF NOT EXISTS "materialsUsed" TEXT,
  ADD COLUMN IF NOT EXISTS "additionalNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "unassignedAt" TIMESTAMP(3);

ALTER TABLE "AIAnalysis"
  ADD COLUMN IF NOT EXISTS "attachmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" "AiAnalysisSource" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS "visibleIssue" TEXT,
  ADD COLUMN IF NOT EXISTS "severity" "AiSeverity",
  ADD COLUMN IF NOT EXISTS "safetyWarning" TEXT,
  ADD COLUMN IF NOT EXISTS "safetyLevel" "AiSafetyLevel",
  ADD COLUMN IF NOT EXISTS "safetyDisclaimer" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "priorityConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "humanReviewRecommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "possibleDuplicate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "relatedRequestIds" JSONB,
  ADD COLUMN IF NOT EXISTS "recurringIssueDetected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurringInsight" TEXT,
  ADD COLUMN IF NOT EXISTS "recommendedTechnicianId" TEXT,
  ADD COLUMN IF NOT EXISTS "technicianRecommendReason" TEXT,
  ADD COLUMN IF NOT EXISTS "typicalCostEstimate" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "costCurrency" TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS "costInsightNote" TEXT,
  ADD COLUMN IF NOT EXISTS "unusuallyExpensive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ownerFinalPriority" "MaintenancePriority",
  ADD COLUMN IF NOT EXISTS "ownerAcceptedPriority" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "feedbackUseful" "AiFeedbackUsefulness",
  ADD COLUMN IF NOT EXISTS "feedbackNote" TEXT,
  ADD COLUMN IF NOT EXISTS "feedbackAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "feedbackByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "AIAnalysis_attachmentId_idx" ON "AIAnalysis"("attachmentId");
CREATE INDEX IF NOT EXISTS "AIAnalysis_source_idx" ON "AIAnalysis"("source");
CREATE INDEX IF NOT EXISTS "AIAnalysis_recommendedTechnicianId_idx" ON "AIAnalysis"("recommendedTechnicianId");
CREATE INDEX IF NOT EXISTS "AIAnalysis_createdAt_idx" ON "AIAnalysis"("createdAt");

DO $$ BEGIN
  ALTER TABLE "AIAnalysis"
    ADD CONSTRAINT "AIAnalysis_attachmentId_fkey"
    FOREIGN KEY ("attachmentId") REFERENCES "MaintenanceAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AIAnalysis"
    ADD CONSTRAINT "AIAnalysis_recommendedTechnicianId_fkey"
    FOREIGN KEY ("recommendedTechnicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AIAnalysis"
    ADD CONSTRAINT "AIAnalysis_feedbackByUserId_fkey"
    FOREIGN KEY ("feedbackByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "MaintenanceCost"
  ADD COLUMN IF NOT EXISTS "propertyId" TEXT,
  ADD COLUMN IF NOT EXISTS "technicianId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "receiptPath" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptFileType" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT,
  ADD COLUMN IF NOT EXISTS "adjustsExpenseId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "MaintenanceCost" mc
SET "propertyId" = mr."propertyId"
FROM "MaintenanceRequest" mr
WHERE mc."maintenanceRequestId" = mr.id
  AND mc."propertyId" IS NULL;

DELETE FROM "MaintenanceCost" WHERE "propertyId" IS NULL;

UPDATE "MaintenanceCost" mc
SET "createdByUserId" = (
  SELECT u.id FROM "User" u WHERE u.role IN ('OWNER', 'ADMIN') ORDER BY u."createdAt" ASC LIMIT 1
)
WHERE mc."createdByUserId" IS NULL;

DELETE FROM "MaintenanceCost" WHERE "createdByUserId" IS NULL;

DO $$ BEGIN
  ALTER TABLE "MaintenanceCost" ALTER COLUMN "propertyId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MaintenanceCost" ALTER COLUMN "createdByUserId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "MaintenanceCost_maintenanceRequestId_idx" ON "MaintenanceCost"("maintenanceRequestId");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_propertyId_idx" ON "MaintenanceCost"("propertyId");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_technicianId_idx" ON "MaintenanceCost"("technicianId");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_workOrderId_idx" ON "MaintenanceCost"("workOrderId");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_createdByUserId_idx" ON "MaintenanceCost"("createdByUserId");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_status_idx" ON "MaintenanceCost"("status");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_costType_idx" ON "MaintenanceCost"("costType");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_expenseDate_idx" ON "MaintenanceCost"("expenseDate");
CREATE INDEX IF NOT EXISTS "MaintenanceCost_adjustsExpenseId_idx" ON "MaintenanceCost"("adjustsExpenseId");

DO $$ BEGIN
  ALTER TABLE "MaintenanceCost"
    ADD CONSTRAINT "MaintenanceCost_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MaintenanceCost"
    ADD CONSTRAINT "MaintenanceCost_technicianId_fkey"
    FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MaintenanceCost"
    ADD CONSTRAINT "MaintenanceCost_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MaintenanceCost"
    ADD CONSTRAINT "MaintenanceCost_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MaintenanceCost"
    ADD CONSTRAINT "MaintenanceCost_adjustsExpenseId_fkey"
    FOREIGN KEY ("adjustsExpenseId") REFERENCES "MaintenanceCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "entityType" TEXT,
  ADD COLUMN IF NOT EXISTS "entityId" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx" ON "Notification"("isRead");
CREATE INDEX IF NOT EXISTS "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "description" TEXT;
