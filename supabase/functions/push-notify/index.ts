// Supabase Edge Function: push-notify
// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) 발송기.
// 외부 라이브러리 없이 Deno 표준 WebCrypto 만 사용한다.
//
// 요청(body JSON)
//   { action: "test", endpoint }
//   { action: "broadcast", title, body, url, exclude_endpoint, exclude_author }
//
// 필요한 Secrets: VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 런타임이 자동 주입)

const enc = new TextEncoder();

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://rxsxbmbpetdwbcehsnts.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@example.com';

const TABLE = 'push_subscriptions';
const TTL = 86400;
const MAX_LEN = { title: 80, body: 220, url: 300, author: 24 };

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* ---------------- base64url ---------------- */

function b64urlDecode(s: string): Uint8Array {
  let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytes(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  parts.forEach((p) => (n += p.length));
  const out = new Uint8Array(n);
  let o = 0;
  parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

/* ---------------- HKDF (RFC 5869) ---------------- */

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    base,
    len * 8,
  );
  return new Uint8Array(bits);
}

/* ---------------- VAPID (RFC 8292) ---------------- */

let vapidKeyCache: CryptoKey | null = null;

async function vapidSigningKey(): Promise<CryptoKey> {
  if (vapidKeyCache) return vapidKeyCache;
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) throw new Error('VAPID secrets are not configured');
  const pub = b64urlDecode(VAPID_PUBLIC_KEY); // 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('VAPID_PUBLIC_KEY is not an uncompressed P-256 point');
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      d: VAPID_PRIVATE_KEY,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  vapidKeyCache = key;
  return key;
}

async function vapidHeaders(endpoint: string): Promise<Record<string, string>> {
  const u = new URL(endpoint);
  const aud = u.origin;
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  })));
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await vapidSigningKey(),
    enc.encode(signingInput),
  );
  const raw = new Uint8Array(sig);
  // WebCrypto(ES256) 는 r||s 64바이트를 돌려준다. DER 로 오는 런타임은 변환한다.
  const jwtSig = raw.length === 64 ? raw : derToRaw(raw);
  const jwt = `${signingInput}.${b64urlEncode(jwtSig)}`;
  return {
    'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    'TTL': String(TTL),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
  };
}

function derToRaw(der: Uint8Array): Uint8Array {
  // SEQUENCE { INTEGER r, INTEGER s } → r(32)||s(32)
  let i = 0;
  if (der[i++] !== 0x30) throw new Error('bad DER signature');
  let seqLen = der[i++];
  if (seqLen & 0x80) { const n = seqLen & 0x7f; seqLen = 0; for (let k = 0; k < n; k++) seqLen = (seqLen << 8) | der[i++]; }
  const readInt = (): Uint8Array => {
    if (der[i++] !== 0x02) throw new Error('bad DER integer');
    const len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length < 32) {
      const pad = new Uint8Array(32 - v.length);
      v = bytes(pad, v);
    }
    return v;
  };
  const r = readInt();
  const s = readInt();
  return bytes(r, s);
}

/* ---------------- payload encryption (RFC 8291 aes128gcm) ---------------- */

