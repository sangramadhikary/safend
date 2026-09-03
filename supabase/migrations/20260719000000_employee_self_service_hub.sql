-- Migration: Employee Self-Service Hub
-- Creates resignation_requests and deboarding_pipeline tables,
-- adds SALARY_ADVANCE to employee_advances constraint,
-- and adds 'source' column to leave_requests.

-- ── 1. New table: resignation_requests ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS resignation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  employee_code TEXT NOT NULL,
  employee_name TEXT,
  post_id UUID REFERENCES operational_posts(id),
  letter_url TEXT NOT NULL,
  letter_filename TEXT,
  reason TEXT,
  submission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notice_period_days INTEGER NOT NULL DEFAULT 30,
  last_working_day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'resignation_received',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. New table: deboarding_pipeline ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS deboarding_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resignation_id UUID REFERENCES resignation_requests(id),
  employee_id UUID REFERENCES employees(id),
  employee_name TEXT,
  designation TEXT,
  current_stage TEXT NOT NULL DEFAULT 'resignation_received',
  stage_history JSONB DEFAULT '[]',
  last_working_day DATE,
  progress_pct INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Add SALARY_ADVANCE to employee_advances type constraint ──────────────

ALTER TABLE employee_advances DROP CONSTRAINT IF EXISTS employee_advances_advance_type_check;
ALTER TABLE employee_advances ADD CONSTRAINT employee_advances_advance_type_check
  CHECK (advance_type IN ('LOAN', 'JOINING_DEPOSIT', 'SALARY_ADVANCE'));

-- ── 4. Add source column to leave_requests (for employee self-service badge) ─

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS source TEXT;

-- ── 5. Indexes for common queries ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_resignation_requests_employee_id
  ON resignation_requests(employee_id);

CREATE INDEX IF NOT EXISTS idx_resignation_requests_status
  ON resignation_requests(status);

CREATE INDEX IF NOT EXISTS idx_deboarding_pipeline_current_stage
  ON deboarding_pipeline(current_stage);

CREATE INDEX IF NOT EXISTS idx_deboarding_pipeline_employee_id
  ON deboarding_pipeline(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_advances_type
  ON employee_advances(advance_type);

CREATE INDEX IF NOT EXISTS idx_leave_requests_source
  ON leave_requests(source) WHERE source IS NOT NULL;
