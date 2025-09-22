// worker-admin.js
const STRAWPOLL_KEY = "ca45fca0-95d4-11f0-be87-9b2473717338";
const STRAWPOLL_URL = "https://api.strawpoll.com/v3/votes";
const ADMIN_SECRET   = "ADMIN_SECRET_123"; // cambia esto
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,x-admin-secret",
};

// Simple in-memory (no persist). If quieres persistencia, usa KV and mapear aquí.
let modeState = { open: true, message: "Votación abierta." };
let localStats = { mujer: {}, hombre: {}, updated_at: null };

function normalizeResp(body, status=200){
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type":"application/json" }});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status:204, headers: CORS_HEADERS });

    // GET /mode -> devuelve estado
    if (request.method === "GET" && path === "/mode") {
      return normalizeResp(modeState);
    }

    // POST /vote -> registra voto (proxy a StrawPoll) y actualiza localStats si es posible
    if (request.method === "POST" && path === "/vote") {
      try{
        const payload = await request.json().catch(()=>({}));
        let votes = [];
        if (Array.isArray(payload?.votes)) votes = payload.votes;
        else if (payload?.poll_id && payload?.option_id) votes = [{ poll_id: payload.poll_id, option_id: payload.option_id }];
        else return new Response('Formato inválido', { status:400, headers:CORS_HEADERS });

        if (!modeState.open) return new Response('Votación cerrada', { status:403, headers:CORS_HEADERS });

        const results = [];
        for (const v of votes){
          if(!v?.poll_id || !v?.option_id) return new Response('Cada voto debe tener poll_id y option_id', { status:400, headers:CORS_HEADERS });

          // Post a StrawPoll
          const body = JSON.stringify({ pollId: v.poll_id, votes: [v.option_id] });
          const r = await fetch(STRAWPOLL_URL, {
            method:'POST',
            headers:{ 'Content-Type':'application/json', 'X-API-Key': STRAWPOLL_KEY },
            body
          });
          const txt = await r.text();
          if(!r.ok) return new Response(`StrawPoll ${r.status}: ${txt}`, { status:502, headers:CORS_HEADERS });
          let parsed; try{ parsed = JSON.parse(txt); }catch{ parsed = { raw: txt }; }
          results.push(parsed);

          // --- opcional: actualiza contador localStats (NO reemplaza StrawPoll)
          try{
            // intenta deducir nombre desde option_id -> no se puede con seguridad aquí
            // en vez de eso, solo incrementa una tecla por poll_id+option_id
            const key = `${v.poll_id}::${v.option_id}`;
            // map poll -> gender (asumiendo POLL_ID constants en frontend)
            const gender = (v.poll_id === "7rnzVbMBanO") ? 'mujer' : (v.poll_id === "e6Z2A3DXXgN" ? 'hombre' : null);
            if(gender){
              localStats[gender][key] = (localStats[gender][key] || 0) + 1;
              localStats.updated_at = new Date().toISOString();
            }
          }catch(e){}
        }

        return new Response(JSON.stringify({ ok:true, results }), { status:200, headers: { ...CORS_HEADERS, "Content-Type":"application/json" }});
      }catch(e){
        return new Response('Proxy error: '+(e.message||String(e)), { status:500, headers:CORS_HEADERS });
      }
    }

    // ADMIN endpoints: requieren header x-admin-secret
    if (path.startsWith('/admin')) {
      const secret = request.headers.get('x-admin-secret') || '';
      if (secret !== ADMIN_SECRET) {
        return new Response('Forbidden (admin secret)', { status:403, headers:CORS_HEADERS });
      }

      // POST /admin/close -> toggle open/closed
      if (request.method === 'POST' && path === '/admin/close') {
        modeState.open = !modeState.open;
        modeState.message = modeState.open ? 'Votación abierta.' : 'Votación cerrada por admin.';
        return normalizeResp({ ok:true, mode: modeState });
      }

      // POST /admin/reset -> reinicia contadores locales (NO borra votos en StrawPoll)
      if (request.method === 'POST' && path === '/admin/reset') {
        localStats = { mujer:{}, hombre:{}, updated_at: new Date().toISOString() };
        return normalizeResp({ ok:true, message:'Contadores reiniciados (local).' });
      }

      // GET /admin/stats -> devuelve localStats (útil para debugging)
      if (request.method === 'GET' && path === '/admin/stats') {
        return normalizeResp(localStats);
      }

      return new Response('Admin: ruta no encontrada', { status:404, headers:CORS_HEADERS });
    }

    return new Response('Not found', { status:404, headers:CORS_HEADERS });
  }
};
