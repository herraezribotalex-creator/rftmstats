import { createFileRoute } from "@tanstack/react-router";

const SYSTEM =
  "Eres el comentarista oficial de la Liga RFTM de tenis de mesa/tenis entre amigos. " +
  "Hablas en español de España, con energía de narrador deportivo, humor sano y frases épicas. " +
  "Nunca inventes resultados que no estén en los datos. Sé breve cuando se pida.";

export const Route = createFileRoute("/api/narrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("IA no configurada", { status: 500 });
        let body: { kind?: string; data?: unknown };
        try {
          body = await request.json();
        } catch {
          return new Response("Petición no válida", { status: 400 });
        }
        const data = JSON.stringify(body.data ?? {}).slice(0, 6000);
        const task =
          body.kind === "live"
            ? "Narra en 2-3 frases cortas el momento actual de este partido en directo, como si estuvieras en la cabina de TV."
            : body.kind === "wrapped"
              ? "Escribe un párrafo épico (máx. 70 palabras) resumiendo la temporada de este jugador, para cerrar su 'Wrapped'."
              : "Escribe una crónica periodística (máx. 180 palabras) con titular en la primera línea, sobre estos datos de la liga.";
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          signal: request.signal,
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            stream: true,
            store: false,
            reasoning: { effort: "low" },
            instructions: SYSTEM,
            input: `${task}\n\nDatos:\n${data}`,
          }),
        }).catch(() => null);
        if (!upstream) return new Response(null, { status: 499 });
        if (!upstream.ok) {
          const msg =
            upstream.status === 402
              ? "Se han agotado los créditos de IA del espacio de trabajo."
              : upstream.status === 429
                ? "Demasiadas peticiones, prueba en un momento."
                : "El comentarista no está disponible ahora.";
          return new Response(msg, { status: upstream.status });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
        });
      },
    },
  },
});
