// api/vote.js — Serverless function para Vercel
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  try {
    const { votes } = req.body || {};
    if (!Array.isArray(votes) || votes.length !== 2) {
      return res.status(400).json({ error: 'Se esperan 2 votos (mujer y hombre).' });
    }

    const API_KEY = process.env.STRAW_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Falta STRAW_API_KEY' });

    // Enviamos cada voto a StrawPoll.
    // Doc v3: usa header X-API-Key. (Endpoints según docs)
    // NOTA: Según tu configuración, puede ser:
    //   POST https://api.strawpoll.com/v3/votes  con body {poll_id, option_id}
    // o    POST https://api.strawpoll.com/v3/polls/{poll_id}/votes con body {option_id}
    // Aquí usamos la forma genérica /v3/votes:
    const results = [];
    for (const v of votes) {
      const r = await fetch('https://api.strawpoll.com/v3/votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({ poll_id: v.poll_id, poll_option_id: v.option_id })
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok) {
        return res.status(r.status).json({ error: 'StrawPoll error', details: data });
      }
      results.push(data);
    }

    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}