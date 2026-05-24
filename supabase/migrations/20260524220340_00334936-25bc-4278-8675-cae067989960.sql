-- Duplicate detection report (logged, not modified)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT phone, count(*) AS c,
           jsonb_agg(jsonb_build_object('user_id',user_id,'email',email,'created_at',created_at,'updated_at',updated_at)) AS owners
    FROM public.profiles
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY phone HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'DUPLICATE phone=% count=% owners=%', r.phone, r.c, r.owners;
  END LOOP;
  FOR r IN
    SELECT whatsapp_phone AS phone, count(*) AS c,
           jsonb_agg(jsonb_build_object('user_id',user_id,'email',email,'created_at',created_at,'updated_at',updated_at)) AS owners
    FROM public.profiles
    WHERE whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''
    GROUP BY whatsapp_phone HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'DUPLICATE whatsapp_phone=% count=% owners=%', r.phone, r.c, r.owners;
  END LOOP;
END $$;

-- Unique partial indexes (E.164 values only; empty strings & NULLs allowed)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique_idx
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_phone_unique_idx
  ON public.profiles (whatsapp_phone)
  WHERE whatsapp_phone IS NOT NULL AND whatsapp_phone <> '';