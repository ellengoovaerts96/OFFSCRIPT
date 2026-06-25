CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  country TEXT DEFAULT 'Senegal',
  region TEXT,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  short_whatsapp_reply TEXT,
  whatsapp_triggers TEXT[],
  hero_image TEXT,
  audio_url TEXT,
  best_time TEXT,
  transport_notes TEXT,
  family_notes TEXT,
  related_place_id UUID,
  related_experience_id UUID,
  featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS short_whatsapp_reply TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_triggers TEXT[],
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS related_place_id UUID,
  ADD COLUMN IF NOT EXISTS related_experience_id UUID;

CREATE INDEX IF NOT EXISTS stories_status_idx ON stories(status);
CREATE INDEX IF NOT EXISTS stories_slug_idx ON stories(slug);
CREATE INDEX IF NOT EXISTS stories_category_idx ON stories(category);
CREATE INDEX IF NOT EXISTS stories_whatsapp_triggers_idx ON stories USING GIN(whatsapp_triggers);

CREATE TABLE IF NOT EXISTS story_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  short_whatsapp_reply TEXT NOT NULL,
  url_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(story_id, locale)
);

WITH story AS (
  INSERT INTO stories (
    title,
    slug,
    category,
    country,
    excerpt,
    body,
    short_whatsapp_reply,
    whatsapp_triggers,
    hero_image,
    status,
    featured
  )
  VALUES (
    'Na nga def?',
    'na-nga-def',
    'Language',
    'Senegal',
    'A simple Wolof greeting that opens doors, softens arrivals and helps a traveller meet Senegal with more care.',
    'Na nga def? is one of the easiest Wolof phrases to learn before travelling in Senegal. It means: How are you?',
    'Na nga def? means "How are you?" in Wolof. Using a few Wolof words is warmly appreciated by many Senegalese people.',
    ARRAY[
      'na nga def',
      'what means na nga def',
      'what does na nga def mean',
      'what is na nga def',
      'hello in wolof',
      'wolof greeting',
      'wat betekent na nga def',
      'wat is na nga def',
      'hallo in wolof',
      'bonjour en wolof',
      'que veut dire na nga def',
      'qu est ce que na nga def',
      'was bedeutet na nga def',
      'hallo auf wolof'
    ],
    '/images/offscript-dakar.jpg',
    'published',
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    title = EXCLUDED.title,
    category = EXCLUDED.category,
    country = EXCLUDED.country,
    excerpt = EXCLUDED.excerpt,
    body = EXCLUDED.body,
    short_whatsapp_reply = EXCLUDED.short_whatsapp_reply,
    whatsapp_triggers = EXCLUDED.whatsapp_triggers,
    hero_image = EXCLUDED.hero_image,
    status = EXCLUDED.status,
    featured = EXCLUDED.featured,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO story_translations (
  story_id,
  locale,
  title,
  excerpt,
  body,
  short_whatsapp_reply,
  url_path
)
SELECT
  story.id,
  translation.locale,
  translation.title,
  translation.excerpt,
  translation.body,
  translation.short_whatsapp_reply,
  translation.url_path
FROM story
CROSS JOIN (
  VALUES
    (
      'en',
      'Na nga def?',
      'A simple Wolof greeting that opens doors, softens arrivals and helps a traveller meet Senegal with more care.',
      'Na nga def? is one of the easiest Wolof phrases to learn before travelling in Senegal. It means: How are you?',
      'Na nga def? means "How are you?" in Wolof. Using a few Wolof words is warmly appreciated by many Senegalese people.',
      '/stories/na-nga-def'
    ),
    (
      'nl',
      'Na nga def?',
      'Een eenvoudige Wolof-begroeting die je helpt om Senegal met meer aandacht binnen te stappen.',
      'Na nga def? is een van de handigste Wolof-zinnen om te leren voor je naar Senegal reist. Het betekent: Hoe gaat het?',
      'Na nga def? betekent "Hoe gaat het?" in het Wolof. Een paar woorden Wolof gebruiken wordt door veel Senegalezen enorm gewaardeerd.',
      '/stories/na-nga-def'
    ),
    (
      'fr',
      'Na nga def ?',
      'Une salutation wolof simple qui ouvre les échanges et aide à arriver au Sénégal avec plus d’attention.',
      'Na nga def ? est l’une des phrases wolof les plus utiles à apprendre avant un voyage au Sénégal. Elle signifie : comment vas-tu ?',
      'Na nga def ? signifie "Comment vas-tu ?" en wolof. Quelques mots de wolof sont souvent très appréciés au Sénégal.',
      '/fr/stories/na-nga-def'
    ),
    (
      'de',
      'Na nga def?',
      'Eine einfache Wolof-Begrüßung, die Reisenden hilft, Senegal aufmerksamer zu begegnen.',
      'Na nga def? ist eine der nützlichsten Wolof-Formulierungen für eine Reise nach Senegal. Sie bedeutet: Wie geht es dir?',
      'Na nga def? bedeutet auf Wolof "Wie geht es dir?". Ein paar Wörter Wolof werden von vielen Senegalesinnen und Senegalesen sehr geschätzt.',
      '/stories/na-nga-def'
    )
) AS translation(locale, title, excerpt, body, short_whatsapp_reply, url_path)
ON CONFLICT (story_id, locale) DO UPDATE
SET
  title = EXCLUDED.title,
  excerpt = EXCLUDED.excerpt,
  body = EXCLUDED.body,
  short_whatsapp_reply = EXCLUDED.short_whatsapp_reply,
  url_path = EXCLUDED.url_path,
  updated_at = NOW();
