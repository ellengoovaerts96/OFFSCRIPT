CREATE TABLE IF NOT EXISTS public.place_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  poster_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  duration_seconds NUMERIC(10,3) NOT NULL,
  format TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT place_videos_dimensions_positive CHECK (width > 0 AND height > 0),
  CONSTRAINT place_videos_duration_nonnegative CHECK (duration_seconds >= 0),
  CONSTRAINT place_videos_file_size_nonnegative CHECK (file_size_bytes >= 0),
  CONSTRAINT place_videos_source_check CHECK (source = 'dashboard')
);

CREATE UNIQUE INDEX IF NOT EXISTS place_videos_place_id_unique
  ON public.place_videos (place_id);

CREATE UNIQUE INDEX IF NOT EXISTS place_videos_cloudinary_public_id_unique
  ON public.place_videos (cloudinary_public_id);
