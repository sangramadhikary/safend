-- Employee onboarding pipeline: staging table for candidates going through
-- the 5-step onboarding process before being finalized into `employees`.
CREATE TABLE IF NOT EXISTS onboarding_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT,
  stage TEXT NOT NULL DEFAULT 'details'
    CHECK (stage IN ('details', 'documents', 'agreement', 'uniform', 'review', 'onboarded', 'cancelled')),

  -- Step 1: basic details (draft employee data)
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gender TEXT,
  date_of_birth DATE,
  department TEXT,
  designation TEXT,
  join_date DATE,
  photo_url TEXT,

  -- Step 2: documents (URLs from storage)
  -- Aadhaar and address proof are the only mandatory documents. Photo ID proofs
  -- carry the address on the reverse, so those get a back-side URL too; utility
  -- bills and agreements are single-sided and leave it null.
  aadhar_number TEXT,
  aadhar_file_url TEXT,
  aadhar_back_file_url TEXT,
  pan_number TEXT,
  pan_file_url TEXT,
  address_proof_type TEXT,
  address_proof_file_url TEXT,
  address_proof_back_file_url TEXT,
  documents_completed BOOLEAN NOT NULL DEFAULT false,

  -- Step 3: agreement / contract
  agreement_generated_at TIMESTAMPTZ,
  agreement_signed_file_url TEXT,
  agreement_signed_at TIMESTAMPTZ,

  -- Step 4: uniform / inventory issuance
  uniform_distribution_id UUID,
  uniform_issued_at TIMESTAMPTZ,

  -- Step 5: review & finalize
  reviewed_by TEXT,
  employee_id TEXT,        -- set once finalized into employees.employee_id
  onboarded_employee_uuid UUID,  -- set once finalized into employees.id
  onboarded_at TIMESTAMPTZ,

  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_stage ON onboarding_candidates (stage);
CREATE INDEX IF NOT EXISTS idx_onboarding_branch ON onboarding_candidates (branch_id);

ALTER TABLE onboarding_candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_candidates' AND policyname = 'Allow all access onboarding_candidates') THEN
    CREATE POLICY "Allow all access onboarding_candidates" ON public.onboarding_candidates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION touch_onboarding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_onboarding_touch') THEN
    CREATE TRIGGER trg_onboarding_touch BEFORE UPDATE ON onboarding_candidates
      FOR EACH ROW EXECUTE FUNCTION touch_onboarding_updated_at();
  END IF;
END $$;

-- Back-side URL columns, added after the table shipped. Guarded so the file
-- stays idempotent for databases created before these existed.
ALTER TABLE onboarding_candidates ADD COLUMN IF NOT EXISTS aadhar_back_file_url TEXT;
ALTER TABLE onboarding_candidates ADD COLUMN IF NOT EXISTS address_proof_back_file_url TEXT;
