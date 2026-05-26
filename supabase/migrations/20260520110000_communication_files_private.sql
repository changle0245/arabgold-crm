-- ============================================================
-- M9 fix: make the communication-files storage bucket private
-- ============================================================
-- 20260519010000 created the communication-files bucket with
-- public = true, so every uploaded inbound-email / chat-import /
-- recorded-email file got a permanent public URL readable by anyone
-- with (or guessing) the link — no authentication at all.
--
-- This flips the bucket to private. File access now goes through the
-- GET /api/communication-files proxy route, which requires a logged-in
-- active user and returns a short-lived signed URL. The 3 upload routes
-- store the storage path (not a public URL); the proxy also accepts an
-- old public URL and extracts the path, so pre-existing rows keep
-- working without a data backfill.
-- ============================================================

update storage.buckets set public = false where id = 'communication-files';
