-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: new row for relation "payables" violates check constraint
--      "payables_category_check"
--
-- WHAT WENT WRONG
-- ---------------
-- payables was created by the one-off script scripts/create_payables_table.sql
-- (since deleted from the working tree; still in git history), which defined:
--
--   category TEXT NOT NULL CHECK (category IN (
--     'Credit Notes', 'Vendor Payment', 'House Rent', 'Salary',
--     'Reimbursement', 'Mess Expense', 'Purchase', 'Taxes',
--     'EPF/ESIC', 'Auxiliary Expense'
--   ))
--
-- Migration 20260711000000_consolidate_payable_categories.sql consolidated
-- those 10 loose buckets into 9 MECE categories, but it only ran data-level
-- UPDATEs — it never redefined the constraint. Worse, those UPDATEs write the
-- NEW names, so the stale constraint blocks them too: that migration cannot
-- ever have been applied successfully to this database.
--
-- Meanwhile the app (ManagePayables.tsx, SalaryApprovalsSection.tsx,
-- EmployeeDirectory.tsx) writes the new names, so every payable insert is
-- rejected. Saving the "Add Rent & Utilities Entry" form writes
-- category = 'Rent & Utilities', which the old constraint does not allow.
-- The same stale constraint is also why the Rent & Utilities tab reads back
-- empty: existing rows are still filed under 'House Rent'.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
--   1. Drops whatever single-column CHECK constraint currently guards
--      payables.category (found by definition, not by hardcoded name, so a
--      differently-named constraint is caught too).
--   2. Re-applies the legacy -> consolidated category remap. This repeats
--      20260711000000 on purpose: if that migration was never applied (the
--      stale constraint would have blocked its UPDATEs), the data is still on
--      legacy names, and the remap has to happen AFTER the constraint is
--      dropped. Idempotent either way.
--   3. Re-adds the constraint with the 9 canonical categories, matching
--      PAYABLE_CATEGORIES in src/modules/accounts/constants/payableCategories.ts.
--
-- The constraint is added NOT VALID and then validated in a guarded block, so
-- an unforeseen stray category value in existing rows reports itself as a
-- NOTICE instead of aborting the migration. Either way the constraint is
-- enforced on all new INSERTs and UPDATEs from the moment it is added, which
-- is what unblocks the form.
--
-- Run this in the Supabase SQL Editor or via `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Drop the stale category constraint ───────────────────────────────────
DO $$
DECLARE
  cat_attnum SMALLINT;
  con RECORD;
  dropped INT := 0;
BEGIN
  IF to_regclass('public.payables') IS NULL THEN
    RAISE NOTICE 'payables table not present — nothing to do';
    RETURN;
  END IF;

  SELECT attnum INTO cat_attnum
    FROM pg_attribute
   WHERE attrelid = 'public.payables'::regclass
     AND attname  = 'category'
     AND attnum > 0
     AND NOT attisdropped;

  IF cat_attnum IS NULL THEN
    RAISE EXCEPTION 'payables.category column not found — aborting';
  END IF;

  -- Only single-column CHECKs on `category`. A multi-column CHECK that happens
  -- to reference category is left alone: dropping it could silently remove an
  -- unrelated business rule.
  FOR con IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.payables'::regclass
       AND contype  = 'c'
       AND conkey   = ARRAY[cat_attnum]::SMALLINT[]
  LOOP
    EXECUTE format('ALTER TABLE public.payables DROP CONSTRAINT %I', con.conname);
    dropped := dropped + 1;
    RAISE NOTICE 'Dropped stale payables category constraint: %', con.conname;
  END LOOP;

  IF dropped = 0 THEN
    RAISE NOTICE 'No single-column CHECK constraint on payables.category was present';
  END IF;
END $$;

-- ─── 2. Remap legacy category names ──────────────────────────────────────────
-- Mirrors 20260711000000. Idempotent: only rows still holding a legacy name are
-- touched, so re-running (or running after that migration already applied) is a
-- no-op.

-- Preserve the original category of misclassified Credit Note rows for audit,
-- guarded so the note is not appended twice on re-run.
UPDATE payables
   SET notes = COALESCE(NULLIF(notes, '') || ' | ', '')
               || 'Reclassified from Credit Notes (vendor adjustment)'
 WHERE category = 'Credit Notes'
   AND COALESCE(notes, '') NOT LIKE '%Reclassified from Credit Notes%';

UPDATE payables SET category = 'Salary & Wages'     WHERE category = 'Salary';
UPDATE payables SET category = 'EPF & ESIC'         WHERE category = 'EPF/ESIC';
UPDATE payables SET category = 'Statutory & Taxes'  WHERE category = 'Taxes';
UPDATE payables SET category = 'Vendor & Supplies'  WHERE category IN ('Vendor Payment', 'Purchase');
UPDATE payables SET category = 'Rent & Utilities'   WHERE category = 'House Rent';
UPDATE payables SET category = 'Reimbursements'     WHERE category = 'Reimbursement';
UPDATE payables SET category = 'Other Expenses'     WHERE category IN ('Auxiliary Expense', 'Credit Notes');

-- ─── 3. Re-add the constraint with the canonical 9 categories ────────────────
ALTER TABLE public.payables
  ADD CONSTRAINT payables_category_check
  CHECK (category IN (
    'Salary & Wages',
    'EPF & ESIC',
    'Statutory & Taxes',
    'Vendor & Supplies',
    'Rent & Utilities',
    'Reimbursements',
    'Mess Expense',
    'Compliance & Licenses',
    'Other Expenses'
  ))
  NOT VALID;

DO $$
BEGIN
  ALTER TABLE public.payables VALIDATE CONSTRAINT payables_category_check;
  RAISE NOTICE 'payables_category_check validated — all existing rows conform';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'payables_category_check left NOT VALID: some existing rows hold an unrecognised category. New INSERTs/UPDATEs are still enforced.';
  RAISE NOTICE 'Inspect the offenders with: SELECT category, COUNT(*) FROM payables GROUP BY 1 ORDER BY 2 DESC;';
END $$;

-- ─── Verification (run manually after applying) ──────────────────────────────
--   -- constraint definition now in force:
--   SELECT conname, pg_get_constraintdef(oid), convalidated
--     FROM pg_constraint
--    WHERE conrelid = 'public.payables'::regclass AND contype = 'c';
--
--   -- category distribution — expect only the 9 canonical names:
--   SELECT category, COUNT(*) FROM payables GROUP BY 1 ORDER BY 1;
