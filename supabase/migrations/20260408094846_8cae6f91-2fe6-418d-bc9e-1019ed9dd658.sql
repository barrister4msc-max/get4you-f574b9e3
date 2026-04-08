
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));

  -- Assign roles from user_metadata
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
