CREATE OR REPLACE FUNCTION public.admin_resend_whatsapp(p_log_id uuid)
RETURNS public.whatsapp_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.whatsapp_logs;
BEGIN
  IF NOT public.is_admin_or_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.whatsapp_logs
  SET status = 'pending',
      error_message = NULL,
      failed_at = NULL,
      sent_at = NULL,
      claimed_at = NULL,
      next_retry_at = NULL,
      provider_message_id = NULL
  WHERE id = p_log_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'WhatsApp log % not found', p_log_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.app_events (event_type, entity_type, entity_id, actor_id, metadata)
  VALUES ('whatsapp.resend_requested', 'whatsapp_logs', v_row.id, auth.uid(),
          jsonb_build_object('phone', v_row.phone, 'event', v_row.event_type));

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resend_whatsapp(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_resend_whatsapp(uuid) TO authenticated;