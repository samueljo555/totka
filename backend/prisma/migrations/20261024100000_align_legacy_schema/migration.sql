-- Bridge the original empty installation to the application schema.
-- Existing installations created with db push already have these fields.
-- Never invent school identities or login credentials for populated legacy tables.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='School' AND column_name='id') THEN
    IF EXISTS (SELECT 1 FROM "School") OR EXISTS (SELECT 1 FROM "User") THEN
      RAISE EXCEPTION 'Legacy school IDs require a reviewed NPSN/account mapping. Restore a clone and migrate explicitly; no data was changed.';
    END IF;
    ALTER TABLE "User" DROP CONSTRAINT "User_schoolId_fkey";
    ALTER TABLE "School" RENAME COLUMN "id" TO "npsn";
    ALTER TABLE "User" RENAME COLUMN "schoolId" TO "schoolNpsn";
    ALTER TABLE "User" ADD CONSTRAINT "User_schoolNpsn_fkey" FOREIGN KEY ("schoolNpsn") REFERENCES "School"("npsn") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='User' AND column_name='username') THEN
    IF EXISTS (SELECT 1 FROM "User") THEN
      RAISE EXCEPTION 'Legacy users require reviewed usernames and passwords; no credentials will be invented.';
    END IF;
    ALTER TABLE "User" ADD COLUMN "username" TEXT NOT NULL;
    ALTER TABLE "User" ADD COLUMN "password" TEXT NOT NULL;
  END IF;
END $$;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE TABLE IF NOT EXISTS "ReadingText" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "content" TEXT NOT NULL,
  "authorId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReadingText_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReadingText_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "readingId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"Question"'::regclass AND conname='Question_readingId_fkey') THEN
    ALTER TABLE "Question" ADD CONSTRAINT "Question_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "ReadingText"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "token" TEXT;
COMMIT;
