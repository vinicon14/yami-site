-- YAMI production: keep every application table private to server-side PostgreSQL access.
-- The application connects with DATABASE_URL from the server; no browser client
-- should access these tables with the Supabase anon/publishable key.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'orders','licenses','download_tokens','users','sessions','devices',
    'pairings','audit_log','release_manifest','remote_messages','remote_seq',
    'release_history','feature_requests','feature_request_events',
    'user_notifications','payment_events','store_apps','store_app_versions',
    'store_app_reports','upload_quota','signup_ip_quota'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;
