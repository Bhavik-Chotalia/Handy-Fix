-- ═══════════════════════════════════════════════════════
-- HANDYFIX SLUGS MIGRATION — Run once in Supabase SQL Editor
-- Adds slugs to the services table so /services/:slug routes work
-- ═══════════════════════════════════════════════════════

-- Step 1: Add slug column (idempotent)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS slug TEXT;

-- Step 2: Set slugs for all standard HandyFix services
UPDATE public.services SET slug = 'ac-service'       WHERE LOWER(name) LIKE '%ac service%'       AND slug IS NULL;
UPDATE public.services SET slug = 'appliance-repair' WHERE LOWER(name) LIKE '%appliance%'         AND slug IS NULL;
UPDATE public.services SET slug = 'carpentry'        WHERE LOWER(name) LIKE '%carpent%'           AND slug IS NULL;
UPDATE public.services SET slug = 'electrical'       WHERE LOWER(name) LIKE '%electr%'            AND slug IS NULL;
UPDATE public.services SET slug = 'home-salon'       WHERE LOWER(name) LIKE '%salon%'             AND slug IS NULL;
UPDATE public.services SET slug = 'house-cleaning'   WHERE LOWER(name) LIKE '%cleaning%'          AND slug IS NULL;
UPDATE public.services SET slug = 'hvac'             WHERE LOWER(name) LIKE '%hvac%'              AND slug IS NULL;
UPDATE public.services SET slug = 'painting'         WHERE LOWER(name) LIKE '%paint%'             AND slug IS NULL;
UPDATE public.services SET slug = 'pest-control'     WHERE LOWER(name) LIKE '%pest%'              AND slug IS NULL;
UPDATE public.services SET slug = 'plumbing'         WHERE LOWER(name) LIKE '%plumb%'             AND slug IS NULL;

-- Step 3: For any service that still has no slug, generate one from name
UPDATE public.services
  SET slug = LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g'))
  WHERE slug IS NULL;

-- Step 4: Make slug unique (safe — will error if duplicates exist)
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_slug ON public.services(slug);

-- Step 5: Verify — run this to confirm all slugs are set
SELECT id, name, slug FROM public.services ORDER BY name;
