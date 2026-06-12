-- 0012_map_radius.sql
-- Per-listing buyer-facing map circle radius (miles). NULL -> render default 0.15.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS map_radius_mi real;
