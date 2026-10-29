-- Separate reading records are retired. This migration intentionally does not
-- merge old questions: start with the empty database agreed for this release.
BEGIN;
LOCK TABLE "Question", "ReadingText" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ReadingText") OR EXISTS (SELECT 1 FROM "Question" WHERE "readingId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Separate reading data still exists. This release requires an empty reading store; follow the fresh-database rollout before applying this migration.';
  END IF;
END $$;
ALTER TABLE "Question" DROP CONSTRAINT "Question_readingId_fkey";
DROP INDEX "Question_readingId_idx";
ALTER TABLE "Question" DROP COLUMN "readingId";
DROP TABLE "ReadingText";
COMMIT;
