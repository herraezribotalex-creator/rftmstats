-- 1) app_state: lectura pública sólo de las claves que usa el frontend (excluye CONFIG interna)
DROP POLICY IF EXISTS "app_state public read" ON public.app_state;
CREATE POLICY "app_state public read" ON public.app_state
  FOR SELECT TO anon, authenticated
  USING (key <> 'CONFIG');

-- 2) Escritura directa imposible desde el cliente (sólo vía RPC SECURITY DEFINER con PIN)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.app_state FROM anon, authenticated;
REVOKE ALL ON public.app_admin FROM anon, authenticated;
REVOKE ALL ON public.app_audit FROM anon, authenticated;
GRANT SELECT ON public.app_state TO anon, authenticated;
GRANT ALL ON public.app_state TO service_role;
GRANT ALL ON public.app_admin TO service_role;
GRANT ALL ON public.app_audit TO service_role;

ALTER TABLE public.app_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

-- 3) Quitar EXECUTE del rol PUBLIC genérico; sólo los roles de la app
REVOKE ALL ON FUNCTION public.app_admin_verify(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_state_set(text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_admin_set_pin(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_audit_list(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_admin_verify(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_state_set(text, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_admin_set_pin(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_audit_list(text, integer) TO anon, authenticated, service_role;

-- 4) Anti fuerza bruta del PIN
CREATE OR REPLACE FUNCTION public.app_admin_verify(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE ok boolean; fails int;
BEGIN
  SELECT count(*) INTO fails FROM public.app_audit
   WHERE action = 'pin_fail' AND created_at > now() - interval '10 minutes';
  IF fails >= 10 THEN
    RAISE EXCEPTION 'Demasiados intentos fallidos. Espera unos minutos.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.app_admin
     WHERE id = 1 AND pin_hash = extensions.crypt(coalesce(p_pin,''), pin_hash)
  ) INTO ok;

  IF NOT ok THEN
    INSERT INTO public.app_audit(action) VALUES ('pin_fail');
  END IF;
  RETURN ok;
END;
$$;

-- 5) El historial no muestra los registros internos de intentos fallidos
CREATE OR REPLACE FUNCTION public.app_audit_list(p_pin text, p_limit integer DEFAULT 50)
RETURNS TABLE(created_at timestamp with time zone, action text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT public.app_admin_verify(p_pin) THEN RAISE EXCEPTION 'PIN incorrecto'; END IF;
  RETURN QUERY SELECT a.created_at, a.action FROM public.app_audit a
    WHERE a.action <> 'pin_fail'
    ORDER BY a.created_at DESC LIMIT least(coalesce(p_limit,50), 200);
END;
$$;