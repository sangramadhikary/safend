-- ─────────────────────────────────────────────────────────────────────────────
-- Client master + Customer IDs
--
-- Until now a "client" was an emergent entity: the Clients tab derived it at
-- runtime from work orders and one-time invoices, matched purely on the client
-- NAME string. Nothing durable identified a client, so nothing could be hung
-- off it.
--
-- This migration makes the client a first-class record with a permanent
-- Customer ID (SF<seq>-YYMMDD), and re-points work orders at it:
--
--   SF01-260801  ABC Industries Pvt Ltd
--   |-- WO-2026-5624   (unified: every post on one work order)
--   |-- or one work order per post, all sharing batch_id
--
-- Run this in the Supabase SQL Editor or via `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────────

-- Customer IDs come off a sequence so they are unique by construction and read
-- in onboarding order — no client-side collision retry needed.
-- Format: SF<seq>-YYMMDD (sequence first, then date)
-- Examples: SF01-260801 = 1st customer on 1 Aug 2026
--           SF01-261119 = 1st customer on 19 Nov 2026
CREATE SEQUENCE IF NOT EXISTS clients_customer_id_seq START 1;

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-facing permanent identity, e.g. SF01-260801
  customer_id TEXT NOT NULL UNIQUE
    DEFAULT ('SF' ||
             nextval('clients_customer_id_seq')::TEXT || '-' ||
             to_char(now(), 'YY') ||
             to_char(now(), 'MM') ||
             to_char(now(), 'DD')),

  -- Normalised match key (clientKeyOf): lowercased, punctuation and legal noise
  -- ("pvt", "ltd", "services", ...) stripped. This is what folds
  -- "ABC Securities Pvt. Ltd." and "abc securities" into one client.
  name_key TEXT NOT NULL UNIQUE,

  name TEXT NOT NULL,
  company_name TEXT,

  -- regular    = has work orders behind it
  -- occasional = billed via one-time invoices only
  client_type TEXT NOT NULL DEFAULT 'regular'
    CHECK (client_type IN ('regular', 'occasional')),

  gstin TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,

  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_name_key ON clients (name_key);
CREATE INDEX IF NOT EXISTS idx_clients_customer_id ON clients (customer_id);
CREATE INDEX IF NOT EXISTS idx_clients_type ON clients (client_type);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'Allow all access clients'
  ) THEN
    CREATE POLICY "Allow all access clients" ON public.clients
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION touch_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clients_touch') THEN
    CREATE TRIGGER trg_clients_touch BEFORE UPDATE ON clients
      FOR EACH ROW EXECUTE FUNCTION touch_clients_updated_at();
  END IF;
END $$;

-- ─── work_orders: point at the client, and mark sibling work orders ──────────
--
-- work_orders.client_id already exists but was written as NULL on every insert
-- and never read, so re-typing it to UUID cannot lose data. Guarded anyway in
-- case the column is absent or already the right type.
DO $$
DECLARE col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'work_orders'
     AND column_name = 'client_id';

  IF col_type IS NULL THEN
    ALTER TABLE work_orders ADD COLUMN client_id UUID;
  ELSIF col_type <> 'uuid' THEN
    ALTER TABLE work_orders
      ALTER COLUMN client_id TYPE UUID
      USING NULLIF(btrim(client_id::TEXT), '')::UUID;
  END IF;
END $$;

-- batch_id groups the work orders raised together for one client in a single
-- pass (one per security post). It is a sibling marker, NOT a parent/child
-- hierarchy: there is no master work order row.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS batch_id UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = 'work_orders'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND kcu.column_name = 'client_id'
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_orders_client_id ON work_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_batch_id ON work_orders (batch_id);

-- Existing rows are linked by POST /api/admin/backfill-customers (dry_run
-- supported), which groups current work orders and one-time invoices by
-- name_key, mints a Customer ID per client in first-activity order, and sets
-- work_orders.client_id.
