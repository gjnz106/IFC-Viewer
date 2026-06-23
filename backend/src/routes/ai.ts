import { Router, Request, Response } from 'express';

export const aiRouter = Router();

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
aiRouter.post('/chat', async (req: Request, res: Response) => {
  const body: AIChatRequest = req.body;
  const providerId = (body.provider || 'anthropic').toLowerCase();
  const cfg = PROVIDERS[providerId];

  if (!cfg) {
    return res.status(400).json({ error: `Provider không hỗ trợ: ${providerId}. Hỗ trợ: ${Object.keys(PROVIDERS).join(', ')}` });
  }
  const apiKey = cfg.apiKey();
  if (!apiKey) {
    return res.status(503).json({ error: `AI provider "${providerId}" chưa cấu hình. Đặt biến môi trường ${cfg.envKey}.` });
  }
  if (!body.messages || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const result = providerId === 'openai' ? await callOpenAI(cfg, apiKey, body)
      : providerId === 'google' ? await callGoogle(cfg, apiKey, body)
      : await callAnthropic(cfg, apiKey, body);

    if (!result.ok) {
      console.error(`[ai] ${providerId} API error:`, result.status, result.error);
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.data);
  } catch (err) {
    console.error(`[ai] Proxy error (${providerId}):`, err);
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
