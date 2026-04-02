-- ══════════════════════════════════════════════════════════════════════════════
-- HANDYFIX MASTER FIX — Run ONCE in Supabase SQL Editor
-- Project: jviwwhjwtyneqrguumro
-- Fixes: provider_notifications RLS, scheduled_date NOT NULL,
--        user_id vs customer_id mismatch, all trigger SECURITY DEFINER,
--        bookings/messages/reviews RLS policies
-- ══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: FIX BOOKINGS TABLE — add missing cols, relax NOT NULL
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_date             DATE,
  ADD COLUMN IF NOT EXISTS booking_time             TIME,
  ADD COLUMN IF NOT EXISTS city                     TEXT,
  ADD COLUMN IF NOT EXISTS address                  TEXT,
  ADD COLUMN IF NOT EXISTS pincode                  TEXT,
  ADD COLUMN IF NOT EXISTS special_instructions     TEXT,
  ADD COLUMN IF NOT EXISTS total_amount             INT,
  ADD COLUMN IF NOT EXISTS customer_name            TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone           TEXT,
  ADD COLUMN IF NOT EXISTS platform_fee             INT DEFAULT 49,
  ADD COLUMN IF NOT EXISTS provider_amount          INT,
  ADD COLUMN IF NOT EXISTS cancelled_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason      TEXT,
  ADD COLUMN IF NOT EXISTS started_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_departed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_eta_minutes     INT,
  ADD COLUMN IF NOT EXISTS provider_location_lat    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS provider_location_lng    NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS unread_messages_customer INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_messages_provider INT DEFAULT 0;

-- Remove NOT NULL from legacy columns so both old and new column names work
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND table_schema = 'public'
    AND column_name = 'scheduled_date' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.bookings ALTER COLUMN scheduled_date DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND table_schema = 'public'
    AND column_name = 'scheduled_time' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.bookings ALTER COLUMN scheduled_time DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'pending';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: provider_notifications TABLE — create + fix RLS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID        NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'system',
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  booking_id  UUID        REFERENCES public.bookings(id) ON DELETE SET NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  data        JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_notifications ENABLE ROW LEVEL SECURITY;

-- Drop all existing provider_notifications policies
DROP POLICY IF EXISTS "providers_own_notifications_select" ON public.provider_notifications;
DROP POLICY IF EXISTS "providers_own_notifications_update" ON public.provider_notifications;
DROP POLICY IF EXISTS "providers_own_notifications_insert" ON public.provider_notifications;
DROP POLICY IF EXISTS "system_insert_provider_notifications" ON public.provider_notifications;
DROP POLICY IF EXISTS "allow_all_inserts_provider_notifications" ON public.provider_notifications;

-- SELECT: provider sees their own
CREATE POLICY "providers_own_notifications_select"
  ON public.provider_notifications FOR SELECT TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- UPDATE: provider can mark as read
CREATE POLICY "providers_own_notifications_update"
  ON public.provider_notifications FOR UPDATE TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- INSERT: allow any authenticated user to insert (triggers run as authenticated)
-- SECURITY DEFINER triggers bypass RLS, but adding this as a safety net
CREATE POLICY "allow_authenticated_insert_provider_notifications"
  ON public.provider_notifications FOR INSERT TO authenticated
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: customer_notifications TABLE — create if missing + fix RLS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  booking_id UUID        REFERENCES public.bookings(id) ON DELETE SET NULL,
  is_read    BOOLEAN     NOT NULL DEFAULT false,
  data       JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_notifications"             ON public.customer_notifications;
DROP POLICY IF EXISTS "users_update_own_notifications"      ON public.customer_notifications;
DROP POLICY IF EXISTS "users_own_customer_notifications_select" ON public.customer_notifications;
DROP POLICY IF EXISTS "users_update_customer_notifications" ON public.customer_notifications;
DROP POLICY IF EXISTS "allow_authenticated_insert_customer_notifications" ON public.customer_notifications;

CREATE POLICY "cust_notif_select"
  ON public.customer_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cust_notif_update"
  ON public.customer_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cust_notif_insert"
  ON public.customer_notifications FOR INSERT TO authenticated
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: BOOKINGS RLS — use customer_id (not user_id)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookings_customer_insert"          ON public.bookings;
DROP POLICY IF EXISTS "bookings_participants_select"      ON public.bookings;
DROP POLICY IF EXISTS "bookings_participants_update"      ON public.bookings;
DROP POLICY IF EXISTS "Customers can create bookings"     ON public.bookings;
DROP POLICY IF EXISTS "Customers can view own bookings"   ON public.bookings;
DROP POLICY IF EXISTS "Customers can cancel own bookings" ON public.bookings;

-- INSERT: customer_id = logged-in user
CREATE POLICY "bookings_customer_insert"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id);

-- SELECT: customer OR provider of this booking
CREATE POLICY "bookings_participants_select"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    auth.uid() = customer_id
    OR provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- UPDATE: customer can cancel, provider can update status
CREATE POLICY "bookings_participants_update"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    auth.uid() = customer_id
    OR provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: MESSAGES TABLE — create if missing + fix RLS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type TEXT        NOT NULL CHECK (sender_type IN ('customer', 'provider')),
  content     TEXT        NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_participants_read_messages"  ON public.messages;
DROP POLICY IF EXISTS "booking_participants_send_messages"  ON public.messages;

CREATE POLICY "messages_select"
  ON public.messages FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM public.bookings
      WHERE customer_id = auth.uid()
         OR provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: REVIEWS TABLE RLS — use customer_id
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert"               ON public.reviews;
DROP POLICY IF EXISTS "reviews_select"               ON public.reviews;

