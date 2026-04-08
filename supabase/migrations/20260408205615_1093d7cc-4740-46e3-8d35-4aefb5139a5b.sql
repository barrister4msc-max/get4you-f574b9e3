
-- Add auto-incrementing user number
CREATE SEQUENCE IF NOT EXISTS public.user_number_seq START 1001;

ALTER TABLE public.profiles ADD COLUMN user_number integer UNIQUE DEFAULT nextval('public.user_number_seq');

-- Backfill existing profiles
UPDATE public.profiles SET user_number = nextval('public.user_number_seq') WHERE user_number IS NULL;

-- Make it not null after backfill
ALTER TABLE public.profiles ALTER COLUMN user_number SET NOT NULL;
