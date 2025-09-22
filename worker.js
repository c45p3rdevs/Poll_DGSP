// worker.js — V3 (fix: votes debe ser array de strings)
const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function j(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method === "GET") return new Response("OK /vote (use POST)", { headers: CORS });

    if (request.method === "POST" && url.pathname === "/vote") {
      const debug = url.searchParams.get("debug") === "1";
      let bodyIn = {};
      try { bodyIn = await request.json(); } catch {}

      // Soporta: { poll_id, option_id } o { votes:[{poll_id, option_id}, ...] }
      let votesIn = [];
      if (Array.isArray(bodyIn?.votes)) votesIn = bodyIn.votes;
      else if (bodyIn?.poll_id && bodyIn?.option_id) votesIn = [{ poll_id: bodyIn.poll_id, option_id: bodyIn.option_id }];
      else return j(400, { ok:false, error:"Formato inválido", recv: bodyIn });

      const results = [];
      for (const v of votesIn) {
        if (!v?.poll_id || !v?.option_id) return j(400, { ok:false, error:"Cada voto requiere poll_id y option_id", recv: v });

        // ✅ StrawPoll espera votes: ["optionId"] (array de strings), NO objetos
        const upstreamReq = { pollId: v.poll_id, votes: [ v.option_id ] };

        let res, txt;
        try {
          res = await fetch("https://api.strawpoll.com/v3/votes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "X-API-Key": STRAWPOLL_KEY,
            },
            body: JSON.stringify(upstreamReq),
          });
          txt = await res.text();
        } catch (e) {
          return j(502, { ok:false, error:"No se pudo contactar StrawPoll", detail:String(e) });
        }

        if (!res.ok) {
          return j(res.status, { ok:false, error:"StrawPoll error", status:res.status, upstream_body:txt, ...(debug?{sent:upstreamReq}:null) });
        }

        let parsed; try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
        results.push(parsed);
      }
      return j(200, { ok:true, results });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
