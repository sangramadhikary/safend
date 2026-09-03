-- ============================================================================
-- Employee Advances & Salary Deductions
-- ----------------------------------------------------------------------------
-- Models the four salary-linked money flows of a PSARA security agency:
--   1. LOAN            - cash disbursed to staff, recovered from salary (flat interest, no fee)
--   2. JOINING_DEPOSIT - role-based joining amount, invoiced as income, recovered via 0% EMI
--   3. MESS            - company-funded post mess, recovered per guard by meal count (pass-through)
--   4. PENALTY         - disciplinary deduction (stays in existing penalties table; only referenced here)
--
-- Recovery rules: recover what the net salary allows, carry the shortfall forward,
-- ₹0 net is acceptable (never negative). Priority when net is short:
--   Statutory -> Penalty -> Mess -> Loan/Deposit.
-- ============================================================================

-- ── Advances ledger: LOAN + JOINING_DEPOSIT (principal-based, amortizing) ──
CREATE TABLE IF NOT EXISTS employee_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL,
  employee_name TEXT,
  employee_code TEXT,
  advance_type TEXT NOT NULL CHECK (advance_type IN ('LOAN', 'JOINING_DEPOSIT')),
  principal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  interest_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,        -- flat rate on principal
  interest_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,    -- computed flat interest
  total_recoverable NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- principal + interest
  recovery_mode TEXT NOT NULL DEFAULT 'EMI' CHECK (recovery_mode IN ('ONE_TIME', 'EMI')),
  emi_months INTEGER NOT NULL DEFAULT 1,
  installment_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_recovered NUMERIC(12, 2) NOT NULL DEFAULT 0,
  balance_outstanding NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'active', 'cleared', 'written_off', 'on_hold', 'rejected')),
  reason TEXT,
  invoice_id TEXT,                 -- joining deposit is invoiced as income; link kept for audit
  upfront_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,       -- deposit amount paid at joining
  start_date DATE,
  expected_close_date DATE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  is_flagged BOOLEAN NOT NULL DEFAULT false,            -- red-flag: outstanding > projected recoverable
  flag_reason TEXT,
  branch_id UUID,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_advances_employee ON employee_advances (employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_advances_status ON employee_advances (status);
CREATE INDEX IF NOT EXISTS idx_emp_advances_type ON employee_advances (advance_type);

-- Note: mess is handled by the existing (now monthly) mess subsystem
-- (mess_weeks / mess_fund_requests / mess_meal_records), which payroll already
-- consumes by date range. No separate mess table is introduced here.

-- ── Deduction audit ledger for loan/deposit recoveries per cycle ──
CREATE TABLE IF NOT EXISTS payroll_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL,
  employee_name TEXT,
  employee_code TEXT,
  cycle_month TEXT NOT NULL,       -- 'YYYY-MM'
  deduction_type TEXT NOT NULL
    CHECK (deduction_type IN ('STATUTORY', 'PENALTY', 'MESS', 'LOAN', 'JOINING_DEPOSIT')),
  source_ref UUID,                 -- points to advance / mess log / penalty id
  priority INTEGER NOT NULL DEFAULT 100,   -- lower = recovered first (10/20/30/40)
  scheduled_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recovered_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  carried_forward NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'recovered', 'partial', 'carried_forward', 'skipped')),
  payroll_run_id TEXT,
  skipped BOOLEAN NOT NULL DEFAULT false,
  branch_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_deductions_emp_cycle ON payroll_deductions (employee_id, cycle_month);
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_run ON payroll_deductions (payroll_run_id);

-- ── Role-wise joining deposit amounts ──
CREATE TABLE IF NOT EXISTS joining_deposit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  default_emi_months INTEGER NOT NULL DEFAULT 6,
  branch_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, branch_id)
);



-- ── Row Level Security (mirrors existing "allow all access" app-layer-gated pattern) ──
ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE joining_deposit_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_advances' AND policyname = 'Allow all access employee_advances') THEN
    CREATE POLICY "Allow all access employee_advances" ON public.employee_advances FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payroll_deductions' AND policyname = 'Allow all access payroll_deductions') THEN
    CREATE POLICY "Allow all access payroll_deductions" ON public.payroll_deductions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'joining_deposit_config' AND policyname = 'Allow all access joining_deposit_config') THEN
    CREATE POLICY "Allow all access joining_deposit_config" ON public.joining_deposit_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Auto-update updated_at ──
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_emp_advances_touch') THEN
    CREATE TRIGGER trg_emp_advances_touch BEFORE UPDATE ON employee_advances
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_deductions_touch') THEN
    CREATE TRIGGER trg_payroll_deductions_touch BEFORE UPDATE ON payroll_deductions
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;

-- ── Seed default role-wise joining deposit amounts (edit in HR settings later) ──
INSERT INTO joining_deposit_config (role, deposit_amount, default_emi_months)
VALUES
  ('Security Guard', 3000, 6),
  ('Armed Guard', 5000, 6),
  ('Supervisor', 5000, 6),
  ('Gunman', 6000, 6)
ON CONFLICT (role, branch_id) DO NOTHING;
