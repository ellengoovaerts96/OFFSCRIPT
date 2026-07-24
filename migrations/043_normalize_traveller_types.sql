UPDATE public.places
SET traveller_types = ARRAY(
  SELECT DISTINCT CASE
    WHEN tag IN ('couples', 'partner') THEN 'couple'
    WHEN tag IN ('friend', 'group', 'groups') THEN 'friends'
    WHEN tag IN ('families', 'kids', 'children') THEN 'family'
    ELSE tag
  END
  FROM unnest(traveller_types) AS tag
  WHERE tag IN ('solo', 'couple', 'couples', 'partner', 'friends', 'friend', 'group', 'groups', 'family', 'families', 'kids', 'children')
  ORDER BY 1
)
WHERE traveller_types IS NOT NULL;
