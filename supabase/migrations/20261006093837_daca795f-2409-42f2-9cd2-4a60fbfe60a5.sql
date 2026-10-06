CREATE TABLE public.pred_votes (
  mid text NOT NULL,
  voter text NOT NULL,
  nick text NOT NULL,
  pick bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mid, voter)
);
CREATE TABLE public.pred_matches (
  mid text PRIMARY KEY,
  p1 bigint, p2 bigint,
  winner bigint,
  resolved_at timestamptz
);
GRANT ALL ON public.pred_votes TO service_role;
GRANT ALL ON public.pred_matches TO service_role;
ALTER TABLE public.pred_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pred_matches ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pred_vote(p_mid text, p_voter text, p_nick text, p_pick bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tv jsonb; a bigint; b bigint;
BEGIN
  IF length(coalesce(p_voter,'')) < 8 OR length(p_voter) > 64 THEN RETURN false; END IF;
  IF length(trim(coalesce(p_nick,''))) < 1 OR length(p_nick) > 24 THEN RETURN false; END IF;
  SELECT value INTO tv FROM app_state WHERE key = 'LIVE_TV';
  IF tv IS NULL OR jsonb_typeof(tv) <> 'object' OR tv->>'mid' IS DISTINCT FROM p_mid THEN RETURN false; END IF;
  a := (tv->>'p1')::bigint; b := (tv->>'p2')::bigint;
  IF p_pick IS DISTINCT FROM a AND p_pick IS DISTINCT FROM b THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM pred_matches WHERE mid = p_mid AND winner IS NOT NULL) THEN RETURN false; END IF;
  INSERT INTO pred_matches(mid,p1,p2) VALUES (p_mid,a,b) ON CONFLICT (mid) DO NOTHING;
  INSERT INTO pred_votes(mid,voter,nick,pick) VALUES (p_mid,p_voter,trim(p_nick),p_pick)
  ON CONFLICT (mid,voter) DO UPDATE SET pick = EXCLUDED.pick, nick = EXCLUDED.nick, created_at = now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.pred_counts(p_mid text)
RETURNS TABLE(pick bigint, n bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pick, count(*) FROM pred_votes WHERE mid = p_mid GROUP BY pick;
$$;

CREATE OR REPLACE FUNCTION public.pred_resolve(p_pin text, p_mid text, p_winner bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.app_admin_verify(p_pin) THEN RETURN false; END IF;
  UPDATE pred_matches SET winner = p_winner, resolved_at = now() WHERE mid = p_mid AND winner IS NULL;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.pred_leaderboard()
RETURNS TABLE(nick text, hits bigint, total bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(v.nick), count(*) FILTER (WHERE v.pick = m.winner), count(*)
  FROM pred_votes v JOIN pred_matches m ON m.mid = v.mid AND m.winner IS NOT NULL
  GROUP BY v.voter ORDER BY 2 DESC, 3 ASC LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.pred_vote(text,text,text,bigint), public.pred_counts(text), public.pred_resolve(text,text,bigint), public.pred_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pred_vote(text,text,text,bigint), public.pred_counts(text), public.pred_resolve(text,text,bigint), public.pred_leaderboard() TO anon, authenticated, service_role;