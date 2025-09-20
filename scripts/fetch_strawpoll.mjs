// scripts/fetch_strawpoll.mjs
import fs from "node:fs/promises";

const API_KEY = process.env.STRAWPOLL_API_KEY; // <-- ponlo en Secrets del repo
const POLL_ID_MUJER  = "7rnzVbMBanO";
const POLL_ID_HOMBRE = "e6Z2A3DXXgN";

if (!API_KEY) {
  console.error("Falta STRAWPOLL_API_KEY");
  process.exit(1);
}

async function getPoll(id) {
  const r = await fetch(`https://api.strawpoll.com/v3/polls/${id}`, {
    headers: { "X-API-Key": API_KEY }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} al leer poll ${id}`);
  return await r.json();
}

try {
  const [women, men] = await Promise.all([getPoll(POLL_ID_MUJER), getPoll(POLL_ID_HOMBRE)]);
  const payload = { women, men, fetched_at: new Date().toISOString() };
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/stats.json", JSON.stringify(payload, null, 2));
  console.log("Actualizado data/stats.json");
} catch (e) {
  console.error(e);
  process.exit(1);
}
