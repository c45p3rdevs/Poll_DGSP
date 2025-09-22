// worker.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- CORS ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // --- Ping sencillo ---
    if (request.method === "GET") {
      return new Response('OK — use POST /vote or /reset', {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // --- Reset lógico (sólo para que el admin tenga algo que pegarle) ---
    if (request.method === "POST" && url.pathname === "/reset") {
      return new Response(JSON.stringify({ ok: true, resetAt: new Date().toISOString() }), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      });
    }

    // --- Votar ---
    if (request.method === "POST" && url.pathname === "/vote") {
      try {
        const payload = await request.json();
        // Frontend manda: { votes: [{poll_id, option_id}, ...] }
        // o bien { poll_id, option_id } (1 solo)
        let items = [];

        if (Array.isArray(payload?.votes)) {
          // normaliza: [{poll_id, option_id}] -> [[pollId, optionId], ...]
          items = payload.votes
            .map(v => [v?.poll_id || v?.pollId, v?.option_id || v?.optionId])
            .filter(([p, o]) => p && o);
        } else if (payload?.poll_id && payload?.option_id) {
          items = [[payload.poll_id, payload.option_id]];
        }

        if (!items.length) {
          return new Response("Bad request: missing votes", {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }

        const API_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338"; // <-- tu key

        async function sendVote(pollId, optionId) {
          // Lo que espera StrawPoll v3:
          //  { pollId: "xxx", votes: ["optionId"] }
          const body = JSON.stringify({ pollId, votes: [optionId] });

          const r = await fetch("https://api.strawpoll.com/v3/votes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": API_KEY,
            },
            body,
          });

          const txt = await r.text();
          if (!r.ok) {
            throw new Error(`StrawPoll ${r.status}: ${txt || "error"}`);
          }
          try { return JSON.parse(txt); } catch { return { ok: true, raw: txt }; }
        }

        const results = [];
        for (const [pollId, optionId] of items) {
          results.push(await sendVote(pollId, optionId));
        }

        return new Response(JSON.stringify({ ok: true, results }), {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        return new Response(`Proxy error: ${err?.message || String(err)}`, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    return new Response("Not found", {
      status: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  },
};
