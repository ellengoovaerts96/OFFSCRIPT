INSERT INTO public.dishes (dish_key, name_en, name_fr, name_nl) VALUES
  ('continental_breakfast', 'Continental breakfast', 'Petit déjeuner continental', 'Continentaal ontbijt'),
  ('american_breakfast', 'American breakfast', 'Petit déjeuner américain', 'Amerikaans ontbijt'),
  ('grilled_prawns', 'Grilled prawns', 'Gambas grillées', 'Gegrilde gamba’s')
ON CONFLICT (dish_key) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_fr = EXCLUDED.name_fr,
  name_nl = EXCLUDED.name_nl,
  updated_at = NOW();

WITH aliases(dish_key, alias, normalized_alias, language) AS (VALUES
  ('continental_breakfast','continental breakfast','continental breakfast','en'),
  ('continental_breakfast','continentaal ontbijt','continentaal ontbijt','nl'),
  ('continental_breakfast','petit déjeuner continental','petit dejeuner continental','fr'),
  ('american_breakfast','american breakfast','american breakfast','en'),
  ('american_breakfast','amerikaans ontbijt','amerikaans ontbijt','nl'),
  ('american_breakfast','petit déjeuner américain','petit dejeuner americain','fr'),
  ('grilled_prawns','grilled prawns','grilled prawns','en'),
  ('grilled_prawns','grilled shrimp','grilled shrimp','en'),
  ('grilled_prawns','gegrilde gamba’s','gegrilde gambas','nl'),
  ('grilled_prawns','gegrilde garnalen','gegrilde garnalen','nl'),
  ('grilled_prawns','gambas grillées','gambas grillees','fr'),
  ('grilled_prawns','crevettes grillées','crevettes grillees','fr')
)
INSERT INTO public.dish_aliases (dish_id, alias, normalized_alias, language)
SELECT d.id, a.alias, a.normalized_alias, a.language FROM aliases a JOIN public.dishes d USING (dish_key)
ON CONFLICT (normalized_alias) DO NOTHING;
