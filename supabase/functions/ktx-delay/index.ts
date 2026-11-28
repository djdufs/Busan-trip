// 부산 1박 2일 길라잡이 — KTX 실시간 지연 프록시 Edge Function
// 브라우저(GitHub Pages)에서는 kr.junatiedot.fi/vivo.json 이 CORS로 막히므로 이 함수가 대신 받아온다.
// 배포: Management API /v1/projects/{ref}/functions/deploy?slug=ktx-delay (verify_jwt: false)
//
// GET  /functions/v1/ktx-delay            → 기본 추적 열차 15, 46
// GET  /functions/v1/ktx-delay?trains=15,46,11
// POST /functions/v1/ktx-delay  { "trains": [15, 46] }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

const FEED_URL = 'https://kr.junatiedot.fi/vivo.json';
const DEFAULT_TRAINS = ['15', '46'];
const MAX_TRAINS = 24;

type TrainState = { delayMin: number; station: string; date: string } | null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      // 지연 정보는 1분 단위로 갱신 — 브라우저·CDN 캐시 금지
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate'
    }
  });
}

function normCodes(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  const out: string[] = [];
  for (const raw of list) {
    const c = String(raw ?? '').trim();
    if (!/^\d{1,4}$/.test(c)) continue;
    if (!out.includes(c)) out.push(c);
    if (out.length >= MAX_TRAINS) break;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'method not allowed', trains: {} }, 405);
  }

  let codes: string[] = [];
  try {
    const url = new URL(req.url);
    codes = normCodes(url.searchParams.get('trains') || '');
  } catch { /* ignore */ }

  if (!codes.length && req.method === 'POST') {
    try {
      const body = await req.json();
      codes = normCodes(body?.trains ?? body?.codes ?? '');
    } catch { /* ignore */ }
  }
  if (!codes.length) codes = DEFAULT_TRAINS.slice();

  const fetchedAt = new Date().toISOString();

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(FEED_URL, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { 'accept': 'application/json', 'user-agent': 'busan-trip-ktx-delay/1.0' }
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error('feed HTTP ' + res.status);
    const data = await res.json();
    const rows = (data && typeof data === 'object' && data.r) ? data.r : {};

    const trains: Record<string, TrainState> = {};
    codes.forEach((c) => {
      const v = rows[c];
      if (Array.isArray(v) && v.length >= 3) {
        const d = Number(v[0]);
        trains[c] = {
          delayMin: Number.isFinite(d) ? Math.max(-30, Math.min(600, Math.round(d))) : 0,
          station: String(v[1] ?? ''),
          date: String(v[2] ?? '')
        };
      } else {
        trains[c] = null;
      }
    });

    return json({
      ok: true,
      fecha: data?.fecha ?? null,
      fuente_ts: data?.fuente_ts ?? null,
      feedTime: data?.t ?? null,
      fetchedAt,
      trains
    }, 200);
  } catch (e) {
    return json({
      ok: false,
      error: (e && (e as Error).message) ? String((e as Error).message) : 'feed fetch failed',
      fetchedAt,
      trains: {}
    }, 502);
  }
});
