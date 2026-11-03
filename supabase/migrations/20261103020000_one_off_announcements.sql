-- A record of one-off announcement emails, so nobody is told the same thing
-- twice. Separate from gift_deliveries because this isn't part of the weekly
-- sequence — it's a one-time "here's what changed" note.

CREATE TABLE IF NOT EXISTS public.announcements_sent (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind    text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

ALTER TABLE public.announcements_sent ENABLE ROW LEVEL SECURITY;  -- service role only

-- Sends one announcement to users who haven't had it, in small batches.
-- Deliberately takes a batch size and returns a count rather than looping the
-- whole list: a dormant audience mailed in one burst is how a sending domain
-- gets marked as spam, and the free Brevo tier caps the day at 300 anyway.
CREATE OR REPLACE FUNCTION public.send_announcement(p_kind text, p_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base   text;
  v_secret text;
  v_sent   integer := 0;
  v_row    record;
BEGIN
  SELECT value INTO v_base FROM app_config WHERE key = 'functions_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_fn_secret';
  IF v_base IS NULL OR v_secret IS NULL THEN
    RETURN jsonb_build_object('error', 'not configured');
  END IF;

  FOR v_row IN
    SELECT u.id AS user_id
    FROM auth.users u
    JOIN subscriptions s ON s.user_id = u.id
    WHERE NOT EXISTS (
      SELECT 1 FROM announcements_sent a
      WHERE a.user_id = u.id AND a.kind = p_kind
    )
    ORDER BY u.created_at DESC   -- most recent signups first: likeliest to care
    LIMIT p_limit
  LOOP
    -- Recorded BEFORE the send. A duplicate email is worse than a missed one,
    -- and pg_net is fire-and-forget so there is no delivery result to wait on.
    INSERT INTO announcements_sent (user_id, kind) VALUES (v_row.user_id, p_kind)
    ON CONFLICT DO NOTHING;

    PERFORM net.http_post(
      url     := v_base || '/notify-announcement',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-internal-secret', v_secret
                 ),
      body    := jsonb_build_object('userId', v_row.user_id, 'kind', p_kind),
      timeout_milliseconds := 5000
    );
    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object('queued', v_sent, 'kind', p_kind);
END $$;

REVOKE ALL ON FUNCTION public.send_announcement(text, integer) FROM PUBLIC, anon, authenticated;
