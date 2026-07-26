-- OPTIONAL — apply this ONLY if you enable the CRON_SECRET gate on the public OSM import
-- endpoint (src/routes/api/public/hooks/import-osm.ts). It reschedules the weekly Dublin
-- import so the pg_cron job sends a matching `x-cron-secret` header; without this, setting
-- CRON_SECRET would cause the weekly job to start getting 401s and silently stop importing.
--
-- Setup (do all three, together):
--   1. Set the CRON_SECRET server env var (Cloudflare/Lovable) to a strong random value.
--   2. Store the SAME value in Supabase Vault as a secret named `cron_secret`:
--        select vault.create_secret('<the-same-value>', 'cron_secret');
--   3. Apply this migration.
-- The header is read from Vault at call time, so the secret is never stored in git.
-- (If CRON_SECRET is left unset, the endpoint stays open and this migration is harmless.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'import-osm-dublin-weekly') then
    perform cron.unschedule('import-osm-dublin-weekly');
  end if;
end $$;

select cron.schedule(
  'import-osm-dublin-weekly',
  '0 3 * * 1',
  $$
  select net.http_post(
    url := 'https://project--dbca57b0-1907-4373-b6d4-db2e01f2aa8d.lovable.app/api/public/hooks/import-osm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        ''
      )
    ),
    body := '{"city": "dublin"}'::jsonb
  );
  $$
);
