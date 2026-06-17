import { Router, Request, Response } from 'express';

export const aiRouter = Router();

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface AIMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; [key: string]: any }>;
}

interface AIChatRequest {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages: AIMessage[];
  tools?: any[];
}

// POST /api/ai/chat — proxy requests to Anthropic API.
// Keeps the API key server-side so it is never exposed to the browser.
aiRouter.post('/chat', async (req: Request, res: Response) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI service not configured. Set ANTHROPIC_API_KEY env var.' });
  }

  const body: AIChatRequest = req.body;

  if (!body.messages || !Array.isArray(body.messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const payload = {
      model: body.model || 'claude-haiku-4-5-20251001',
      max_tokens: body.max_tokens || 4096,
      system: body.system,
      messages: body.messages,
      tools: body.tools,
    };

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai] Anthropic API error:', response.status, errText);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('[ai] Proxy error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/ai/status — check if AI service is available
aiRouter.get('/status', (_req: Request, res: Response) => {
  const configured = !!process.env.ANTHROPIC_API_KEY;
  res.json({ configured, model: 'claude-haiku-4-5-20251001' });
});
