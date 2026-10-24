-- Nullable: existing passwords and active sessions are preserved.
ALTER TABLE "User" ADD COLUMN "loginCardPassword" TEXT;
