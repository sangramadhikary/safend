-- Create the qr_check_ins table for the QR Field Attendance feature.
-- Holds the pending -> approved/rejected/expired lifecycle of a QR-based
-- attendance check-in. Inserts/updates are performed server-side via the
-- service role (bypassing RLS) from the public /api/attendance/* routes;
-- portal reads go through authenticated, branch/role-scoped service paths.
-- See .kiro/specs/qr-field-attendance/design.md ("New table: qr_check_ins").

CREATE TABLE IF NOT EXISTS public.qr_check_ins (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id             uuid NOT NULL REFERENCES public.operational_posts(id),
  employee_code       text NOT NULL,
  employee_uuid       uuid NOT NULL REFERENCES public.employees(id),
  shift_key           text NOT NULL CHECK (shift_key IN ('day','afternoon','night')),
  service_type_key    text NOT NULL,
  check_in_date       date NOT NULL,                       -- app-timezone calendar date

  gps_lat             double precision NOT NULL CHECK (gps_lat BETWEEN -90 AND 90),
  gps_lng             double precision NOT NULL CHECK (gps_lng BETWEEN -180 AND 180),
  gps_accuracy_m      double precision CHECK (gps_accuracy_m >= 0),
  distance_m          double precision NOT NULL CHECK (distance_m >= 0),
  within_geofence     boolean NOT NULL,
  low_accuracy        boolean NOT NULL DEFAULT false,

  photo_path          text,                                -- null once expired
  photo_expired       boolean NOT NULL DEFAULT false,
  consent_accepted_at timestamptz NOT NULL,                -- ISO 8601 UTC (R4.4)

  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','expired')),
  approved_by         uuid,
  approved_at         timestamptz,
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  reviewer_notes      text CHECK (reviewer_notes IS NULL OR char_length(reviewer_notes) <= 500),

  branch_id           uuid,                                -- for portal scoping
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- At most one LIVE record per slot (pending or approved). Enables concurrency-safe
-- duplicate prevention at the DB layer (R12.1, R12.3). rejected/expired are excluded
-- so a slot can be retried after rejection/expiry.
CREATE UNIQUE INDEX IF NOT EXISTS qr_check_ins_live_slot_uniq
  ON public.qr_check_ins (employee_uuid, post_id, check_in_date, shift_key)
  WHERE status IN ('pending','approved');

CREATE INDEX IF NOT EXISTS qr_check_ins_status_idx ON public.qr_check_ins (status, check_in_date);
CREATE INDEX IF NOT EXISTS qr_check_ins_post_idx   ON public.qr_check_ins (post_id, check_in_date);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_qr_check_ins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_qr_check_ins_updated_at ON public.qr_check_ins;
CREATE TRIGGER trg_qr_check_ins_updated_at
  BEFORE UPDATE ON public.qr_check_ins
  FOR EACH ROW
  EXECUTE FUNCTION update_qr_check_ins_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- RLS is enabled with NO anon policy. The public check-in/verify routes use the
-- service-role key, which bypasses RLS (exactly as existing public routes do).
-- Portal reads go through authenticated BFF/service paths scoped by branch/role.
ALTER TABLE public.qr_check_ins ENABLE ROW LEVEL SECURITY;

-- NOTE: No anon policy is created. All writes are performed server-side via the
-- service role, bypassing RLS. Do not add a public/anon policy to this table.
