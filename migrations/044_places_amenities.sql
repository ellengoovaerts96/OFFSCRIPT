ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.field_research_raw
  ADD COLUMN IF NOT EXISTS amenities TEXT;

ALTER TABLE public.conversation_context
  ADD COLUMN IF NOT EXISTS requested_amenities TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.places.amenities IS
  'Normalized facilities used for recommendation constraints, such as air_conditioning, wifi, power_outlets and indoor_seating.';

COMMENT ON COLUMN public.conversation_context.requested_amenities IS
  'Normalized facilities explicitly requested by the user.';

WITH inferred AS (
  SELECT
    id,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN searchable ~* '\m(air[ -]?conditioning|airco|climatis(e|é|ée|ation)|a\/c)\M' THEN 'air_conditioning' END,
      CASE WHEN searchable ~* '\m(wi[ -]?fi|internet)\M' THEN 'wifi' END,
      CASE WHEN searchable ~* '\m(power outlets?|electrical outlets?|plug sockets?|sockets?|stopcontact(en)?|prises? électriques?)\M' THEN 'power_outlets' END,
      CASE WHEN searchable ~* '\m(indoor seating|inside seating|seats inside|zitplaatsen binnen|plaatsen binnen|salle intérieure|interieur)\M' THEN 'indoor_seating' END
    ], NULL) AS detected
  FROM (
    SELECT
      id,
      concat_ws(
        ' ',
        short_description, short_description_en, short_description_fr,
        practical_info, practical_info_en, practical_info_fr,
        personal_tip, personal_tip_en, personal_tip_fr,
        vibe, opening_hours
      ) AS searchable
    FROM public.places
  ) source
)
UPDATE public.places place
SET amenities = ARRAY(
  SELECT DISTINCT amenity
  FROM unnest(place.amenities || inferred.detected) amenity
  WHERE amenity IS NOT NULL
)
FROM inferred
WHERE inferred.id = place.id
  AND cardinality(inferred.detected) > 0;
