-- Fields required by employee profile capture and advanced HR search.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS medical_conditions TEXT,
  ADD COLUMN IF NOT EXISTS highest_qualification TEXT,
  ADD COLUMN IF NOT EXISTS birth_month SMALLINT GENERATED ALWAYS AS (EXTRACT(MONTH FROM date_of_birth)::SMALLINT) STORED,
  ADD COLUMN IF NOT EXISTS birth_day SMALLINT GENERATED ALWAYS AS (EXTRACT(DAY FROM date_of_birth)::SMALLINT) STORED;

CREATE INDEX IF NOT EXISTS idx_employees_birthday
  ON public.employees (birth_month, birth_day);
CREATE INDEX IF NOT EXISTS idx_employees_qualification
  ON public.employees (highest_qualification);
