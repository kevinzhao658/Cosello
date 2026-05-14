-- Add address fields to public.communities, mirroring the user-profile shape
-- (pickup_address + zip_code). Neighborhood is now free-form; no strict-match
-- validation lives at the schema layer.

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS pickup_address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10);
