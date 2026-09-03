-- Create pending_tasks table (if not exists)
CREATE TABLE IF NOT EXISTS public.pending_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'agreement_upload',
  agreement_id text NOT NULL,
  client_name text NOT NULL,
  value text DEFAULT '',
  assigned_to text NOT NULL,
  due_date timestamptz NOT NULL,
  tat_days integer NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  reminders_sent integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz
);

-- Enable RLS
ALTER TABLE public.pending_tasks ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'pending_tasks' 
    AND policyname = 'Allow all pending_tasks'
  ) THEN
    CREATE POLICY "Allow all pending_tasks" 
      ON public.pending_tasks 
      FOR ALL 
      TO authenticated
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime
ALTER publication supabase_realtime ADD TABLE public.pending_tasks;
