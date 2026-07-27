UPDATE public.places
SET
  amenities = (
    SELECT ARRAY(
      SELECT DISTINCT amenity
      FROM unnest(COALESCE(amenities, ARRAY[]::text[]) || ARRAY['ocean_view']) AS amenity
      ORDER BY amenity
    )
  ),
  updated_at = NOW()
WHERE lower(btrim(name)) = lower('Chez Iso');
