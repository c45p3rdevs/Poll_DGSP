// worker.js (plug & play)
// - POST /vote   -> envía votos a StrawPoll
// - POST /reset  -> reset lógico (no borra en StrawPoll, sólo responde ok para que tu admin reinicie vistas)
// - GET  /       -> ping
// CORS abierto.

const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // --- Ping ---
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, msg: "Use POST /vote or POST /reset" });
    }

    // --- POST /vote ---
    if (request.method === "POST" && url.pathname === "/vote") {
      try {
        const payload = await safeJson(request);

        // Acepta:
        // 1) { poll_id, option_id }
        // 2) { votes: [{ poll_id, option_id }, ...] }
        let votes = [];
        if (payload && payload.poll_id && payload.option_id) {
          votes = [{ poll_id: payload.poll_id, option_id: payload.option_id }];
        } else if (Array.isArray(payload?.votes)) {
          votes = payload.votes;
        }

        if (!votes.length) {
          return text(
            "Bad Request: expected {poll_id, option_id} or {votes:[...]}.",
            400
          );
        }

        if (!STRAWPOLL_KEY) {
          return text("Server misconfigured: STRAWPOLL_KEY missing.", 500);
        }

        const results = [];
        for (const v of votes) {
          if (!v?.poll_id || !v?.option_id) {
            return text(
              "Bad Request: each vote needs poll_id and option_id.",
              400
            );
          }

          // StrawPoll v3: /v3/votes body: { pollId, votes:[{ optionId }] }
          const spRes = await fetch("https://api.strawpoll.com/v3/votes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": STRAWPOLL_KEY,
            },
            body: JSON.stringify({
              pollId: v.poll_id,
              votes: [{ optionId: v.option_id }],
            }),
          });

          const spTxt = await spRes.text();
          if (!spRes.ok) {
            return text(`StrawPoll error (${spRes.status}): ${spTxt}`, spRes.status);
          }

          let parsed;
          try { parsed = JSON.parse(spTxt); } catch { parsed = { raw: spTxt }; }
          results.push(parsed);
        }

        return json({ ok: true, results });
      } catch (err) {
        return text(`Proxy error: ${err?.message || String(err)}`, 500);
      }
    }

    // --- POST /reset ---
    if (request.method === "POST" && url.pathname === "/reset") {
      // Reset lógico (no borra en StrawPoll). Úsalo para que el admin ponga en 0 las vistas locales.
      const nowIso = new Date().toISOString();
      return json({ ok: true, resetAt: nowIso, mode: "stateless" });
    }

    return text("Not found", 404);
  },
};

// ---------- helpers ----------
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
function withCors(h = {}) { return { ...corsHeaders(), ...h }; }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: withCors({ "Content-Type": "application/json" }),
  });
}
function text(t, status = 200) {
  return new Response(t, {
    status,
    headers: withCors({ "Content-Type": "text/plain; charset=utf-8" }),
  });
}
async function safeJson(request) {
  try { return await request.json(); } catch { return null; }
}
