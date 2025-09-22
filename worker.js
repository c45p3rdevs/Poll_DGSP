// worker.js
const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";
const STRAWPOLL_URL = "https://api.strawpoll.com/v3/votes";

function cors(h = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...h,
  };
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    // Ping
    if (request.method === "GET") {
      return new Response("Use POST /vote", { headers: cors() });
    }

    // --- Registro de votos ---
    if (request.method === "POST" && pathname === "/vote") {
      try {
        const payload = await request.json().catch(() => ({}));

        // Normaliza: permitir {votes:[{poll_id,option_id},...]} o {poll_id,option_id}
        let votes = [];
        if (Array.isArray(payload?.votes)) {
          votes = payload.votes;
        } else if (payload?.poll_id && payload?.option_id) {
          votes = [{ poll_id: payload.poll_id, option_id: payload.option_id }];
        } else {
          return new Response(
            'Formato inválido. Envía { "votes":[{ "poll_id":"...", "option_id":"..." }] } o un solo { "poll_id","option_id" }.',
            { status: 400, headers: cors() }
          );
        }

        // Valida
        for (const v of votes) {
          if (!v?.poll_id || !v?.option_id) {
            return new Response(
              "Cada voto debe tener poll_id y option_id.",
              { status: 400, headers: cors() }
            );
          }
        }

        // Dispara uno por uno al API de StrawPoll
        const results = [];
        for (const v of votes) {
          const body = JSON.stringify({
            pollId: v.poll_id,
            votes: [v.option_id],
          });

          const r = await fetch(STRAWPOLL_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": STRAWPOLL_KEY,
            },
            body,
          });

          const txt = await r.text();
          if (!r.ok) {
            // Regresa el texto real del error para que lo veas en el alert
            return new Response(`StrawPoll ${r.status}: ${txt}`, {
              status: 502,
              headers: cors(),
            });
          }
          results.push(txt ? JSON.parse(txt) : { ok: true });
        }

        return new Response(JSON.stringify({ ok: true, results }), {
          headers: cors({ "Content-Type": "application/json" }),
        });
      } catch (e) {
        return new Response("Proxy error: " + (e?.message || String(e)), {
          status: 500,
          headers: cors(),
        });
      }
    }

    return new Response("Not found", { status: 404, headers: cors() });
  },
};
