-- Create payroll_runs table to persist generated payroll data
CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  payroll_type TEXT NOT NULL CHECK (payroll_type IN ('postwise', 'designationwise', 'personwise')),
  type_label TEXT NOT NULL,
  selection_label TEXT NOT NULL DEFAULT '',
  total_employees INTEGER NOT NULL DEFAULT 0,
  total_gross NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_net NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'SENT_TO_ACCOUNTS', 'APPROVED', 'PAID')),
  employee_details JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by status and date
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs (status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_dates ON payroll_runs (from_date, to_date);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_payroll_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payroll_runs_updated_at ON payroll_runs;
CREATE TRIGGER trg_payroll_runs_updated_at
  BEFORE UPDATE ON payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_runs_updated_at();

-- Enable RLS
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (adjust based on your role setup)
CREATE POLICY "payroll_runs_all_access" ON payroll_runs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
