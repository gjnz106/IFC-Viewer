import { Router, Request, Response, NextFunction } from 'express';

export const aiRouter = Router();

/* ═══════════════════════════════════════════════════════════════════════
   XÁC THỰC + GIỚI HẠN TẦN SUẤT (Firebase ID token, không cần service account)
   ───────────────────────────────────────────────────────────────────────
   Web API key của Firebase vốn công khai theo thiết kế (đã lộ trong bundle
   frontend — xem frontend/src/lib/auth.ts), nên ta dùng endpoint REST
   "accounts:lookup" để xác thực ID token gửi từ client mà KHÔNG cần
   Admin SDK / service-account secret. Mỗi request tới /chat phải kèm
   header `Authorization: Bearer <Firebase ID token>`.
═══════════════════════════════════════════════════════════════════════ */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCrqJiIxlahcHZuwa7xS7KMX8Z5c6Ky3Oo';

async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const user = data?.users?.[0];
    if (!user?.localId) return null;
    // Chỉ chấp nhận tài khoản đã xác minh email — khớp gate ở frontend (auth.ts).
    if (!user.emailVerified) return null;
    return { uid: user.localId, email: user.email };
  } catch (err) {
    console.error('[ai] Firebase token verification failed:', err);
    return null;
  }
}

function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!idToken) {
      return res.status(401).json({ error: 'Thiếu Authorization: Bearer <Firebase ID token>.' });
    }
    const user = await verifyFirebaseToken(idToken);
    if (!user) {
      return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
    (req as any).uid = user.uid;
    (req as any).userEmail = user.email;
    next();
  };
}

// ── Giới hạn tần suất theo uid (in-memory, đủ dùng cho team ~20 người trên
//    1 instance backend; sliding-window đơn giản, reset theo cửa sổ cố định) ──
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_MAX || 20);
const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000); // 10 phút

const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function rateLimitByUid() {
  return (req: Request, res: Response, next: NextFunction) => {
    const uid = (req as any).uid as string;
    const now = Date.now();
    const bucket = rateBuckets.get(uid);
    if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateBuckets.set(uid, { count: 1, windowStart: now });
      return next();
    }
    if (bucket.count >= RATE_LIMIT_MAX) {
      const retryAfterSec = Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Vượt giới hạn ${RATE_LIMIT_MAX} yêu cầu AI / ${RATE_LIMIT_WINDOW_MS / 60000} phút. Thử lại sau ${retryAfterSec}s.`,
      });
    }
    bucket.count++;
    next();
  };
}

// Dọn bucket cũ định kỳ để tránh Map phình to vô hạn (an toàn dù team nhỏ).
setInterval(() => {
  const now = Date.now();
  for (const [uid, bucket] of rateBuckets) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(uid);
  }
}, 15 * 60 * 1000).unref();

/* ═══════════════════════════════════════════════════════════════════════
   AI PROXY ĐA NHÀ CUNG CẤP (multi-provider)
   ───────────────────────────────────────────────────────────────────────
   Frontend luôn nói "tiếng Anthropic": gửi { system, messages, tools } theo
   định dạng Messages API và nhận lại { content:[blocks], stop_reason }.
   Backend dịch qua-lại sang từng provider để vòng lặp tool-use ở client
   không phải đổi gì khi thử nghiệm provider khác.

   Provider hỗ trợ:
     - anthropic : Messages API (mặc định)
     - openai    : Chat Completions (kèm mọi endpoint OpenAI-compatible:
                   OpenRouter, Groq, DeepSeek, LM Studio/Ollama… qua *_BASE_URL)
     - google    : Gemini generateContent (function calling)
═══════════════════════════════════════════════════════════════════════ */

interface AIMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: any }>;
}

interface AIChatRequest {
  provider?: string;
  model?: string;
  max_tokens?: number;
  system?: string;
  messages: AIMessage[];
  tools?: any[];
}

interface ProviderConfig {
  id: string;
  label: string;
  envKey: string;
  defaultModel: string;
  baseUrl: () => string;
  apiKey: () => string | undefined;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-4-5-20251001',
    baseUrl: () => process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    apiKey: () => process.env.ANTHROPIC_API_KEY,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (& tương thích)',
    envKey: 'OPENAI_API_KEY',
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    baseUrl: () => process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: () => process.env.OPENAI_API_KEY,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: () => process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: () => process.env.DEEPSEEK_API_KEY,
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    envKey: 'GOOGLE_API_KEY',
    defaultModel: process.env.GOOGLE_DEFAULT_MODEL || 'gemini-2.0-flash',
    baseUrl: () => process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: () => process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
  },
};

// ── tiện ích chuẩn hoá content của một message thành mảng block ──
function asBlocks(content: AIMessage['content']): Array<{ type: string; [key: string]: any }> {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

/* ─────────────────────────── ANTHROPIC ─────────────────────────── */
async function callAnthropic(cfg: ProviderConfig, apiKey: string, body: AIChatRequest) {
  const payload = {
    model: body.model || cfg.defaultModel,
    max_tokens: body.max_tokens || 4096,
    system: body.system,
    messages: body.messages,
    tools: body.tools,
  };
  const response = await fetch(`${cfg.baseUrl()}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: await response.text() };
  }
  // Anthropic đã đúng định dạng client mong đợi — trả thẳng.
  return { ok: true as const, data: await response.json() };
}

