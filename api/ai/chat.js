/* ═══════════════════════════════════════════════════════════════════════
   IFC DELTA — VERCEL SERVERLESS AI PROXY  (/api/ai/chat)
   ───────────────────────────────────────────────────────────────────────
   Giữ API key ở SERVER (biến môi trường Vercel), không bao giờ lộ ra trình
   duyệt. Frontend nói "tiếng Anthropic" (gửi { system, messages, tools } và
   nhận { content:[blocks], stop_reason }); hàm này dịch qua-lại sang DeepSeek
   (endpoint tương thích OpenAI Chat Completions) để vòng lặp tool-use ở client
   không phải đổi gì.

   Biến môi trường (đặt trong Vercel → Project → Settings → Environment Variables):
     - DEEPSEEK_API_KEY     (BẮT BUỘC)  — key DeepSeek, KHÔNG commit vào repo
     - DEEPSEEK_MODEL       (tuỳ chọn)  — mặc định "deepseek-chat"
     - DEEPSEEK_BASE_URL    (tuỳ chọn)  — mặc định "https://api.deepseek.com"
     - FIREBASE_API_KEY     (tuỳ chọn)  — Web API key (công khai) để xác thực ID token;
                                          mặc định khớp frontend/src/lib/auth.ts
     - AI_RATE_LIMIT_MAX        (tuỳ chọn) — mặc định 20 request / cửa sổ
     - AI_RATE_LIMIT_WINDOW_MS  (tuỳ chọn) — mặc định 600000 (10 phút)

   Bảo mật & phạm vi:
     - XÁC THỰC: mỗi request phải kèm `Authorization: Bearer <Firebase ID token>`;
       token được xác minh qua REST accounts:lookup (không cần Admin SDK). Thiếu/sai
       token → 401. Đây là lớp bảo vệ CHÍNH cho key & chi phí (khớp backend Express).
     - GIỚI HẠN TẦN SUẤT: theo uid, in-memory. LƯU Ý: serverless Vercel stateless —
       mỗi instance có Map riêng và bị reclaim sau thời gian rảnh, nên đây là best-effort
       (không enforce toàn cục). Vẫn chặn được lạm dụng dồn dập trên một instance ấm;
       muốn cứng hơn cần đặt hard cap chi tiêu ở Console DeepSeek hoặc dùng store ngoài.
     - Hàm TỰ CHÈN một guardrail hệ thống (GUARDRAIL) lên trước mọi system prompt
       của client → kể cả khi ai đó gọi thẳng endpoint này, trợ lý vẫn chỉ trả
       lời về mô hình IFC đang mở, từ chối thông tin ngoài.
═══════════════════════════════════════════════════════════════════════ */

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// ── Xác thực Firebase ID token qua REST (không cần service-account) ──
// Web API key vốn công khai (đã có trong bundle frontend) nên dùng accounts:lookup
// để xác minh token. Khớp với frontend/src/lib/auth.ts + backend/src/routes/ai.ts.
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCrqJiIxlahcHZuwa7xS7KMX8Z5c6Ky3Oo';

async function verifyFirebaseToken(idToken) {
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
    const data = await resp.json();
    const user = data && data.users && data.users[0];
    if (!user || !user.localId) return null;
    // Chỉ chấp nhận tài khoản đã xác minh email — khớp gate ở frontend (auth.ts).
    if (!user.emailVerified) return null;
    return { uid: user.localId, email: user.email };
  } catch (err) {
    console.error('[ai] Firebase token verification failed:', err);
    return null;
  }
}

// ── Giới hạn tần suất theo uid (in-memory, best-effort trên serverless) ──
const RATE_LIMIT_MAX = Number(process.env.AI_RATE_LIMIT_MAX || 20);
const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000); // 10 phút
const rateBuckets = new Map();

// Trả null nếu được phép; trả số giây Retry-After nếu vượt giới hạn.
function rateLimitRetryAfter(uid) {
  const now = Date.now();
  const bucket = rateBuckets.get(uid);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(uid, { count: 1, windowStart: now });
    return null;
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
  }
  bucket.count++;
  return null;
}

