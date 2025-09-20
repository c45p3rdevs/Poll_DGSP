// worker.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Ping
    if (request.method === 'GET') {
      return new Response('Use POST /vote', {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (request.method === 'POST' && url.pathname === '/vote') {
      try {
        const payload = await request.json(); // { votes: [{poll_id, option_id}, ...], local_user, full_name }

        // Enviar cada voto a StrawPoll
        const results = [];
        for (const v of payload.votes || []) {
          const res = await fetch('https://api.strawpoll.com/v3/votes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': env.STRAWPOLL_KEY,   // <— secreto
            },
            body: JSON.stringify({
              poll_id: v.poll_id,
              // algunos setups usan "pollId" y "optionId"; en v3 es así:
              pollId: v.poll_id,
              votes: [{ optionId: v.option_id }]
            }),
          });
          const txt = await res.text();
          if (!res.ok) {
            throw new Error(`StrawPoll error (${res.status}): ${txt}`);
          }
          results.push(JSON.parse(txt));
        }

        return new Response(JSON.stringify({ ok: true, results }), {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
        });
      } catch (err) {
        return new Response(`Proxy error: ${err.message}`, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
};
