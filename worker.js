export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    try {
      const { votes } = await request.json();
      if (!Array.isArray(votes) || votes.length !== 2) {
        return Response.json({ error: 'Se esperan 2 votos (mujer y hombre).' }, { status: 400 });
      }

      const key = env.STRAW_API_KEY;
      if (!key) return Response.json({ error: 'Falta STRAW_API_KEY' }, { status: 500 });

      const results = [];
      for (const v of votes) {
        const r = await fetch('https://api.strawpoll.com/v3/votes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
          body: JSON.stringify({ poll_id: v.poll_id, poll_option_id: v.option_id })
        });
        const data = await r.json().catch(()=> ({}));
        if (!r.ok) return Response.json({ error:'StrawPoll error', details:data }, { status: r.status });
        results.push(data);
      }
      return Response.json({ ok:true, results });
    } catch (e) {
      return Response.json({ error: e.message || 'Server error' }, { status: 500 });
    }
  }
};
