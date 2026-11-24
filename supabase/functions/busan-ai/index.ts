// 부산 1박 2일 길라잡이 — "도와줘요 제미나이!" AI 상담 Edge Function
// Gemini API 키는 Supabase Secret(GEMINI_API_KEY)에만 있고, 이 코드/저장소에는 절대 넣지 않는다.
// 배포: supabase functions deploy busan-ai --no-verify-jwt  (또는 Management API)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

// 2026-11 실측: flash-lite 1.0초 / gemini-3.6-flash 라우팅(3.5-flash) 11~18초.
// 모바일 대화창은 응답 속도가 중요해서 flash-lite 를 1순위, 품질용 flash 를 2순위로 둔다.
// (신규 프로젝트에서 gemini-2.5-flash·2.0-flash 는 404 "no longer available to new users")
const PRIMARY_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.1-flash-lite';
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

const MAX_MSGS = 12;
const MAX_MSG_CHARS = 2000;
const MAX_CONTEXT_CHARS = 14000;

type Msg = { role: 'user' | 'assistant' | 'model'; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function clip(s: unknown, n: number): string {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function buildSystemPrompt(context: unknown): string {
  let ctx = '';
  try {
    ctx = JSON.stringify(context ?? {}, null, 1);
  } catch {
    ctx = '{}';
  }
  if (ctx.length > MAX_CONTEXT_CHARS) ctx = ctx.slice(0, MAX_CONTEXT_CHARS) + '\n…(이하 생략)';

  return [
    '너는 "제미나이 슈퍼맨"이다. 2026년 11월 28~29일 부산 1박 2일 여행(5인: 영진·지현·준섭·명강·윤지)을 함께하는 똑똑하고 유쾌한 여행 도우미 AI다.',
    '아래 [실시간 데이터]는 지금 이 순간 사이트에 들어 있는 실제 값이다. 일정·날씨·정산·체크리스트·톡방·KTX/숙소·위치 질문에는 반드시 이 데이터를 근거로 답한다. 데이터에 없는 값은 지어내지 말고 "사이트에 아직 없어"라고 말한다.',
    '',
    '[답변 규칙]',
    '1. 한국어 반말, 친근하고 발랄하게. 인사말·서론 없이 핵심부터.',
    '2. 모바일에서 읽기 좋게 3~6줄 이내로 짧게. 필요하면 • 불릿 2~4개.',
    '3. 숫자는 정확히. 정산은 원 단위, 금액 계산이 필요하면 직접 계산해서 누가 누구에게 얼마 보내면 되는지 콕 집어 말한다.',
    '4. 날씨·드론쇼는 데이터의 기온·체감·바람(m/s)·강수확률(%)을 그대로 인용하고, 바람 4.5m/s 초과는 주의, 6m/s 이상이나 강수 60% 이상이면 취소 가능성을 짚는다.',
    '5. 다음 코스 안내는 지금 시각 기준 NOW/NEXT와 이동수단·소요시간·요금을 함께 말한다. 이동은 택시보다 버스·지하철을 먼저 권한다.',
    '6. 모르면 모른다고 하고, 확인 방법(사이트의 어느 카드/시트)을 알려준다. 의료·법률처럼 민감한 판단은 전문가 확인을 권한다.',
    '7. 답변에 이모지를 1~2개만 자연스럽게 섞는다. 마크다운 표는 쓰지 않는다(모바일). 굵게는 **처럼 쓰지 말고 그냥 텍스트로.',
    '',
    '[실시간 데이터]',
    ctx
  ].join('\n');
}

function toGeminiContents(messages: Msg[]) {
  const list = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_MSGS)
    .map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: clip(m.content, MAX_MSG_CHARS) }]
    }));
  // 첫 턴이 model 이면 Gemini가 거부하므로 user로 시작하도록 자른다.
  while (list.length && list[0].role === 'model') list.shift();
  return list;
}

async function callGemini(model: string, key: string, systemPrompt: string, contents: unknown) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.75,
      topP: 0.95,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return { status: r.status, data };
}

function extractText(data: any): string {
  const c = data?.candidates?.[0];
  const parts = c?.content?.parts || [];
  const out = parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('').trim();
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') {
    return json({ ok: true, fn: 'busan-ai', model: PRIMARY_MODEL, hint: 'POST {messages, context}' });
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ ok: false, error: 'missing_gemini_api_key' }, 500);

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const contents = toGeminiContents(payload.messages);
  if (!contents.length) return json({ ok: false, error: 'no_messages' }, 400);

  const systemPrompt = buildSystemPrompt(payload.context);

  const tried: string[] = [];
  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];
  let lastErr = '';

  for (const model of models) {
    tried.push(model);
    const t0 = Date.now();
    let res;
    try {
      res = await callGemini(model, key, systemPrompt, contents);
    } catch (e) {
      lastErr = `fetch_failed:${String(e)}`;
      continue;
    }
    const took = Date.now() - t0;

    if (res.status === 200) {
      const reply = extractText(res.data);
      if (reply) {
        return json({
          ok: true,
          reply,
          model: res.data?.modelVersion || model,
          usage: res.data?.usageMetadata || null,
          ms: took
        });
      }
      lastErr = `empty_candidate:${JSON.stringify(res.data?.candidates?.[0]?.finishReason || '')}`;
      continue; // 빈 응답이면 다음 모델 시도
    }

    lastErr = `http_${res.status}:${clip(res.data?.error?.message || '', 220)}`;
    // 400(모델/파라미터 문제)·429(한도)·503(과부하) 모두 다음 후보로 넘어간다.
  }

  return json({ ok: false, error: 'upstream_failed', detail: lastErr, tried }, 502);
});
