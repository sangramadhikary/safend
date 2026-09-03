-- ============================================================
-- rented_properties: add vendor_id FK + rent_payment_day
-- ============================================================
-- vendor_id links the property to the property_owner vendor row
-- so we don't duplicate landlord name/contact in two places.
-- rent_payment_day (1-28) is the day of each month rent is due;
-- the app uses it to auto-create a monthly recurring bill.
-- Both columns are nullable so existing rows are unaffected.

ALTER TABLE rented_properties
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rent_payment_day integer CHECK (rent_payment_day BETWEEN 1 AND 28);

COMMENT ON COLUMN rented_properties.vendor_id      IS 'FK to vendors(id) — must be a property_owner category vendor';
COMMENT ON COLUMN rented_properties.rent_payment_day IS 'Day of month (1-28) rent is due; used to auto-generate the recurring bill';
