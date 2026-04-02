-- ══════════════════════════════════════════════════════════════════
-- FIX_BOOKINGS_SCHEMA.sql
-- Adds ALL columns the booking flow needs.
-- Run this in: Supabase Dashboard → SQL Editor (project jviwwhjwtyneqrguumro)
-- ══════════════════════════════════════════════════════════════════

-- ── Step 1: Add every column the app inserts ──────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_date           DATE,
  ADD COLUMN IF NOT EXISTS booking_time           TIME,
  ADD COLUMN IF NOT EXISTS city                   TEXT,
  ADD COLUMN IF NOT EXISTS address                TEXT,
  ADD COLUMN IF NOT EXISTS pincode                TEXT,
  ADD COLUMN IF NOT EXISTS special_instructions   TEXT,
  ADD COLUMN IF NOT EXISTS total_amount           INT,
  ADD COLUMN IF NOT EXISTS customer_name          TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone         TEXT,
  ADD COLUMN IF NOT EXISTS platform_fee           INT  DEFAULT 49,
  ADD COLUMN IF NOT EXISTS provider_amount        INT,
  ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason    TEXT,
  ADD COLUMN IF NOT EXISTS started_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_departed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_eta_minutes   INT,
  ADD COLUMN IF NOT EXISTS unread_messages_customer INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unread_messages_provider INT DEFAULT 0;

-- ── Step 2: Make sure status column has correct default ───────────
ALTER TABLE public.bookings
  ALTER COLUMN status SET DEFAULT 'pending';

-- ── Step 3: Fix RLS — drop all old policies and recreate ──────────
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookings_customer_insert"            ON public.bookings;
DROP POLICY IF EXISTS "bookings_participants_select"        ON public.bookings;
DROP POLICY IF EXISTS "bookings_participants_update"        ON public.bookings;
DROP POLICY IF EXISTS "Customers can create bookings"       ON public.bookings;
DROP POLICY IF EXISTS "Customers can view own bookings"     ON public.bookings;
DROP POLICY IF EXISTS "Customers can cancel own bookings"   ON public.bookings;

-- INSERT: only the customer can create their own booking
CREATE POLICY "bookings_customer_insert"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = customer_id);

-- SELECT: customer sees own + provider sees assigned
CREATE POLICY "bookings_participants_select"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    auth.uid() = customer_id
    OR provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- UPDATE: customer can cancel; provider updates status
CREATE POLICY "bookings_participants_update"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    auth.uid() = customer_id
    OR provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- ── Step 4: Verify — run these to confirm everything worked ───────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT policyname, cmd FROM pg_policies WHERE tablename = 'bookings';
