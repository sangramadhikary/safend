-- GST treatment on receivables to support Reverse Charge Mechanism (RCM).
--
-- Supply of security personnel to a registered person is under RCM
-- (Notification 29/2018-CT(R)) — the CLIENT pays GST to the government, not the agency.
-- Such invoices must be excluded from the agency's output GST liability in GSTR-3B and
-- reported separately in GSTR-1. This column classifies each client billing accordingly.
--
--   'forward' - agency collects & remits GST (default, unregistered/B2C clients)
--   'rcm'     - recipient pays GST under reverse charge (registered clients)
--   'exempt'  - exempt / nil-rated supply
--
-- Idempotent.

ALTER TABLE receivables ADD COLUMN IF NOT EXISTS gst_treatment TEXT
  DEFAULT 'forward'
  CHECK (gst_treatment IN ('forward', 'rcm', 'exempt'));

-- Backfill existing rows to forward-charge (safe default; reclassify RCM clients in the UI).
UPDATE receivables SET gst_treatment = 'forward' WHERE gst_treatment IS NULL;
