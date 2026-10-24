-- Preserve all existing answers. Version zero identifies the pre-versioning rows.
ALTER TABLE "Answer"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mutationId" TEXT;
