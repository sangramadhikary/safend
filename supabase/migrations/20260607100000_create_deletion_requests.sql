-- Create deletion_requests table (if not exists)
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL,
  item_id text NOT NULL,
  client_name text NOT NULL,
  contact_details text DEFAULT '',
  reason text DEFAULT '',
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  additional_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (the app handles role checks in code)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'deletion_requests' 
    AND policyname = 'Allow all deletion_requests'
  ) THEN
    CREATE POLICY "Allow all deletion_requests" 
      ON public.deletion_requests 
      FOR ALL 
      TO authenticated
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime
ALTER publication supabase_realtime ADD TABLE public.deletion_requests;
