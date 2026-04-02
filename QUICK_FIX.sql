-- ════════════════════════════════════════════════════════════════
--  HANDYFIX — QUICK FIX SQL
--  Run this NOW in Supabase SQL Editor:
--  https://supabase.com/dashboard/project/rmjbkuorbfcaeplftnfe/sql/new
--
--  This fixes:
--  1. Customer can see their own bookings (My Bookings page)
--  2. Provider can see bookings assigned to them (Bookings page)
--  3. Creates new tables needed for sub-items & custom pricing
--  4. Seeds 54 sub-items across 9 services
-- ════════════════════════════════════════════════════════════════

-- ═══ STEP 1: FIX BOOKING RLS (CRITICAL — fixes both panels) ════

-- Drop all existing conflicting policies first
DROP POLICY IF EXISTS "Providers can view assigned bookings"    ON public.bookings;
DROP POLICY IF EXISTS "Providers can update assigned bookings"  ON public.bookings;
DROP POLICY IF EXISTS "providers_view_own_bookings"             ON public.bookings;
DROP POLICY IF EXISTS "providers_update_own_bookings"           ON public.bookings;
DROP POLICY IF EXISTS "Customers can view own bookings"         ON public.bookings;
DROP POLICY IF EXISTS "customers_view_own_bookings"             ON public.bookings;

-- Single SELECT policy: customer sees their bookings, provider sees theirs
CREATE POLICY "bookings_select_policy"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- UPDATE policy: only provider can update (accept/decline/start/complete)
CREATE POLICY "bookings_update_policy"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.service_providers WHERE user_id = auth.uid()
    )
  );

-- INSERT policy: authenticated customer can create a booking
DROP POLICY IF EXISTS "bookings_insert_policy" ON public.bookings;
CREATE POLICY "bookings_insert_policy"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- ═══ STEP 2: NEW COLUMNS ON BOOKINGS ═══════════════════════════

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sub_item_id   UUID;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sub_item_name TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS provider_amount NUMERIC(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS description    TEXT;

-- ═══ STEP 3: PROVIDER CUSTOM PRICING TABLE ══════════════════════

CREATE TABLE IF NOT EXISTS public.provider_service_pricing (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  service_id  UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price NUMERIC(10,2) NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider_id, service_id)
);
ALTER TABLE public.provider_service_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "providers_manage_own_pricing" ON public.provider_service_pricing;
DROP POLICY IF EXISTS "anyone_read_pricing"          ON public.provider_service_pricing;
CREATE POLICY "providers_manage_own_pricing"
  ON public.provider_service_pricing FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));
CREATE POLICY "anyone_read_pricing"
  ON public.provider_service_pricing FOR SELECT USING (true);

-- ═══ STEP 4: SERVICE SUB-ITEMS TABLE ════════════════════════════

CREATE TABLE IF NOT EXISTS public.service_sub_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  base_price       NUMERIC(10,2) NOT NULL,
  duration_minutes INT DEFAULT 60,
  icon             TEXT DEFAULT '🔧',
  is_active        BOOLEAN DEFAULT true,
  sort_order       INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.service_sub_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_read_sub_items" ON public.service_sub_items;
CREATE POLICY "anyone_read_sub_items" ON public.service_sub_items FOR SELECT USING (true);

-- ═══ STEP 5: SEED SUB-ITEMS ═════════════════════════════════════

