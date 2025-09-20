// scripts/fetch_strawpoll.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const POLL_ID_MUJER  = process.env.POLL_ID_MUJER  || "7rnzVbMBanO";
const POLL_ID_HOMBRE = process.env.POLL_ID_HOMBRE || "e6Z2A3DXXgN";
const API_KEY = process.env.STRAWPOLL_KEY;

if (!API_KEY) {
  console.error('Falta STRAWPOLL_KEY (GitHub secret).');
  process.exit(1);
}

async function getPoll(pollId) {
  const res = await fetch(`https://api.strawpoll.com/v3/polls/${pollId}`, {
    headers: { 'X-API-Key': API_KEY }
  });
  if (!res.ok) throw new Error(`StrawPoll ${res.status}`);
  return res.json();
}

function toMap(poll) {
  const map = {};
  for (const opt of poll.answers || poll.options || []) {
    // compat: algunos devuelven .title y .votes
    const title = opt.title || opt.text || opt.name;
    const votes = opt.votes ?? opt.voteCount ?? 0;
    map[title] = votes;
  }
  return map;
}

const mujer  = await getPoll(POLL_ID_MUJER);
const hombre = await getPoll(POLL_ID_HOMBRE);

const data = {
  updated_at: new Date().toISOString(),
  mujer:  toMap(mujer),
  hombre: toMap(hombre),
};

const out = path.join(process.cwd(), 'data', 'stats.json');
await fs.writeFile(out, JSON.stringify(data, null, 2), 'utf8');
console.log('stats.json actualizado:', out);
