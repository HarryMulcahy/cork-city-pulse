CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-osm-dublin-weekly') THEN
    PERFORM cron.unschedule('import-osm-dublin-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'import-osm-dublin-weekly',
  '0 3 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://project--dbca57b0-1907-4373-b6d4-db2e01f2aa8d.lovable.app/api/public/hooks/import-osm',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"city": "dublin"}'::jsonb
  );
  $$
);