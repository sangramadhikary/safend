-- Device binding: locks a Traccar device to a specific phone
-- Run this migration manually in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS device_bindings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_unique_id TEXT NOT NULL UNIQUE, -- Traccar device uniqueId
  vehicle_id TEXT, -- Reference to fleet vehicle
  employee_name TEXT,
  employee_id TEXT,
  -- Phone fingerprint (captured on first connection)
  phone_fingerprint TEXT, -- Hash of device info from first position
  first_seen_at TIMESTAMPTZ,
  first_ip TEXT,
  first_user_agent TEXT,
  -- Status
  is_bound BOOLEAN DEFAULT FALSE,
  bound_at TIMESTAMPTZ,
  bound_by TEXT, -- Admin who approved the binding
  -- Alerts
  binding_violated BOOLEAN DEFAULT FALSE,
  violation_count INTEGER DEFAULT 0,
  last_violation_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_bindings_unique_id ON device_bindings(device_unique_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_device_bindings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_device_bindings_updated_at ON device_bindings;
CREATE TRIGGER trg_device_bindings_updated_at
  BEFORE UPDATE ON device_bindings
  FOR EACH ROW
  EXECUTE FUNCTION update_device_bindings_updated_at();

-- RLS policies (adjust as needed for your auth setup)
ALTER TABLE device_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON device_bindings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON device_bindings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON device_bindings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
