-- ══════════════════════════════════════════════════════════════════
-- HANDY-FIX BOOKING FLOW MIGRATION  (v2 — fixed for actual schema)
-- bookings table uses: customer_id (NOT user_id)
-- Run in Supabase SQL Editor → project jviwwhjwtyneqrguumro
-- ══════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1. Add missing columns to bookings table
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_name           TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone          TEXT,
  ADD COLUMN IF NOT EXISTS platform_fee            INT  DEFAULT 49,
  ADD COLUMN IF NOT EXISTS provider_amount         INT,
  ADD COLUMN IF NOT EXISTS cancelled_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason     TEXT,
  ADD COLUMN IF NOT EXISTS started_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_departed_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_eta_minutes    INT,
  ADD COLUMN IF NOT EXISTS unread_messages_customer INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_messages_provider INT DEFAULT 0;

-- ──────────────────────────────────────────────────────────────────
-- 2. Fix RLS on bookings
--    bookings.customer_id = the logged-in user's auth.uid()
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- INSERT: customer creates their own booking
DROP POLICY IF EXISTS "Customers can create bookings" ON public.bookings;
CREATE POLICY "Customers can create bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id);

-- SELECT: customer sees their bookings; provider sees bookings assigned to them
DROP POLICY IF EXISTS "Customers can view own bookings" ON public.bookings;
CREATE POLICY "Customers can view own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    auth.uid() = customer_id
    OR provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- UPDATE: customer can cancel; provider can update status
DROP POLICY IF EXISTS "Customers can cancel own bookings" ON public.bookings;
CREATE POLICY "Customers can cancel own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    auth.uid() = customer_id
    OR provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 3. Messages table (chat between user and provider)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID      NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id   UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type TEXT      NOT NULL CHECK (sender_type IN ('customer', 'provider')),
  content     TEXT      NOT NULL,
  is_read     BOOLEAN   NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_participants_read_messages" ON public.messages;
CREATE POLICY "booking_participants_read_messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM public.bookings
      WHERE customer_id = auth.uid()
         OR provider_id IN (
           SELECT id FROM public.service_providers WHERE user_id = auth.uid()
         )
    )
  );

DROP POLICY IF EXISTS "booking_participants_send_messages" ON public.messages;
CREATE POLICY "booking_participants_send_messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────
-- 4. Customer notifications table
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT      NOT NULL,
  title      TEXT      NOT NULL,
  message    TEXT      NOT NULL,
  booking_id UUID      REFERENCES public.bookings(id) ON DELETE SET NULL,
  is_read    BOOLEAN   NOT NULL DEFAULT false,
  data       JSONB     DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_customer_notifications_select" ON public.customer_notifications;
CREATE POLICY "users_own_customer_notifications_select"
  ON public.customer_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_customer_notifications" ON public.customer_notifications;
CREATE POLICY "users_update_customer_notifications"
  ON public.customer_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────
-- 5. Trigger: notify customer when provider updates booking status
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_customer_on_booking_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider_name TEXT;
  v_service_name  TEXT;
BEGIN
  SELECT full_name INTO v_provider_name FROM public.service_providers WHERE id = NEW.provider_id;
  SELECT name      INTO v_service_name  FROM public.services WHERE id = NEW.service_id;

  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;

  -- Provider accepted booking
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    INSERT INTO public.customer_notifications(user_id, type, title, message, booking_id, data)
    VALUES (
      NEW.customer_id, 'booking_confirmed', '✅ Booking Confirmed!',
      COALESCE(v_provider_name,'Provider') || ' accepted your ' || COALESCE(v_service_name,'') || ' booking.',
      NEW.id, jsonb_build_object('provider_name', v_provider_name)
    );
  END IF;

  -- Provider started job
  IF NEW.status = 'in_progress' AND (OLD.status IS DISTINCT FROM 'in_progress') THEN
    INSERT INTO public.customer_notifications(user_id, type, title, message, booking_id, data)
    VALUES (
      NEW.customer_id, 'job_started', '🚀 Your Pro Has Arrived!',
      COALESCE(v_provider_name,'Provider') || ' started your ' || COALESCE(v_service_name,'') || ' service.',
      NEW.id, jsonb_build_object('provider_name', v_provider_name)
    );
  END IF;

  -- Job completed
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.customer_notifications(user_id, type, title, message, booking_id, data)
    VALUES (
      NEW.customer_id, 'job_completed', '🎉 Service Completed! Rate your experience',
      COALESCE(v_provider_name,'Provider') || ' completed your ' || COALESCE(v_service_name,'') || '. How was it?',
      NEW.id, jsonb_build_object('provider_name', v_provider_name, 'show_review_cta', true)
    );
  END IF;

  -- Booking cancelled
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    INSERT INTO public.customer_notifications(user_id, type, title, message, booking_id, data)
    VALUES (
      NEW.customer_id, 'booking_cancelled', '❌ Booking Cancelled',
      'Your ' || COALESCE(v_service_name,'') || ' booking was cancelled. ' || COALESCE(NEW.cancellation_reason,''),
      NEW.id, jsonb_build_object('reason', NEW.cancellation_reason)
    );
  END IF;

  -- Provider on the way
  IF NEW.provider_departed_at IS NOT NULL AND OLD.provider_departed_at IS NULL THEN
    INSERT INTO public.customer_notifications(user_id, type, title, message, booking_id, data)
    VALUES (
      NEW.customer_id, 'provider_on_the_way',
      COALESCE(v_provider_name,'Provider') || ' is on the way! 🚗',
      'Your pro will arrive in approx. ' || COALESCE(NEW.provider_eta_minutes::TEXT, '15-20') || ' minutes.',
      NEW.id, jsonb_build_object('eta_minutes', NEW.provider_eta_minutes, 'provider_name', v_provider_name)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_status_change_notify_customer ON public.bookings;
CREATE TRIGGER on_booking_status_change_notify_customer
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR (OLD.provider_departed_at IS NULL AND NEW.provider_departed_at IS NOT NULL)
  )
  EXECUTE FUNCTION public.notify_customer_on_booking_status_change();

-- ──────────────────────────────────────────────────────────────────
-- 6. Enable Realtime on key tables (safe — skips if already added)
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'customer_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 7. Verify ✅ — run these to confirm success
-- ──────────────────────────────────────────────────────────────────

-- Should show ALL new columns:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Should show 3 policies (INSERT, SELECT, UPDATE):
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'bookings';
