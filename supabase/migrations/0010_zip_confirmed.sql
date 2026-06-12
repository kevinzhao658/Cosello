ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_confirmed boolean NOT NULL DEFAULT false;
