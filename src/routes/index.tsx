import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import legacyCss from "@/legacy/styles.css?raw";
import legacyHtml from "@/legacy/markup.html?raw";
import legacyJs from "@/legacy/app.js?raw";
import { bootLegacyApp, loadState } from "@/legacy/boot";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Liga H2H RFTM — Estadísticas, torneos y rankings" },
      {
        name: "description",
        content:
          "Estadísticas en vivo de la Liga RFTM: rankings, head to head, torneos, campeones, cartas y anotadores globales.",
      },
      { property: "og:title", content: "Liga H2H RFTM — Estadísticas y torneos" },
      {
        property: "og:description",
        content:
          "Rankings, head to head, torneos y anotadores de la Liga RFTM, actualizados en directo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LigaApp,
});

function LigaApp() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        await loadState();
        if (cancelled || !hostRef.current) return;
        bootLegacyApp(hostRef.current, legacyCss, legacyHtml, legacyJs);
        setStatus("ready");
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    }
    void start();

    return () => {
      cancelled = true;
    };
  }, []);

  // Actualización en directo: cuando el admin guarda, todos los que tienen
  // el enlace abierto reciben el cambio y la vista se recarga.
  useEffect(() => {
    const channel = supabase
      .channel("rftm-app-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_state" },
        () => {
          const mine = Date.now() - (window.__rftmLastSave ?? 0) < 4000;
          if (mine) return;
          window.clearTimeout(reloadTimer.current);
          reloadTimer.current = window.setTimeout(() => window.location.reload(), 1200);
        },
      )
      .subscribe();

    return () => {
      window.clearTimeout(reloadTimer.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  const reloadTimer = useRef<number | undefined>(undefined);

  return (
    <>
      {status !== "ready" && (
        <div className="rftm-boot">
          <div className="rftm-boot-spin" />
          <div>
            {status === "error"
              ? "Sin conexión con la base de datos"
              : "Cargando base de datos…"}
          </div>
          {status === "error" && (
            <button className="rftm-boot-btn" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          )}
        </div>
      )}
      <div ref={hostRef} id="rftm-root" />
    </>
  );
}
