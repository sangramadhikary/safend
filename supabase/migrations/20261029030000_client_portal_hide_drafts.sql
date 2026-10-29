-- Client-portal users see an invoice once it has been issued, not while it is
-- a draft Accounts can still edit or delete (status 'created', never issued,
-- unpaid). Staff visibility is unchanged. Idempotent.

DROP POLICY IF EXISTS receivables_select_client ON public.receivables;
CREATE POLICY receivables_select_client ON public.receivables
  FOR SELECT TO authenticated
  USING (category IN ('Invoices', 'Invoice Adjustments')
         AND NOT (status = 'created' AND issued_at IS NULL AND coalesce(paid_amount, 0) = 0)
         AND lower(btrim(coalesce(client_name, ''))) = lower(btrim(coalesce((SELECT public.app_client_name(auth.uid())), '#none#'))));