async function encryptPayload(plaintext: Uint8Array, p256dh: string, authSecretB64: string) {
  const uaPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(authSecretB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error('bad p256dh');
  if (authSecret.length !== 16) throw new Error('bad auth secret');

  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(
    authSecret,
    ecdhSecret,
    bytes(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, bytes(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, bytes(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const record = bytes(plaintext, new Uint8Array([0x02])); // 마지막 레코드 구분자
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, cekKey, record));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = bytes(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return bytes(header, ciphertext);
}

/* ---------------- Supabase REST ---------------- */

function svcHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (extra) Object.assign(h, extra);
  return h;
}

type Sub = { id?: number; author?: string | null; endpoint: string; p256dh: string; auth: string };

async function listSubs(query = ''): Promise<Sub[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=id,author,endpoint,p256dh,auth${query}&limit=1000`, {
    headers: svcHeaders(),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`subscription fetch failed (${r.status})`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

async function deleteSub(endpoint: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers: svcHeaders({ Prefer: 'return=minimal' }),
    });
  } catch (_e) { /* 만료 정리는 실패해도 계속 */ }
}

/* ---------------- push send ---------------- */

type SendResult = { endpoint: string; ok: boolean; status: number; gone?: boolean; error?: string };

async function sendOne(sub: Sub, message: Record<string, unknown>): Promise<SendResult> {
  const endpoint = sub.endpoint;
  try {
    const payload = enc.encode(JSON.stringify(message));
    const body = await encryptPayload(payload, sub.p256dh, sub.auth);
    const headers = await vapidHeaders(endpoint);
    const r = await fetch(endpoint, { method: 'POST', headers, body });
    if (r.status === 404 || r.status === 410) {
      await deleteSub(endpoint);
      return { endpoint, ok: false, status: r.status, gone: true };
    }
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).slice(0, 200); } catch (_e) { detail = ''; }
      return { endpoint, ok: false, status: r.status, error: detail || `HTTP ${r.status}` };
    }
    return { endpoint, ok: true, status: r.status };
  } catch (e) {
    return { endpoint, ok: false, status: 0, error: String((e as Error)?.message || e).slice(0, 200) };
  }
}

async function sendMany(subs: Sub[], message: Record<string, unknown>, concurrency = 8): Promise<SendResult[]> {
  const out: SendResult[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, subs.length)) }, async () => {
    while (i < subs.length) {
      const idx = i++;
      out[idx] = await sendOne(subs[idx], message);
    }
  });
  await Promise.all(workers);
  return out;
}

function clip(v: unknown, n: number): string {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
}

/* ---------------- handler ---------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!SERVICE_KEY) return json(500, { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing' });

  if (req.method === 'GET') {
    try {
      const subs = await listSubs();
      return json(200, {
        ok: true,
        service: 'push-notify',
        vapid: !!(VAPID_PRIVATE_KEY && VAPID_PUBLIC_KEY),
        subject: VAPID_SUBJECT,
        subscriptions: subs.length,
      });
    } catch (e) {
      return json(500, { ok: false, error: String((e as Error)?.message || e) });
    }
  }

  if (req.method !== 'POST') return json(405, { ok: false, error: 'method not allowed' });

  let input: Record<string, unknown> = {};
  try {
    input = await req.json();
  } catch (_e) {
    return json(400, { ok: false, error: 'invalid JSON body' });
  }

  const action = clip(input.action, 20) || 'test';

  try {
    if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
      return json(500, { ok: false, error: 'VAPID secrets are not configured' });
    }

    if (action === 'test') {
      const endpoint = String(input.endpoint || '').trim();
      if (!endpoint) return json(400, { ok: false, error: 'endpoint required' });
      const rows = await listSubs(`&endpoint=eq.${encodeURIComponent(endpoint)}`);
      const sub = rows[0];
      if (!sub) return json(404, { ok: false, error: 'subscription not found' });
      const res = await sendOne(sub, {
        title: '🌊 부산 여행 길라잡이',
        body: '🧪 테스트 푸시 성공! 이제 톡방 새 글 알림을 받을 수 있어요.',
        icon: '/Busan-trip/icons/icon-192.png',
        badge: '/Busan-trip/icons/icon-192.png',
        tag: 'busan-test',
        url: '/Busan-trip/',
        at: new Date().toISOString(),
      });
      if (!res.ok) return json(res.gone ? 410 : 502, { ok: false, ...res });
      return json(200, { ok: true, sent: 1, result: res });
    }

    if (action === 'broadcast') {
      const title = clip(input.title, MAX_LEN.title) || '🌊 부산 여행 길라잡이';
      const body = clip(input.body, MAX_LEN.body);
      const url = clip(input.url, MAX_LEN.url) || '/Busan-trip/';
      const excludeEndpoint = String(input.exclude_endpoint || '').trim();
      const excludeAuthor = clip(input.exclude_author, MAX_LEN.author);

      let subs = await listSubs();
      const total = subs.length;
      if (excludeEndpoint) subs = subs.filter((s) => s.endpoint !== excludeEndpoint);
      if (excludeAuthor) subs = subs.filter((s) => clip(s.author, MAX_LEN.author) !== excludeAuthor);

      if (!subs.length) return json(200, { ok: true, total, targeted: 0, sent: 0, gone: 0, failed: 0 });

      const message = {
        title,
        body,
        icon: '/Busan-trip/icons/icon-192.png',
        badge: '/Busan-trip/icons/icon-192.png',
        url,
        at: new Date().toISOString(),
      };
      const results = await sendMany(subs, message);
      const sent = results.filter((r) => r.ok).length;
      const gone = results.filter((r) => r.gone).length;
      const failed = results.filter((r) => !r.ok && !r.gone).length;
      return json(200, {
        ok: true,
        total,
        targeted: subs.length,
        sent,
        gone,
        failed,
        errors: results.filter((r) => !r.ok).slice(0, 10).map((r) => ({ status: r.status, error: r.error, endpoint: r.endpoint.slice(0, 80) })),
      });
    }

    return json(400, { ok: false, error: `unknown action: ${action}` });
  } catch (e) {
    return json(500, { ok: false, error: String((e as Error)?.message || e).slice(0, 300) });
  }
});
