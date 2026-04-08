
ALTER TABLE public.profiles ADD COLUMN email text;

-- Backfill existing profiles with emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id;

-- Update handle_new_user to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _role text;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), NEW.email);

  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'client');

  IF _role = 'both' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tasker');
  ELSIF _role = 'tasker' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tasker');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  END IF;

  RETURN NEW;
END;
$$;