/* ──────────────────────────── OPENAI ───────────────────────────── */
function toOpenAIMessages(body: AIChatRequest): any[] {
  const out: any[] = [];
  if (body.system) out.push({ role: 'system', content: body.system });
  for (const msg of body.messages) {
    const blocks = asBlocks(msg.content);
    if (msg.role === 'assistant') {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const toolUses = blocks.filter(b => b.type === 'tool_use');
      const m: any = { role: 'assistant', content: text || null };
      if (toolUses.length) {
        m.tool_calls = toolUses.map(t => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
        }));
      }
      out.push(m);
    } else {
      // user: hoặc chuỗi thường, hoặc mảng tool_result
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      if (toolResults.length) {
        for (const tr of toolResults) {
          out.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id,
            content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
          });
        }
      } else {
        const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
        out.push({ role: 'user', content: text });
      }
    }
  }
  return out;
}

function fromOpenAIResponse(data: any): any {
  const choice = data?.choices?.[0] || {};
  const msg = choice.message || {};
  const content: any[] = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let input: any = {};
    try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { input = {}; }
    content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input });
  }
  const finish = choice.finish_reason;
  const stop_reason = finish === 'tool_calls' ? 'tool_use'
    : finish === 'length' ? 'max_tokens' : 'end_turn';
  return { content, stop_reason, usage: data?.usage };
}

async function callOpenAI(cfg: ProviderConfig, apiKey: string, body: AIChatRequest) {
  const payload: any = {
    model: body.model || cfg.defaultModel,
    max_tokens: body.max_tokens || 4096,
    messages: toOpenAIMessages(body),
  };
  if (body.tools?.length) {
    payload.tools = body.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }
  const response = await fetch(`${cfg.baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: await response.text() };
  }
  return { ok: true as const, data: fromOpenAIResponse(await response.json()) };
}

/* ──────────────────────────── GOOGLE ───────────────────────────── */
function toGeminiContents(body: AIChatRequest): any[] {
  // map tool_use_id → tên tool (Gemini functionResponse cần tên, không có id)
  const idToName: Record<string, string> = {};
  for (const msg of body.messages) {
    for (const b of asBlocks(msg.content)) {
      if (b.type === 'tool_use' && b.id) idToName[b.id] = b.name;
    }
  }
  const contents: any[] = [];
  for (const msg of body.messages) {
    const blocks = asBlocks(msg.content);
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];
    for (const b of blocks) {
      if (b.type === 'text' && b.text) parts.push({ text: b.text });
      else if (b.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input ?? {} } });
      else if (b.type === 'tool_result') {
        let resp: any = b.content;
        if (typeof resp === 'string') { try { resp = JSON.parse(resp); } catch { resp = { result: resp }; } }
        parts.push({ functionResponse: { name: idToName[b.tool_use_id] || 'tool', response: resp } });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

function fromGeminiResponse(data: any): any {
  const cand = data?.candidates?.[0] || {};
  const parts = cand.content?.parts || [];
  const content: any[] = [];
  let hasTool = false;
  let fnIdx = 0;
  for (const p of parts) {
    if (p.text) content.push({ type: 'text', text: p.text });
    else if (p.functionCall) {
      hasTool = true;
      content.push({
        type: 'tool_use',
        id: `gemini-${Date.now()}-${fnIdx++}`,
        name: p.functionCall.name,
        input: p.functionCall.args || {},
      });
    }
  }
  return { content, stop_reason: hasTool ? 'tool_use' : 'end_turn', usage: data?.usageMetadata };
}

async function callGoogle(cfg: ProviderConfig, apiKey: string, body: AIChatRequest) {
  const model = body.model || cfg.defaultModel;
  const payload: any = {
    contents: toGeminiContents(body),
    generationConfig: { maxOutputTokens: body.max_tokens || 4096 },
  };
  if (body.system) payload.systemInstruction = { parts: [{ text: body.system }] };
  if (body.tools?.length) {
    payload.tools = [{
      functionDeclarations: body.tools.map(t => ({
        name: t.name, description: t.description, parameters: t.input_schema,
      })),
    }];
  }
  const url = `${cfg.baseUrl()}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: await response.text() };
  }
  return { ok: true as const, data: fromGeminiResponse(await response.json()) };
}

