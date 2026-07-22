UPDATE public.places
SET audience_tags = ARRAY(
  SELECT DISTINCT CASE
    WHEN tag IN ('local', 'locals', 'resident', 'residents') THEN 'residents'
    WHEN tag IN ('african_expat', 'african_expats', 'international_expat', 'international_expats', 'expat', 'expats') THEN 'expats'
    ELSE tag
  END
  FROM unnest(audience_tags) AS tag
  ORDER BY 1
)
WHERE audience_tags && ARRAY[
  'local', 'locals', 'resident', 'residents',
  'african_expat', 'african_expats', 'international_expat', 'international_expats', 'expat', 'expats'
]::TEXT[];

UPDATE public.conversation_contexts
SET avoid_audience_tags = ARRAY(
  SELECT DISTINCT CASE
    WHEN tag IN ('local', 'locals', 'resident', 'residents') THEN 'residents'
    WHEN tag IN ('african_expat', 'african_expats', 'international_expat', 'international_expats', 'expat', 'expats') THEN 'expats'
    ELSE tag
  END
  FROM unnest(avoid_audience_tags) AS tag
  ORDER BY 1
)
WHERE avoid_audience_tags && ARRAY[
  'local', 'locals', 'resident', 'residents',
  'african_expat', 'african_expats', 'international_expat', 'international_expats', 'expat', 'expats'
]::TEXT[];
