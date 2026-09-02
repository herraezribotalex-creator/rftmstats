CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.app_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_state TO anon, authenticated;
GRANT ALL ON public.app_state TO service_role;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_state public read" ON public.app_state FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.app_admin (
  id int PRIMARY KEY DEFAULT 1,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_admin_single CHECK (id = 1)
);
GRANT ALL ON public.app_admin TO service_role;
ALTER TABLE public.app_admin ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_admin (id, pin_hash) VALUES (1, extensions.crypt('GABI2009', extensions.gen_salt('bf')));

CREATE TABLE public.app_audit (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_audit TO service_role;
ALTER TABLE public.app_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.app_admin_verify(p_pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admin WHERE id = 1 AND pin_hash = extensions.crypt(coalesce(p_pin,''), pin_hash));
$$;

CREATE OR REPLACE FUNCTION public.app_state_set(p_pin text, p_payload jsonb, p_action text DEFAULT 'save')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE k text;
BEGIN
  IF NOT public.app_admin_verify(p_pin) THEN
    RAISE EXCEPTION 'PIN incorrecto';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload invalido';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_payload) LOOP
    INSERT INTO public.app_state(key, value, updated_at)
    VALUES (k, p_payload -> k, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END LOOP;
  INSERT INTO public.app_audit(action) VALUES (coalesce(p_action,'save'));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_admin_set_pin(p_old text, p_new text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.app_admin_verify(p_old) THEN RETURN false; END IF;
  IF p_new IS NULL OR length(p_new) < 4 THEN RAISE EXCEPTION 'PIN demasiado corto'; END IF;
  UPDATE public.app_admin SET pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')), updated_at = now() WHERE id = 1;
  INSERT INTO public.app_audit(action) VALUES ('pin_change');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_audit_list(p_pin text, p_limit int DEFAULT 50)
RETURNS TABLE (created_at timestamptz, action text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.app_admin_verify(p_pin) THEN RAISE EXCEPTION 'PIN incorrecto'; END IF;
  RETURN QUERY SELECT a.created_at, a.action FROM public.app_audit a ORDER BY a.created_at DESC LIMIT least(coalesce(p_limit,50), 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_admin_verify(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_state_set(text, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_admin_set_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_audit_list(text, int) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;