/* ───────────────────────────── ROUTES ──────────────────────────── */
// POST /api/ai/chat — proxy tới provider được chọn, giữ API key ở server.
// Yêu cầu Firebase ID token hợp lệ (đã xác minh email) + giới hạn tần suất theo uid.
aiRouter.post('/chat', requireAuth(), rateLimitByUid(), async (req: Request, res: Response) => {
  const body: AIChatRequest = req.body;
  const providerId = (body.provider || 'anthropic').toLowerCase();
  const cfg = PROVIDERS[providerId];
  const uid = (req as any).uid as string;
  const userEmail = (req as any).userEmail as string | undefined;
  // Audit trail: ai chỉ ghi metadata (uid/provider/model/kết quả), KHÔNG ghi
  // nội dung câu hỏi/trả lời — không có DB nên ghi ra log của hosting
  // (Vercel/Firebase đều giữ log stdout, đủ để tra cứu chi phí/lạm dụng).
  function audit(status: number, extra: Record<string, unknown> = {}) {
    console.log(JSON.stringify({
      audit: 'ai_chat', uid, email: userEmail, provider: providerId,
      model: body.model || cfg?.defaultModel, status, ts: new Date().toISOString(), ...extra,
    }));
  }

  if (!cfg) {
    audit(400, { reason: 'unsupported_provider' });
    return res.status(400).json({ error: `Provider không hỗ trợ: ${providerId}. Hỗ trợ: ${Object.keys(PROVIDERS).join(', ')}` });
  }
  const apiKey = cfg.apiKey();
  if (!apiKey) {
    audit(503, { reason: 'provider_not_configured' });
    return res.status(503).json({ error: `AI provider "${providerId}" chưa cấu hình. Đặt biến môi trường ${cfg.envKey}.` });
  }
  if (!body.messages || !Array.isArray(body.messages)) {
    audit(400, { reason: 'missing_messages' });
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const result = (providerId === 'openai' || providerId === 'deepseek') ? await callOpenAI(cfg, apiKey, body)
      : providerId === 'google' ? await callGoogle(cfg, apiKey, body)
      : await callAnthropic(cfg, apiKey, body);

    if (!result.ok) {
      console.error(`[ai] ${providerId} API error:`, result.status, result.error);
      audit(result.status, { reason: 'provider_error' });
      return res.status(result.status).json({ error: result.error });
    }
    audit(200, { usage: result.data?.usage });
    return res.json(result.data);
  } catch (err) {
    console.error(`[ai] Proxy error (${providerId}):`, err);
    audit(500, { reason: 'exception' });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ai/status — liệt kê provider nào đã cấu hình + model mặc định
aiRouter.get('/status', (_req: Request, res: Response) => {
  const providers = Object.values(PROVIDERS).map(p => ({
    id: p.id,
    label: p.label,
    configured: !!p.apiKey(),
    defaultModel: p.defaultModel,
  }));
  const anyConfigured = providers.some(p => p.configured);
  res.json({ configured: anyConfigured, providers });
});
