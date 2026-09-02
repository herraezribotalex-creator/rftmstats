/* Arranque de la app clásica RFTM sobre Lovable Cloud.
   Carga app_state, calcula los puntos derivados, inyecta el HTML/CSS
   originales y ejecuta el script de la app. */

const SB_URL = import.meta.env['VITE_SUPABASE_URL'] as string;
const SB_KEY = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;

type AnyRec = Record<string, unknown>;

declare global {
  interface Window {
    __SB: { url: string; key: string };
    __DB: AnyRec;
    __seed: (k: string, fb: unknown) => unknown;
    __rpc: (fn: string, body?: unknown) => Promise<unknown>;
    __reload: () => Promise<void>;
    __autoPoints: () => Record<string, number>;
    __rftmBooted?: boolean;
    __rftmLastSave?: number;
  }
}

export async function loadState(): Promise<void> {
  const res = await fetch(`${SB_URL}/rest/v1/app_state?select=key,value`, {
    headers: { apikey: SB_KEY },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ key: string; value: unknown }>;
  const db: AnyRec = {};
  rows.forEach((r) => {
    db[r.key] = r.value;
  });
  window.__DB = db;
}

function installGlobals() {
  window.__SB = { url: SB_URL, key: SB_KEY };
  window.__DB = window.__DB || {};
  window.__seed = (k, fb) =>
    Object.prototype.hasOwnProperty.call(window.__DB, k) ? window.__DB[k] : fb;
  window.__rpc = (fn, body) =>
    fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(async (r) => {
      const t = await r.text();
      let j: unknown = null;
      try {
        j = t ? JSON.parse(t) : null;
      } catch {
        j = t;
      }
      if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
      window.__rftmLastSave = Date.now();
      return j;
    });
  window.__reload = loadState;
  window.__autoPoints = function () {
    const res = (window.__DB['COMP_RESULTS'] || []) as Array<AnyRec>;
    const table = (window.__DB['POINTS_TABLE'] || {}) as Record<string, Record<string, number>>;
    const out: Record<string, number> = {};
    const add = (pid: unknown, n: number) => {
      if (!pid || !n) return;
      out[String(pid)] = (out[String(pid)] || 0) + n;
    };
    res.forEach((r) => {
      const t = String(r['type']);
      add(r['champion'], (table['Campeon'] || {})[t] || 0);
      add(r['runnerUp'], (table['Finalista'] || {})[t] || 0);
      ((r['sf'] as unknown[]) || []).forEach((p) => add(p, (table['SF'] || {})[t] || 0));
      ((r['extra'] as Array<{ pid: unknown; points?: number }>) || []).forEach((x) =>
        add(x.pid, x.points || 0),
      );
    });
    return out;
  };
}

function applyDerived() {
  (['SEASON_POINTS', 'SEASON_ONLY_POINTS'] as const).forEach((key) => {
    const base = window.__DB[key] as Record<string, number> | undefined;
    if (!base) return;
    const auto = window.__autoPoints();
    const eff: Record<string, number> = { ...base };
    Object.keys(auto).forEach((k) => {
      eff[k] = (eff[k] || 0) + auto[k]!;
    });
    window.__DB[`${key}_BASE`] = base;
    window.__DB[key] = eff;
  });
}

export function bootLegacyApp(host: HTMLElement, css: string, html: string, js: string) {
  if (window.__rftmBooted) return;
  window.__rftmBooted = true;

  installGlobals();
  applyDerived();

  const style = document.createElement('style');
  style.id = 'rftm-legacy-css';
  style.textContent = css;
  document.head.appendChild(style);

  host.innerHTML = html;

  const script = document.createElement('script');
  script.textContent = js;
  document.body.appendChild(script);

  document.dispatchEvent(new Event('app:ready'));
}

export { installGlobals };
