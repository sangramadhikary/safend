-- Consolidate payable categories from 10 loosely-defined buckets into a clean,
-- MECE (mutually exclusive, collectively exhaustive) 8-category structure that
-- matches how a PSARA security agency actually spends cash.
--
-- Mapping:
--   'Salary'            -> 'Salary & Wages'
--   'EPF/ESIC'          -> 'EPF & ESIC'
--   'Taxes'             -> 'Statutory & Taxes'
--   'Vendor Payment'    -> 'Vendor & Supplies'   (merged)
--   'Purchase'          -> 'Vendor & Supplies'   (merged: both are supplier trade payables)
--   'House Rent'        -> 'Rent & Utilities'
--   'Reimbursement'     -> 'Reimbursements'
--   'Auxiliary Expense' -> 'Other Expenses'
--   'Credit Notes'      -> 'Other Expenses'       (a vendor credit note is an adjustment,
--                                                  not a standalone payable bucket; the original
--                                                  category is preserved in notes for audit trail)
--
-- Idempotent: safe to re-run. Only rows still holding old category names are touched.

-- Preserve the original category of misclassified Credit Note rows in notes before remapping.
UPDATE payables
SET notes = COALESCE(NULLIF(notes, '') || ' | ', '') || 'Reclassified from Credit Notes (vendor adjustment)'
WHERE category = 'Credit Notes';

-- Remap categories
UPDATE payables SET category = 'Salary & Wages'     WHERE category = 'Salary';
UPDATE payables SET category = 'EPF & ESIC'         WHERE category = 'EPF/ESIC';
UPDATE payables SET category = 'Statutory & Taxes'  WHERE category = 'Taxes';
UPDATE payables SET category = 'Vendor & Supplies'  WHERE category IN ('Vendor Payment', 'Purchase');
UPDATE payables SET category = 'Rent & Utilities'   WHERE category = 'House Rent';
UPDATE payables SET category = 'Reimbursements'     WHERE category = 'Reimbursement';
UPDATE payables SET category = 'Other Expenses'     WHERE category IN ('Auxiliary Expense', 'Credit Notes');

-- Verification (run manually after applying):
--   SELECT category, COUNT(*) FROM payables GROUP BY category ORDER BY category;
-- Expected categories only: Salary & Wages, EPF & ESIC, Statutory & Taxes,
--   Vendor & Supplies, Rent & Utilities, Reimbursements, Mess Expense,
--   Compliance & Licenses, Other Expenses.