-- AC Service
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('AC Gas Refill',         'Refrigerant top-up for all AC brands. Includes leak check.',            599, 60,  '❄️', 1),
  ('AC Deep Cleaning',      'Complete cleaning of filters, coils, and drain. Improves efficiency.',  499, 90,  '🧹', 2),
  ('AC Installation',       'New AC unit installation with pipe fitting and testing.',               799, 120, '🔧', 3),
  ('AC Repair & Service',   'Diagnose and fix cooling issues, fan problems, error codes.',           699, 90,  '⚙️', 4),
  ('AC Uninstallation',     'Safe removal of AC unit with capping of pipes.',                        399, 60,  '🔩', 5),
  ('AC Annual Maintenance', 'Full yearly service: cleaning + gas check + performance test.',         899, 120, '📋', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'ac-service'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- Plumbing
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('Pipe Leak Repair',       'Fix leaking pipes, joints, and fittings. Any brand.',                299, 60,  '💧', 1),
  ('Drain Cleaning',         'Unclog blocked drains in kitchen, bathroom, or toilet.',              399, 60,  '🚿', 2),
  ('Tap/Faucet Replacement', 'Replace or repair dripping taps and faucets.',                       249, 45,  '🔩', 3),
  ('Water Heater Service',   'Repair or replace geyser/water heater. All brands.',                 499, 90,  '🌡️', 4),
  ('Toilet Repair',          'Fix running toilet, flush issues, seat replacement.',                 349, 60,  '🚽', 5),
  ('New Pipe Installation',  'Install new water supply lines or drainage pipes.',                   599, 120, '🔧', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'plumbing'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- Electrical
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('Switch/Socket Repair',  'Fix or replace faulty switches, sockets, and boards.',               199, 30,  '🔌', 1),
  ('Wiring & Rewiring',     'New wiring installation or faulty wire replacement.',                 599, 120, '⚡', 2),
  ('Fan Installation',      'Ceiling or wall fan installation with wiring.',                       299, 45,  '🌀', 3),
  ('MCB/Fuse Box Repair',   'Fix tripping MCB, replace fuses, upgrade panel.',                    449, 60,  '🛡️', 4),
  ('Light Fixture Install', 'Install chandeliers, LED strips, downlights.',                        349, 60,  '💡', 5),
  ('Safety Inspection',     'Full electrical safety audit with report.',                           699, 90,  '📋', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'electrical'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- House Cleaning
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('Regular Cleaning',      '1BHK/2BHK standard cleaning: sweep, mop, dust, sanitize.',          499,  120, '🧹', 1),
  ('Deep Cleaning',         'Intensive cleaning including kitchen degreasing and bathroom scrub.', 999,  240, '✨', 2),
  ('Move-In/Out Cleaning',  'Complete cleaning for vacant flat before moving in or out.',         1499, 360, '📦', 3),
  ('Sofa/Carpet Cleaning',  'Foam wash and steam clean for sofas, carpets, mattresses.',           799,  120, '🛋️', 4),
  ('Kitchen Deep Clean',    'Heavy degreasing of chimney, tiles, sink, and appliances.',           699,  120, '🍳', 5),
  ('Bathroom Sanitization', 'Deep clean and disinfect toilets, tiles, and fixtures.',              399,  60,  '🚿', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'house-cleaning'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- Appliance Repair
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('Washing Machine Repair', 'Fix not spinning, not draining, error codes. All brands.',          399, 60,  '🫧', 1),
  ('Refrigerator Repair',    'Fix cooling issues, compressor, gas top-up. All brands.',           499, 90,  '🧊', 2),
  ('Microwave Repair',       'Fix not heating, turntable issues, door problems.',                  299, 45,  '📡', 3),
  ('Geyser/Water Heater',    'Repair heating element, thermostat, leaks.',                        399, 60,  '🌡️', 4),
  ('TV Repair',              'Fix display issues, no power, remote problems.',                     449, 90,  '📺', 5),
  ('Dishwasher Repair',      'Fix not cleaning, not draining, error codes.',                       349, 60,  '🍽️', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'appliance-repair'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- Home Salon
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('Haircut & Styling',     'Wash, cut, blow-dry. All hair types.',                               299,  60,  '✂️', 1),
  ('Full Body Waxing',      'Complete wax including arms, legs, underarms.',                       599,  90,  '✨', 2),
  ('Facial & Cleanup',      'Deep pore cleansing facial with massage.',                            499,  60,  '💆', 3),
  ('Manicure & Pedicure',   'Nail shaping, cuticle care, polish. Both hands and feet.',           399,  75,  '💅', 4),
  ('Bridal Makeup',         'Full bridal makeup with hair styling for special occasions.',         2499, 180, '👰', 5),
  ('Hair Spa Treatment',    'Deep conditioning hair mask and scalp massage.',                      599,  90,  '💇', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'salon'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- Pest Control
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('Cockroach Control',     'Gel-based treatment. Safe for family and pets.',                      499,  60,  '🪳', 1),
  ('Termite Treatment',     'Drilling and chemical treatment for all wood areas.',                 999,  120, '🐛', 2),
  ('Rodent Control',        'Glue boards, bait stations. Covers full flat.',                       699,  90,  '🐀', 3),
  ('Bed Bug Treatment',     'Heat + chemical treatment for beds, sofas, carpets.',                 799,  120, '🛏️', 4),
  ('Mosquito Control',      'Fogging and spray for complete flat + balcony.',                      399,  45,  '🦟', 5),
  ('Annual Pest Package',   '4 visits per year. Covers all common pests.',                         1999, 60,  '📋', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'pest-control'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- Painting
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('1 Room Interior Paint',  'Full room painting with primer. Labour only.',                      999,  480,  '🖌️', 1),
  ('Full Flat Painting',     '2BHK complete interior painting with Asian Paints.',                4999, 1440, '🏠', 2),
  ('Exterior Painting',      'Weatherproof exterior painting for bungalows and villas.',          7999, 1440, '🏗️', 3),
  ('Texture/Design Paint',   'Decorative texture finishes, wallpaper, or stencil designs.',      2999, 480,  '🎨', 4),
  ('Waterproofing',          'Terrace or bathroom waterproof coating.',                           1999, 240,  '💧', 5),
  ('Wood Polish/Paint',      'Furniture and door polish or enamel paint.',                         799, 120,  '🪵', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'painting'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- Carpentry
INSERT INTO public.service_sub_items (service_id, name, description, base_price, duration_minutes, icon, sort_order)
SELECT s.id, v.name, v.description, v.price::NUMERIC, v.duration::INT, v.icon, v.sort_order::INT
FROM public.services s
CROSS JOIN (VALUES
  ('Furniture Repair',      'Fix broken chairs, tables, beds, wardrobes.',                        299, 60,  '🪑', 1),
  ('Furniture Assembly',    'Assemble flat-pack furniture from IKEA, Pepperfry etc.',             399, 90,  '🔧', 2),
  ('Wardrobe/Cabinet Fix',  'Fix hinges, handles, sliding doors, drawers.',                       349, 60,  '🚪', 3),
  ('Door/Window Repair',    'Fix stiff, squeaky, or damaged doors and windows.',                  299, 60,  '🪟', 4),
  ('Custom Woodwork',       'Custom shelves, lofts, or wooden storage solutions.',                999, 240, '🪚', 5),
  ('Modular Kitchen Fix',   'Repair modular kitchen shutters, hinges, baskets.',                  449, 90,  '🍳', 6)
) AS v(name, description, price, duration, icon, sort_order)
WHERE s.slug = 'carpentry'
  AND NOT EXISTS (SELECT 1 FROM public.service_sub_items WHERE service_id = s.id);

-- ═══ VERIFY ═════════════════════════════════════════════════════
SELECT s.name AS service, COUNT(si.id) AS sub_item_count
FROM public.services s
LEFT JOIN public.service_sub_items si ON si.service_id = s.id
GROUP BY s.name ORDER BY s.name;
