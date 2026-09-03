-- Preserve a salary rate for every concrete Work Order service instance.
-- A post may have two entries of the same service, for example an 8-hour and
-- a 12-hour Unarmed Guard deployment. post_id + designation alone cannot
-- identify those rows reliably, so this additive key is used by new writes.

DO $$
BEGIN
  IF to_regclass('public.post_salary_rates') IS NULL THEN
    RAISE NOTICE 'Skipping post_salary_rates service-instance migration because the table does not exist.';
    RETURN;
  END IF;

  ALTER TABLE public.post_salary_rates
    ADD COLUMN IF NOT EXISTS service_instance_key text;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'post_salary_rates_post_instance_key_key'
      AND conrelid = 'public.post_salary_rates'::regclass
  ) THEN
    ALTER TABLE public.post_salary_rates
      ADD CONSTRAINT post_salary_rates_post_instance_key_key
      UNIQUE (post_id, service_instance_key);
  END IF;
END $$;

COMMENT ON COLUMN public.post_salary_rates.service_instance_key IS
  'Stable Work Order service instance identifier (<service type>:<service instance id>) for distinct 8H/12H and repeated service salary rates.';