CREATE POLICY "reviews_select"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "reviews_insert"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    -- reviews table uses customer_id (not user_id)
    booking_id IN (
      SELECT id FROM public.bookings
      WHERE customer_id = auth.uid() AND status = 'completed'
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: TRIGGER — new booking → notify provider  (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_provider_on_new_booking()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_service_name  TEXT;
  v_customer_name TEXT;
  v_provider_id   UUID;
BEGIN
  SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
  v_customer_name := COALESCE(NEW.customer_name, 'A customer');
  v_provider_id   := NEW.provider_id;

  INSERT INTO public.provider_notifications
    (provider_id, type, title, message, booking_id, data)
  VALUES (
    v_provider_id,
    'system',
    '📋 New Booking Request!',
    v_customer_name || ' has requested ' || COALESCE(v_service_name, 'a service') || '.',
    NEW.id,
    jsonb_build_object(
      'customer_name', v_customer_name,
      'service_name',  v_service_name,
      'booking_date',  COALESCE(NEW.booking_date::TEXT, NEW.scheduled_date::TEXT),
      'booking_time',  COALESCE(NEW.booking_time::TEXT, NEW.scheduled_time::TEXT)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the booking insert because of a notification error
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_booking_notify_provider ON public.bookings;
CREATE TRIGGER on_new_booking_notify_provider
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_provider_on_new_booking();


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: TRIGGER — booking status change → notify customer (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_customer_on_booking_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider_name TEXT;
  v_service_name  TEXT;
  v_customer_uid  UUID;
BEGIN
  SELECT full_name INTO v_provider_name FROM public.service_providers WHERE id = NEW.provider_id;
  SELECT name      INTO v_service_name  FROM public.services              WHERE id = NEW.service_id;
  v_customer_uid := NEW.customer_id;

  IF v_customer_uid IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (v_customer_uid, 'booking_confirmed', '✅ Booking Confirmed!',
      COALESCE(v_provider_name,'Provider') || ' accepted your ' || COALESCE(v_service_name,'') || ' booking.',
      NEW.id, jsonb_build_object('provider_name', v_provider_name));
  END IF;

  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' THEN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (v_customer_uid, 'job_started', '🚀 Your Pro Has Arrived!',
      COALESCE(v_provider_name,'Provider') || ' started your ' || COALESCE(v_service_name,'') || ' service.',
      NEW.id, jsonb_build_object('provider_name', v_provider_name));
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (v_customer_uid, 'job_completed', '🎉 Service Completed! Rate your experience',
      COALESCE(v_provider_name,'Provider') || ' completed your ' || COALESCE(v_service_name,'') || '. How was it?',
      NEW.id, jsonb_build_object('provider_name', v_provider_name, 'show_review_cta', true));
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (v_customer_uid, 'booking_cancelled', '❌ Booking Cancelled',
      'Your ' || COALESCE(v_service_name,'') || ' booking was cancelled. ' || COALESCE(NEW.cancellation_reason,''),
      NEW.id, jsonb_build_object('reason', NEW.cancellation_reason));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_status_change_notify_customer ON public.bookings;
CREATE TRIGGER on_booking_status_change_notify_customer
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_customer_on_booking_update();


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: TRIGGER — message sent → notify other party (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_uid  UUID;
  v_provider_id   UUID;
  v_prov_name     TEXT;
BEGIN
  SELECT customer_id, provider_id INTO v_customer_uid, v_provider_id
    FROM public.bookings WHERE id = NEW.booking_id;

  SELECT full_name INTO v_prov_name
    FROM public.service_providers WHERE id = v_provider_id;

  IF NEW.sender_type = 'customer' THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, booking_id, data)
    VALUES (v_provider_id, 'system', 'New Message 💬',
      'Customer sent a message about booking #' || LEFT(NEW.booking_id::TEXT, 8),
      NEW.booking_id,
      jsonb_build_object('booking_id', NEW.booking_id, 'message_preview', LEFT(NEW.content, 60)));
    UPDATE public.bookings
      SET unread_messages_provider = COALESCE(unread_messages_provider, 0) + 1
      WHERE id = NEW.booking_id;
  ELSE
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (v_customer_uid, 'new_message',
      'New Message from ' || COALESCE(v_prov_name,'Provider') || ' 💬',
      LEFT(NEW.content, 80), NEW.booking_id,
      jsonb_build_object('booking_id', NEW.booking_id));
    UPDATE public.bookings
      SET unread_messages_customer = COALESCE(unread_messages_customer, 0) + 1
      WHERE id = NEW.booking_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_message_notify_other_party ON public.messages;
CREATE TRIGGER on_new_message_notify_other_party
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: TRIGGER — review submitted → update provider stats (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_review_submitted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_providers SET
    rating       = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id)
  WHERE id = NEW.provider_id;

  INSERT INTO public.provider_notifications (provider_id, type, title, message, booking_id, data)
  VALUES (
    NEW.provider_id, 'system', 'New Review Received ⭐',
    -- reviews table uses customer_id, not user_id
    COALESCE((SELECT display_name FROM public.profiles WHERE id = NEW.customer_id), 'A customer')
      || ' gave you ' || NEW.rating || ' stars.',
    NEW.booking_id,
    jsonb_build_object('rating', NEW.rating, 'booking_id', NEW.booking_id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_review_submitted ON public.reviews;
CREATE TRIGGER on_review_submitted
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_review_submitted();


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: ENABLE REALTIME on all key tables
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bookings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'customer_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'provider_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_notifications;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_customer    ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider    ON public.bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_messages_booking     ON public.messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_cust_notifs_user     ON public.customer_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_prov_notifs_provider ON public.provider_notifications(provider_id, is_read);


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY — run to confirm everything is correct
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'bookings columns' AS check_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings' AND table_schema = 'public'
ORDER BY ordinal_position;
