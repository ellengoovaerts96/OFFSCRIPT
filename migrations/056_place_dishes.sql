CREATE TABLE IF NOT EXISTS public.dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_key TEXT NOT NULL UNIQUE CHECK (dish_key = lower(dish_key) AND dish_key ~ '^[a-z0-9_]+$'),
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_nl TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dish_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL UNIQUE,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.place_dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE RESTRICT,
  availability_status TEXT NOT NULL CHECK (availability_status IN ('known_for', 'usually_available', 'sometimes_available')),
  last_verified_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'field_research', 'restaurant', 'traveller_feedback')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (place_id, dish_id)
);

CREATE INDEX IF NOT EXISTS place_dishes_place_id_idx ON public.place_dishes(place_id);
CREATE INDEX IF NOT EXISTS place_dishes_dish_id_status_idx ON public.place_dishes(dish_id, availability_status);

INSERT INTO public.dishes (dish_key, name_en, name_fr, name_nl) VALUES
  ('thieboudienne', 'Thieboudienne', 'Thiéboudienne', 'Thiéboudienne'),
  ('yassa', 'Yassa', 'Yassa', 'Yassa'),
  ('mafe', 'Mafé', 'Mafé', 'Mafé'),
  ('ceebu_yapp', 'Ceebu yapp', 'Ceebu yapp', 'Ceebu yapp'),
  ('soupe_kandia', 'Soupou kandja', 'Soupou kandja', 'Soupou kandja'),
  ('domoda', 'Domoda', 'Domoda', 'Domoda'),
  ('grilled_fish', 'Grilled fish', 'Poisson grillé', 'Gegrilde vis')
ON CONFLICT (dish_key) DO NOTHING;

WITH aliases(dish_key, alias, normalized_alias, language) AS (VALUES
  ('thieboudienne','thieb','thieb','fr'), ('thieboudienne','thiéboudienne','thieboudienne','fr'),
  ('thieboudienne','thiéboudiène','thieboudiene','fr'),
  ('thieboudienne','ceebu jën','ceebu jen','wo'), ('thieboudienne','ceebu jen','ceebu jen',NULL),
  ('thieboudienne','riz au poisson','riz au poisson','fr'),
  ('yassa','yassa','yassa',NULL), ('yassa','yassa poulet','yassa poulet','fr'),
  ('yassa','poulet yassa','poulet yassa','fr'), ('yassa','chicken yassa','chicken yassa','en'),
  ('mafe','mafé','mafe','fr'), ('mafe','maafe','maafe',NULL), ('mafe','peanut stew','peanut stew','en'),
  ('ceebu_yapp','ceebu yapp','ceebu yapp','wo'), ('ceebu_yapp','riz à la viande','riz a la viande','fr'),
  ('soupe_kandia','soupe kandia','soupe kandia','fr'), ('soupe_kandia','soupou kandja','soupou kandja','wo'),
  ('domoda','domoda','domoda',NULL),
  ('grilled_fish','grilled fish','grilled fish','en'), ('grilled_fish','gegrilde vis','gegrilde vis','nl'),
  ('grilled_fish','poisson grillé','poisson grille','fr'), ('grilled_fish','poisson braisé','poisson braise','fr'),
  ('grilled_fish','grilled sea bream','grilled sea bream','en'), ('grilled_fish','dorade grillée','dorade grillee','fr'),
  ('grilled_fish','gegrilde dorade','gegrilde dorade','nl')
)
INSERT INTO public.dish_aliases (dish_id, alias, normalized_alias, language)
SELECT d.id, a.alias, a.normalized_alias, a.language FROM aliases a JOIN public.dishes d USING (dish_key)
ON CONFLICT (normalized_alias) DO NOTHING;
