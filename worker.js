// worker.js — Proxy StrawPoll con fallbacks de endpoint y payload
// ⚠️ Llave fija (ya me la diste). Si luego quieres ocultarla, pásala como binding (env.STRAWPOLL_KEY).
const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-API-Key": STRAWPOLL_KEY,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

async function voteOne(pollId, optionId) {
  // Endpoints que funcionan según versión/plan de StrawPoll
  const endpoints = [
    { url: "https://api.strawpoll.com/v3/votes", inline: false },                    // v3 global
    { url: `https://api.strawpoll.com/v3/polls/${pollId}/vote`, inline: true },      // por poll
    { url: `https://api.strawpoll.com/v3/polls/${pollId}/votes`, inline: true },     // variante
  ];

  // Formatos de payload que he visto en producción:
  // A) votes = [{ optionId }]
  // B) votes = ["optionId"]
  const payloads = [
    (pid, oid, inline) =>
      inline ? { votes: [{ optionId: String(oid) }] }
             : { pollId: String(pid), votes: [{ optionId: String(oid) }] },
    (pid, oid, inline) =>
      inline ? { votes: [ String(oid) ] }
             : { pollId: String(pid), votes: [ String(oid) ] },
  ];

  const errors = [];
  for (const ep of endpoints) {
    for (const make of payloads) {
      const payload = make(pollId, optionId, ep.inline);
      const r = await postJSON(ep.url, payload);
      if (r.ok) {
        let parsed; try { parsed = JSON.parse(r.text); } catch { parsed = { raw: r.text }; }
        return { ok: true, endpoint: ep.url, payload, response: parsed };
      }
      errors.push({ endpoint: ep.url, status: r.status, body: r.text, sent: payload });
    }
  }
  return { ok: false, errors };
}

export default {
  async fetch(request /*, env */) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (request.method === "GET") {
      // Ping/health simple
      return new Response("OK /vote (POST JSON)", { headers: CORS });
    }

    if (request.method === "POST" && url.pathname === "/vote") {
      let body = {};
      try { body = await request.json(); } catch {}

      // Esperamos { votes: [{ poll_id, option_id }, ...] }
      if (!Array.isArray(body?.votes) || body.votes.length === 0) {
        return json(400, {
          ok: false,
          error: "Formato inválido. Usa { votes:[{poll_id, option_id}] }",
          recv: body
        });
      }

      const results = [];
      for (const v of body.votes) {
        if (!v?.poll_id || !v?.option_id) {
          return json(400, { ok:false, error:"Cada voto requiere poll_id y option_id", recv: v });
        }
        const out = await voteOne(v.poll_id, v.option_id);
        if (!out.ok) {
          // Devolvemos el rastro completo para depurar exactamente qué responde StrawPoll
          return json(502, { ok:false, error:"StrawPoll rechazó el voto en todos los intentos", trace: out.errors });
        }
        results.push(out);
      }
      return json(200, { ok:true, results });
    }

    // Ruta opcional /reset (NO borra votos en StrawPoll; solo para que tu botón no truene)
    if (request.method === "POST" && url.pathname === "/reset") {
      return json(200, { ok: true, note: "Reset lógico del frontend. StrawPoll no ofrece borrar votos por API." });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
