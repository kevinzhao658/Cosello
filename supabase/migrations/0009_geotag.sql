-- supabase/migrations/0009_geotag.sql
-- Phase 1 geotag: ZIP-centroid lookup table + listing coordinates.
CREATE TABLE IF NOT EXISTS zip_centroids (
    zip_code  varchar(10) PRIMARY KEY,
    latitude  double precision NOT NULL,
    longitude double precision NOT NULL,
    borough   varchar(40)
);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude  double precision;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS zip_code  varchar(10);
