// scripts/fetch_strawpoll.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

// IDs por env o defaults (los tuyos)
const POLL_ID_MUJER  = process.env.POLL_ID_MUJER  || "7rnzVbMBanO";
const POLL_ID_HOMBRE = process.env.POLL_ID_HOMBRE || "e6Z2A3DXXgN";
const API_KEY = process.env.STRAWPOLL_KEY;

if (!API_KEY) {
  console.error('❌ Falta STRAWPOLL_KEY (repo → Settings → Secrets → Actions).');
  process.exit(1);
}

// ---- util: sleep
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---- fetch con reintentos (429/5xx)
async function getPollWithRetry(pollId, tries = 4) {
  const url = `https://api.strawpoll.com/v3/polls/${pollId}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'X-API-Key': API_KEY,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        const text = await res.text().catch(()=> '');
        // Reintenta si es 429 o 5xx
        if ((res.status === 429 || (res.status >= 500 && res.status <= 599)) && i < tries - 1) {
          const backoff = 800 * (i + 1);
          console.warn(`⚠️ ${pollId}: ${res.status}. Reintentando en ${backoff}ms… Detalle: ${text.slice(0,180)}`);
          await wait(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
      }
      return res.json();
    } catch (err) {
      if (i < tries - 1) {
        const backoff = 800 * (i + 1);
        console.warn(`⚠️ Error de red/parseo (${err?.message}). Reintentando en ${backoff}ms…`);
        await wait(backoff);
        continue;
      }
      throw err;
    }
  }
}

// ---- encontrar el arreglo de opciones en distintas formas
function pickOptions(obj) {
  // algunos devuelven con envolturas
  const c = obj?.data?.poll || obj?.poll || obj;

  // posibles nombres de arreglo
  const candidates =
    c?.options || c?.answers || c?.choices || c?.items || c?.data || [];

  // asegurar que sea array
  return Array.isArray(candidates) ? candidates : [];
}

function toInt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

// ---- map a { "NOMBRE": votos }
function toMap(pollJson) {
  const map = {};
  const opts = pickOptions(pollJson);
  for (const opt of opts) {
    // posibles keys de texto
    const title =
      opt?.title ?? opt?.text ?? opt?.name ?? opt?.label ?? opt?.value ?? '—';
    // posibles keys de conteo
    const votes =
      opt?.votes ?? opt?.voteCount ?? opt?.count ?? opt?.total ?? 0;
    map[String(title).trim()] = toInt(votes);
  }
  return map;
}

async function main() {
  console.log('⏳ Descargando encuestas:', { POLL_ID_MUJER, POLL_ID_HOMBRE });

  const [mujerJson, hombreJson] = await Promise.all([
    getPollWithRetry(POLL_ID_MUJER),
    getPollWithRetry(POLL_ID_HOMBRE)
  ]);

  const data = {
    updated_at: new Date().toISOString(),
    mujer:  toMap(mujerJson),
    hombre: toMap(hombreJson)
  };

  const out = path.join(process.cwd(), 'data', 'stats.json');
  await fs.mkdir(path.dirname(out), { recursive: true });   // 👈 asegura carpeta
  await fs.writeFile(out, JSON.stringify(data, null, 2), 'utf8');

  console.log('✅ stats.json actualizado:', out);
  // Log corto para debug
  console.log('👀 Resumen:', {
    total_mujer: Object.values(data.mujer).reduce((a,b)=>a+b,0),
    total_hombre: Object.values(data.hombre).reduce((a,b)=>a+b,0)
  });
}

main().catch(err => {
  console.error('❌ Falló fetch_strawpoll:', err?.stack || err?.message || err);
  process.exit(1);
});
