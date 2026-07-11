-- Capture which ad/campaign drove each signup. The client stashes UTM params in
-- signUp options.data (-> raw_user_meta_data); this trigger copies them into a
-- dedicated table. Attribution capture must NEVER block signup, hence the guard.
CREATE TABLE IF NOT EXISTS public.signup_attribution (
  user_id      UUID PRIMARY KEY,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_content  TEXT,
  utm_term     TEXT,
  fbclid       TEXT,
  referrer     TEXT,
  landing_page TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.signup_attribution ENABLE ROW LEVEL SECURITY;
-- service-role only (reporting via SQL/admin); no policies.

CREATE OR REPLACE FUNCTION public.handle_new_user_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.signup_attribution (
      user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, referrer, landing_page
    )
    VALUES (
      NEW.id,
      nullif(NEW.raw_user_meta_data->>'utm_source', ''),
      nullif(NEW.raw_user_meta_data->>'utm_medium', ''),
      nullif(NEW.raw_user_meta_data->>'utm_campaign', ''),
      nullif(NEW.raw_user_meta_data->>'utm_content', ''),
      nullif(NEW.raw_user_meta_data->>'utm_term', ''),
      nullif(NEW.raw_user_meta_data->>'fbclid', ''),
      nullif(NEW.raw_user_meta_data->>'referrer', ''),
      nullif(NEW.raw_user_meta_data->>'landing_page', '')
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- never let attribution capture roll back user creation
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_attribution ON auth.users;
CREATE TRIGGER on_auth_user_created_attribution
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_attribution();