// Guardrail bắt buộc — luôn đứng trước system prompt của client.
const GUARDRAIL = [
  'Bạn là trợ lý của IFC Delta — công cụ xem & truy vấn mô hình IFC cho kỹ sư BIM.',
  'CHỈ trả lời các câu hỏi liên quan đến (các) MÔ HÌNH IFC đang mở và tính năng của IFC Delta.',
  'Nếu câu hỏi KHÔNG liên quan đến mô hình đang mở (kiến thức chung, lập trình, tin tức, đời sống, trò chuyện phiếm…), hãy lịch sự TỪ CHỐI ngắn gọn và nhắc rằng bạn chỉ hỗ trợ về mô hình IFC đang mở.',
  'Chỉ dùng dữ liệu lấy từ tool và ngữ cảnh mô hình được cung cấp; TUYỆT ĐỐI không bịa số, không dùng thông tin ngoài mô hình.',
  'Trả lời CÙNG NGÔN NGỮ với câu hỏi của người dùng (Việt→Việt, Anh→Anh). / Reply in the same language as the user question.',
].join('\n');

// ── chuẩn hoá content của một message thành mảng block ──
function asBlocks(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

// ── Anthropic-shape { system, messages } → OpenAI messages ──
function toOpenAIMessages(systemText, messages) {
  const out = [];
  if (systemText) out.push({ role: 'system', content: systemText });
  for (const msg of messages) {
    const blocks = asBlocks(msg.content);
    if (msg.role === 'assistant') {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const toolUses = blocks.filter(b => b.type === 'tool_use');
      const m = { role: 'assistant', content: text || null };
      if (toolUses.length) {
        m.tool_calls = toolUses.map(t => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
        }));
      }
      out.push(m);
    } else {
      // user: chuỗi thường HOẶC mảng tool_result
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

// ── OpenAI response → Anthropic-shape { content, stop_reason } ──
function fromOpenAIResponse(data) {
  const choice = (data && data.choices && data.choices[0]) || {};
  const msg = choice.message || {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let input = {};
    try { input = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch { input = {}; }
    content.push({ type: 'tool_use', id: tc.id, name: tc.function && tc.function.name, input });
  }
  const finish = choice.finish_reason;
  const stop_reason = finish === 'tool_calls' ? 'tool_use'
    : finish === 'length' ? 'max_tokens' : 'end_turn';
  return { content, stop_reason, usage: data && data.usage };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI chưa cấu hình: thiếu biến môi trường DEEPSEEK_API_KEY trên Vercel.' });
    return;
  }

  // ── Xác thực: bắt buộc Firebase ID token hợp lệ (đã xác minh email) ──
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!idToken) {
    res.status(401).json({ error: 'Thiếu Authorization: Bearer <Firebase ID token>.' });
    return;
  }
  const user = await verifyFirebaseToken(idToken);
  if (!user) {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  // ── Giới hạn tần suất theo uid (best-effort trên serverless) ──
  const retryAfter = rateLimitRetryAfter(user.uid);
  if (retryAfter !== null) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: `Vượt giới hạn ${RATE_LIMIT_MAX} yêu cầu AI / ${RATE_LIMIT_WINDOW_MS / 60000} phút. Thử lại sau ${retryAfter}s.`,
    });
    return;
  }

  // Audit tối thiểu: chỉ metadata (uid/email/status), KHÔNG ghi nội dung chat.
  const audit = (status, extra = {}) => console.log(JSON.stringify({
    audit: 'ai_chat', uid: user.uid, email: user.email, provider: 'deepseek',
    model: DEEPSEEK_MODEL, status, ts: new Date().toISOString(), ...extra,
  }));

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || !Array.isArray(body.messages)) {
    audit(400, { reason: 'missing_messages' });
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // Guardrail server-side luôn đứng trước system của client.
  const systemText = [GUARDRAIL, body.system].filter(Boolean).join('\n\n');

  try {
    const payload = {
      model: DEEPSEEK_MODEL,
      max_tokens: Math.min(Number(body.max_tokens) || 1024, 4096),
      messages: toOpenAIMessages(systemText, body.messages),
    };
    if (Array.isArray(body.tools) && body.tools.length) {
      payload.tools = body.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    const upstream = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 300);
      console.error('[ai] DeepSeek error', upstream.status, detail);
      audit(upstream.status, { reason: 'provider_error' });
      res.status(upstream.status).json({ error: `AI provider error (${upstream.status})`, detail });
      return;
    }

    const data = fromOpenAIResponse(await upstream.json());
    audit(200, { usage: data.usage });
    res.status(200).json(data);
  } catch (err) {
    console.error('[ai] proxy error', err);
    audit(500, { reason: 'exception' });
    res.status(500).json({ error: 'Internal server error' });
  }
};
