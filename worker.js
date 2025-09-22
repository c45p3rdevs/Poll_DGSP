// worker.js — FIX "votes is not iterable"
const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Ping básico
    if (request.method === "GET") {
      return new Response("OK /vote", { headers: CORS });
    }

    // ---- Registrar voto(s)
    if (request.method === "POST" && url.pathname === "/vote") {
      try {
        const payload = await request.json().catch(() => ({}));
        // Soportar 2 formas:
        //  A) { poll_id, option_id }
        //  B) { votes: [ {poll_id, option_id}, ... ] }
        let votes = [];
        if (Array.isArray(payload?.votes)) {
          votes = payload.votes;
        } else if (payload?.poll_id && payload?.option_id) {
          votes = [{ poll_id: payload.poll_id, option_id: payload.option_id }];
        } else {
          return new Response("Formato inválido. Usa {poll_id, option_id} o {votes:[...]}", {
            status: 400,
            headers: CORS,
          });
        }

        const results = [];
        for (const v of votes) {
          if (!v?.poll_id || !v?.option_id) {
            return new Response("Cada voto requiere poll_id y option_id", { status: 400, headers: CORS });
          }

          // *** Este es el formato correcto para StrawPoll v3 ***
          const body = JSON.stringify({
            pollId: v.poll_id,
            votes: [{ optionId: v.option_id }],
          });

          const res = await fetch("https://api.strawpoll.com/v3/votes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": STRAWPOLL_KEY,
            },
            body,
          });

          const txt = await res.text();
          if (!res.ok) {
            // Propaga mensaje de StrawPoll para que lo veas en el alert
            return new Response(`StrawPoll ${res.status}: ${txt}`, { status: 502, headers: CORS });
          }

          let parsed;
          try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
          results.push(parsed);
        }

        return new Response(JSON.stringify({ ok: true, results }), {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(`Proxy error: ${err?.message || String(err)}`, { status: 500, headers: CORS });
      }
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
