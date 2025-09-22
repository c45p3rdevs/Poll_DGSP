// worker.js — Proxy StrawPoll con retry de forma de payload (simple)
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

async function callStrawPoll(payload) {
  const res = await fetch("https://api.strawpoll.com/v3/votes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": STRAWPOLL_KEY },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method === "GET")     return new Response("OK /vote (use POST)", { headers: CORS });

    if (request.method === "POST" && url.pathname === "/vote") {
      let body = {};
      try { body = await request.json(); } catch {}

      if (!Array.isArray(body?.votes) || body.votes.length === 0) {
        return j(400, { ok:false, error:"Formato inválido. Usa { votes:[{poll_id, option_id}] }", recv: body });
      }

      const results = [];
      for (const v of body.votes) {
        if (!v?.poll_id || !v?.option_id)
          return j(400, { ok:false, error:"Cada voto requiere poll_id y option_id", recv: v });

        // Intento A: array de objetos { optionId }
        const a = { pollId: String(v.poll_id), votes: [ { optionId: String(v.option_id) } ] };
        let r = await callStrawPoll(a);
        if (!r.ok) {
          // Intento B: array de strings
          const b = { pollId: String(v.poll_id), votes: [ String(v.option_id) ] };
          const r2 = await callStrawPoll(b);
          if (!r2.ok) {
            return j(r2.status, {
              ok:false, error:"StrawPoll rechazó el voto", status:r2.status, upstream_body:r2.text,
              sentA:a, sentB:b
            });
          }
          results.push({ ok:true, attempt:"B", response: (()=>{ try{return JSON.parse(r2.text)}catch{return{raw:r2.text}} })() });
        } else {
          results.push({ ok:true, attempt:"A", response: (()=>{ try{return JSON.parse(r.text)}catch{return{raw:r.text}} })() });
        }
      }
      return j(200, { ok:true, results });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
