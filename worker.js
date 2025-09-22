// worker.js — V2 con depuración y propagación de errores
const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === "GET") {
      return new Response("OK /vote (use POST)", { headers: CORS });
    }

    if (request.method === "POST" && url.pathname === "/vote") {
      const debug = url.searchParams.get("debug") === "1";
      try {
        const bodyIn = await request.json().catch(() => ({}));

        // Soportar:
        //  A) { poll_id, option_id }
        //  B) { votes: [ {poll_id, option_id}, ... ] }
        let votes = [];
        if (Array.isArray(bodyIn?.votes)) {
          votes = bodyIn.votes;
        } else if (bodyIn?.poll_id && bodyIn?.option_id) {
          votes = [{ poll_id: bodyIn.poll_id, option_id: bodyIn.option_id }];
        } else {
          return json(400, { ok: false, error: "Formato inválido. Usa {poll_id, option_id} o {votes:[...]}", recv: bodyIn });
        }

        const results = [];
        for (const v of votes) {
          if (!v?.poll_id || !v?.option_id) {
            return json(400, { ok: false, error: "Cada voto requiere poll_id y option_id", recv: v });
          }

          const upstreamReq = {
            pollId: v.poll_id,
            votes: [{ optionId: v.option_id }], // <-- formato correcto
          };

          let res, txt;
          try {
            res = await fetch("https://api.strawpoll.com/v3/votes", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": STRAWPOLL_KEY,
              },
              body: JSON.stringify(upstreamReq),
            });
            txt = await res.text();
          } catch (e) {
            return json(502, { ok: false, error: "No se pudo contactar StrawPoll", detail: String(e) });
          }

          // Si StrawPoll falla, devolver su respuesta textual
          if (!res.ok) {
            return json(res.status, {
              ok: false,
              error: "StrawPoll error",
              status: res.status,
              upstream_body: txt,
              ...(debug ? { sent: upstreamReq } : null),
            });
          }

          let parsed; try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
          results.push(parsed);
        }

        return json(200, { ok: true, results });
      } catch (err) {
        return json(500, { ok: false, error: "Proxy error", detail: String(err) });
      }
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
