ALTER TABLE place_images
  DROP COLUMN IF EXISTS copyright_status;

ALTER TABLE place_subcategory_images
  DROP COLUMN IF EXISTS copyright_status;
