-- Fix RLS policies for deletion_requests - allow all roles (not just authenticated)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deletion_requests' AND policyname = 'Allow all deletion_requests') THEN
    DROP POLICY "Allow all deletion_requests" ON public.deletion_requests;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deletion_requests' AND policyname = 'Allow all access deletion_requests') THEN
    DROP POLICY "Allow all access deletion_requests" ON public.deletion_requests;
  END IF;
END $$;

CREATE POLICY "Allow all access deletion_requests" 
  ON public.deletion_requests 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Fix RLS policies for pending_tasks - allow all roles
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_tasks' AND policyname = 'Allow all pending_tasks') THEN
    DROP POLICY "Allow all pending_tasks" ON public.pending_tasks;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pending_tasks' AND policyname = 'Allow all access pending_tasks') THEN
    DROP POLICY "Allow all access pending_tasks" ON public.pending_tasks;
  END IF;
END $$;

CREATE POLICY "Allow all access pending_tasks" 
  ON public.pending_tasks 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);
