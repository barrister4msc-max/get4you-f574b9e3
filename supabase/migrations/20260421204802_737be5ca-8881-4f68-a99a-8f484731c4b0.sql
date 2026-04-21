-- Fix function search_path mutable warnings (SECURITY hardening)
-- Each function gets explicit `SET search_path = public` to prevent search_path hijacking.

ALTER FUNCTION public.find_executors_by_language(text) SET search_path = public;
ALTER FUNCTION public.get_conversations() SET search_path = public;
ALTER FUNCTION public.get_orders_nearby(double precision, double precision, double precision) SET search_path = public;
ALTER FUNCTION public.is_valid_languages(text[]) SET search_path = public;
ALTER FUNCTION public.nearby_profiles(double precision, double precision, double precision) SET search_path = public;
ALTER FUNCTION public.get_my_role() SET search_path = public;