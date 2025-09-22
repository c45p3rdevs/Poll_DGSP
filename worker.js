// worker.js — Proxy StrawPoll con retry de forma de payload
const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const j = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

async function postToStrawPoll(payload) {
  const res = await fetch("https://api.strawpoll.com/v3/votes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": STRAWPOLL_KEY,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS });

    // Ping
    if (request.method === "GET")
      return new Response("OK /vote (use POST)", { headers: CORS });

    if (request.method === "POST" && url.pathname === "/vote") {
      const debug = url.searchParams.get("debug") === "1";
      let bodyIn = {};
      try { bodyIn = await request.json(); } catch {}

      // Normaliza entrada
      let votesIn = [];
      if (Array.isArray(bodyIn?.votes)) {
        votesIn = bodyIn.votes;
      } else if (bodyIn?.poll_id && bodyIn?.option_id) {
        votesIn = [{ poll_id: String(bodyIn.poll_id), option_id: String(bodyIn.option_id) }];
      } else {
        return j(400, { ok:false, error:"Formato inválido. Usa {poll_id, option_id} o {votes:[{poll_id, option_id}]}",
                        recv: debug ? bodyIn : undefined });
      }

      // Valida
      for (const v of votesIn) {
        if (!v?.poll_id || !v?.option_id) {
          return j(400, { ok:false, error:"Cada voto requiere poll_id y option_id",
                          recv: debug ? v : undefined });
        }
      }

      // Envía cada voto con 2 estrategias de payload
      const results = [];
      for (const v of votesIn) {
        // Estrategia A: array de objetos { optionId }
        const payloadA = { pollId: String(v.poll_id), votes: [ { optionId: String(v.option_id) } ] };
        let r = await postToStrawPoll(payloadA);

        // Si falla, probamos Estrategia B: array de strings
        let sent = payloadA, attempt = "A";
        if (!r.ok) {
          const payloadB = { pollId: String(v.poll_id), votes: [ String(v.option_id) ] };
          const r2 = await postToStrawPoll(payloadB);
          if (r2.ok) {
            r = r2;
            sent = payloadB;
            attempt = "B";
          } else {
            // Error definitivo
            return j(r2.status, {
              ok: false,
              error: "StrawPoll rechazó el voto",
              status: r2.status,
              upstream_body: r2.text,
              ...(debug ? { sent_attemptA: payloadA, sent_attemptB: payloadB } : null),
            });
          }
        }

        // OK
        let parsed; try { parsed = JSON.parse(r.text); } catch { parsed = { raw: r.text }; }
        results.push({ ok:true, attempt, response: parsed, ...(debug ? { sent } : null) });
      }

      return j(200, { ok:true, results });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
