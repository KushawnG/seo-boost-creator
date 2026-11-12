-- signup_attribution rows outlived their users.
--
-- The table was created with user_id as its primary key but no foreign key,
-- so deleting an account left its attribution row behind. Fourteen had
-- accumulated by 2026-11-11, all from throwaway test accounts, and they
-- inflated the "direct / unknown" channel in every acquisition report that
-- didn't explicitly join back to auth.users. Each orphan had empty UTM and
-- referrer fields — exactly the signature of an account created through the
-- admin API rather than the signup page.
--
-- Written to be safe to run twice: the other Supabase tables that hang off
-- auth.users (gift_deliveries, announcements_sent) already cascade, and this
-- brings attribution in line with them.

DELETE FROM public.signup_attribution a
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id);

ALTER TABLE public.signup_attribution
  DROP CONSTRAINT IF EXISTS signup_attribution_user_id_fkey;

ALTER TABLE public.signup_attribution
  ADD CONSTRAINT signup_attribution_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
