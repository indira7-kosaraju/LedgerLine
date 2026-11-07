-- Session revocation (Day 3, Task 4).
-- Every JWT carries the user's sessionVersion; raising it invalidates all older tokens
-- (used by logout and by admin status changes).
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
