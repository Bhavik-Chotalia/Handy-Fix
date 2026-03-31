-- ═══════════════════════════════════════════════════════
-- HANDYFIX BRIDGE MIGRATION — Run once in Supabase SQL Editor
-- Connects handyfix-user ↔ handyfix-provider via shared DB
-- ═══════════════════════════════════════════════════════

-- 1. MESSAGES TABLE — Real-time chat between customer and provider per booking
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'provider')),
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_participants_read_messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM public.bookings
      WHERE user_id = auth.uid()
         OR provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "booking_participants_send_messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 2. CUSTOMER NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'booking_confirmed','provider_on_the_way','job_started','job_completed',
    'booking_cancelled','new_message','review_reminder','system'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notifications"
  ON public.customer_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_notifications"
  ON public.customer_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;

-- 3. EXTEND BOOKINGS TABLE with bridge columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS provider_eta_minutes INT,
  ADD COLUMN IF NOT EXISTS provider_location_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS provider_location_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS provider_departed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unread_messages_customer INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_messages_provider INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════
-- TRIGGER A: Provider accepts/starts/completes/cancels → notify customer
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.notify_customer_on_booking_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  provider_name TEXT;
  service_name TEXT;
  customer_uid UUID;
BEGIN
  SELECT sp.name INTO provider_name
    FROM public.service_providers sp WHERE sp.id = NEW.provider_id;
  SELECT s.name INTO service_name
    FROM public.services s WHERE s.id = NEW.service_id;
  SELECT b.user_id INTO customer_uid
    FROM public.bookings b WHERE b.id = NEW.id;

  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    INSERT INTO public.customer_notifications
      (user_id, type, title, message, booking_id, data)
    VALUES (
      customer_uid, 'booking_confirmed',
      'Booking Confirmed! ✅',
      provider_name || ' has accepted your ' || service_name || ' booking for ' || NEW.booking_date::TEXT || ' at ' || NEW.booking_time::TEXT,
      NEW.id,
      jsonb_build_object('provider_name', provider_name, 'date', NEW.booking_date, 'time', NEW.booking_time)
    );
  END IF;

  IF NEW.status = 'in_progress' AND OLD.status = 'confirmed' THEN
    INSERT INTO public.customer_notifications
      (user_id, type, title, message, booking_id, data)
    VALUES (
      customer_uid, 'job_started',
      'Your Pro Has Arrived 🚀',
      provider_name || ' has started your ' || service_name || ' service.',
      NEW.id,
      jsonb_build_object('provider_name', provider_name)
    );
  END IF;

  IF NEW.status = 'completed' AND OLD.status = 'in_progress' THEN
    INSERT INTO public.customer_notifications
      (user_id, type, title, message, booking_id, data)
    VALUES (
      customer_uid, 'job_completed',
      'Service Completed! ⭐ Rate your experience',
      provider_name || ' has completed your ' || service_name || ' service. How was it?',
      NEW.id,
      jsonb_build_object('provider_name', provider_name, 'show_review_cta', true)
    );
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    INSERT INTO public.customer_notifications
      (user_id, type, title, message, booking_id, data)
    VALUES (
      customer_uid, 'booking_cancelled',
      'Booking Cancelled',
      'Your ' || service_name || ' booking on ' || NEW.booking_date::TEXT || ' has been cancelled. ' || COALESCE(NEW.cancellation_reason, ''),
      NEW.id,
      jsonb_build_object('reason', NEW.cancellation_reason)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_status_change_notify_customer ON public.bookings;
CREATE TRIGGER on_booking_status_change_notify_customer
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_customer_on_booking_update();

-- ═══════════════════════════════════════════════════════
-- TRIGGER B: New message → notify other party
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  booking_rec RECORD;
  provider_uid UUID;
  customer_uid UUID;
  prov_name TEXT;
  prov_id UUID;
BEGIN
  SELECT b.user_id, b.provider_id, sp.user_id, sp.name, sp.id
    INTO customer_uid, prov_id, provider_uid, prov_name, prov_id
    FROM public.bookings b
    JOIN public.service_providers sp ON sp.id = b.provider_id
    WHERE b.id = NEW.booking_id;

  IF NEW.sender_type = 'customer' THEN
    INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    VALUES (
      prov_id, 'system',
      'New Message 💬',
      'Customer sent you a message about booking #' || LEFT(NEW.booking_id::TEXT, 8),
      jsonb_build_object('booking_id', NEW.booking_id, 'message_preview', LEFT(NEW.content, 60))
    );
    UPDATE public.bookings SET unread_messages_provider = COALESCE(unread_messages_provider, 0) + 1 WHERE id = NEW.booking_id;
  ELSE
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (
      customer_uid, 'new_message',
      'New Message from ' || prov_name || ' 💬',
      LEFT(NEW.content, 80),
      NEW.booking_id,
      jsonb_build_object('booking_id', NEW.booking_id)
    );
    UPDATE public.bookings SET unread_messages_customer = COALESCE(unread_messages_customer, 0) + 1 WHERE id = NEW.booking_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_message_notify_other_party ON public.messages;
CREATE TRIGGER on_new_message_notify_other_party
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_message();

-- ═══════════════════════════════════════════════════════
-- TRIGGER C: Provider departs → notify customer with ETA
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.notify_customer_provider_on_way()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  provider_name TEXT;
  service_name TEXT;
BEGIN
  IF NEW.provider_departed_at IS NOT NULL AND OLD.provider_departed_at IS NULL THEN
    SELECT sp.name INTO provider_name FROM public.service_providers sp WHERE sp.id = NEW.provider_id;
    SELECT s.name INTO service_name FROM public.services s WHERE s.id = NEW.service_id;
    INSERT INTO public.customer_notifications (user_id, type, title, message, booking_id, data)
    VALUES (
      NEW.user_id, 'provider_on_the_way',
      provider_name || ' is on the way! 🚗',
      'Your ' || service_name || ' pro will arrive in approx. ' || COALESCE(NEW.provider_eta_minutes::TEXT, '15–20') || ' minutes.',
      NEW.id,
      jsonb_build_object('eta_minutes', NEW.provider_eta_minutes, 'provider_name', provider_name)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_provider_departed ON public.bookings;
CREATE TRIGGER on_provider_departed
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.provider_departed_at IS NULL AND NEW.provider_departed_at IS NOT NULL)
  EXECUTE FUNCTION public.notify_customer_provider_on_way();

-- ═══════════════════════════════════════════════════════
-- TRIGGER D: Review submitted → update provider stats
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_review_submitted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_providers SET
    rating = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id)
  WHERE id = NEW.provider_id;

  INSERT INTO public.provider_notifications (provider_id, type, title, message, data)
    SELECT sp.id, 'new_review',
      'New Review Received ⭐',
      COALESCE(
        (SELECT display_name FROM public.profiles WHERE id = NEW.user_id),
        'A customer'
      ) || ' gave you ' || NEW.rating || ' stars.',
      jsonb_build_object('rating', NEW.rating, 'booking_id', NEW.booking_id)
    FROM public.service_providers sp WHERE sp.id = NEW.provider_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_review_submitted ON public.reviews;
CREATE TRIGGER on_review_submitted
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_review_submitted();

-- ═══════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════

-- Allow customers to read active, online providers
DROP POLICY IF EXISTS "Anyone can view active online providers" ON public.service_providers;
CREATE POLICY "Anyone can view active online providers"
  ON public.service_providers FOR SELECT
  USING (status = 'active' AND is_online = true);

-- Allow customers to create bookings
DROP POLICY IF EXISTS "Customers can create bookings" ON public.bookings;
CREATE POLICY "Customers can create bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow customers to cancel own bookings  
DROP POLICY IF EXISTS "Customers can cancel own bookings" ON public.bookings;
CREATE POLICY "Customers can cancel own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow customers to insert reviews
DROP POLICY IF EXISTS "Customers can insert reviews" ON public.reviews;
CREATE POLICY "Customers can insert reviews"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    booking_id IN (
      SELECT id FROM public.bookings WHERE user_id = auth.uid() AND status = 'completed'
    )
  );

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_messages_booking ON public.messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_customer_notifs_user ON public.customer_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_notifs_unread ON public.customer_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_providers_pincode ON public.service_providers USING GIN(pincodes);
