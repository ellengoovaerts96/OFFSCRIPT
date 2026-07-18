ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS vibe_tags TEXT[] NOT NULL DEFAULT '{}';

UPDATE public.places
SET vibe_tags = ARRAY_REMOVE(ARRAY[
  CASE WHEN vibe ~* '(rasta|reggae)' THEN 'rasta_reggae' END,
  CASE WHEN vibe ~* '(romantic|romantique)' THEN 'romantic' END,
  CASE WHEN vibe ~* '(calm|quiet|calme)' THEN 'calm' END,
  CASE WHEN vibe ~* '(relax|laid[ -]?back|chill)' THEN 'relaxed' END,
  CASE WHEN vibe ~* '(lively|vibrant|animé|anime)' THEN 'lively' END,
  CASE WHEN vibe ~* '(sunset|coucher du soleil)' THEN 'sunset' END,
  CASE WHEN vibe ~* '(authentic|authentique)' THEN 'authentic' END,
  CASE WHEN vibe ~* '(artistic|artistique)' THEN 'artistic' END,
  CASE WHEN vibe ~* '(^|[^a-z])local([^a-z]|$)' THEN 'local' END,
  CASE WHEN vibe ~* '(international|cosmopolitan)' THEN 'international' END
], NULL)
WHERE vibe IS NOT NULL;

