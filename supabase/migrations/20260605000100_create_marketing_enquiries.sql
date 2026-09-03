-- Create the marketing_enquiries table used by the public lead/enquiry forms.
-- Mirrors scripts/create_marketing_enquiries_table.sql so it is tracked in the
-- Supabase migration history. Inserts are performed server-side via the service
-- role (bypassing RLS) from /api/lead and /api/enquiry.

CREATE TABLE IF NOT EXISTS public.marketing_enquiries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Enquirer information
  name             VARCHAR(100) NOT NULL,
  contact_method   VARCHAR(255) NOT NULL,  -- Email or phone number

  -- Enquiry content
  message          TEXT NOT NULL
                   CHECK (char_length(message) >= 1 AND char_length(message) <= 2000),

  -- Status tracking
  status           VARCHAR(20) NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','contacted','in_progress','closed')),

  -- Audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_marketing_enquiries_status  ON public.marketing_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_marketing_enquiries_created ON public.marketing_enquiries(created_at DESC);

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.marketing_enquiries ENABLE ROW LEVEL SECURITY;

-- Admin and sales roles can view all enquiries.
DROP POLICY IF EXISTS "marketing_enquiries_read_admin_sales" ON public.marketing_enquiries;
CREATE POLICY "marketing_enquiries_read_admin_sales" ON public.marketing_enquiries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','branch_admin','sales')
    )
  );

-- Admin and sales can update enquiry status.
DROP POLICY IF EXISTS "marketing_enquiries_update_admin_sales" ON public.marketing_enquiries;
CREATE POLICY "marketing_enquiries_update_admin_sales" ON public.marketing_enquiries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','branch_admin','sales')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','branch_admin','sales')
    )
  );

-- NOTE: INSERT is performed server-side via service role, bypassing RLS.
