-- ============================================================
-- Utility meter readings + rates on rented_properties
-- Utility charge breakdowns on bill_payments
-- ============================================================
-- Applied to production 2026-08-03 in two passes:
--   Pass 1: meter reading columns on rented_properties + rate columns (NOTICE: already exist)
--   Pass 2: all bill_payments columns; property_id as text (rented_properties.id is text)

-- ── rented_properties ─────────────────────────────────────────────────────────
ALTER TABLE rented_properties
  ADD COLUMN IF NOT EXISTS electric_meter_reading  numeric(12,2),
  ADD COLUMN IF NOT EXISTS electric_rate_per_unit  numeric(10,4),
  ADD COLUMN IF NOT EXISTS water_meter_reading     numeric(12,2),
  ADD COLUMN IF NOT EXISTS water_rate_per_unit     numeric(10,4),
  ADD COLUMN IF NOT EXISTS gas_meter_reading       numeric(12,2),
  ADD COLUMN IF NOT EXISTS gas_rate_per_unit       numeric(10,4);

-- ── bill_payments ──────────────────────────────────────────────────────────────
-- property_id is text (not uuid) because rented_properties.id is text.
ALTER TABLE bill_payments
  ADD COLUMN IF NOT EXISTS electric_prev_reading   numeric(12,2),
  ADD COLUMN IF NOT EXISTS electric_curr_reading   numeric(12,2),
  ADD COLUMN IF NOT EXISTS electric_units          numeric(12,2),
  ADD COLUMN IF NOT EXISTS electric_rate           numeric(10,4),
  ADD COLUMN IF NOT EXISTS electric_amount         numeric(12,2),
  ADD COLUMN IF NOT EXISTS water_prev_reading      numeric(12,2),
  ADD COLUMN IF NOT EXISTS water_curr_reading      numeric(12,2),
  ADD COLUMN IF NOT EXISTS water_units             numeric(12,2),
  ADD COLUMN IF NOT EXISTS water_rate              numeric(10,4),
  ADD COLUMN IF NOT EXISTS water_amount            numeric(12,2),
  ADD COLUMN IF NOT EXISTS gas_prev_reading        numeric(12,2),
  ADD COLUMN IF NOT EXISTS gas_curr_reading        numeric(12,2),
  ADD COLUMN IF NOT EXISTS gas_units               numeric(12,2),
  ADD COLUMN IF NOT EXISTS gas_rate                numeric(10,4),
  ADD COLUMN IF NOT EXISTS gas_amount              numeric(12,2),
  ADD COLUMN IF NOT EXISTS utility_total           numeric(12,2),
  ADD COLUMN IF NOT EXISTS grand_total             numeric(12,2),
  ADD COLUMN IF NOT EXISTS payable_id              uuid,
  ADD COLUMN IF NOT EXISTS property_id             text,
  ADD COLUMN IF NOT EXISTS property_name           text;
