-- Module 5 PART C
-- Remove the obsolete user Push Token storage table.
-- WARNING: Applying this migration permanently deletes existing table data.
-- Do not use CASCADE: unexpected dependencies must cause the migration to fail.

BEGIN;

DROP TABLE IF EXISTS public.user_push_tokens;

COMMIT;
