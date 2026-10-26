import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import * as z from 'zod/v4';
import { compilePrompt, gameSpecSchema } from './spec.ts';
import { playtest } from './playtest.ts';

const requestSchema = z.object({ prompt: z.string().trim().min(3).max(4000), previous: gameSpecSchema.optional(), mode: z.enum(['local', 'ai']).default('local') }).strict();
export interface GeneratorOptions { apiKey?: string; model?: string; fetch?: typeof fetch }

/** A constrained data generator: generated output is validated game data, never executable code. */
export async function generateGame(body: unknown, options: GeneratorOptions = {}) {
  const request = requestSchema.parse(body);
  let spec = compilePrompt(request.prompt, request.previous);
  let source: 'local' | 'ai' = 'local';
  const notes: string[] = [];
  if (request.mode === 'ai') {
    if (!options.apiKey) throw new Error('AI generation is not configured. Choose Local generation, or set OPENAI_API_KEY on the server.');
    const schema = z.toJSONSchema(gameSpecSchema); delete schema.$schema;
    let correction = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await (options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
        method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: options.model ?? 'gpt-4.1-mini', store: false,
          instructions: 'You design polished playable 2D arcade games for LoreCraft. Return a complete GameSpec. Supported genres: adventure (collect gems and reach portal), shooter (auto-fire enemies, collect gems, reach portal), survival (evade enemies until timer ends), runner (scrolling hazards until timer ends). Themes: forest, space, dungeon, ocean, neon. Match the prompt creatively using the supported mechanics. Keep the game fair and winnable. Do not claim unsupported mechanics. For refinements preserve unspecified fields and seed. Describe the actual goal in description. Return data only.',
          input: JSON.stringify({ prompt: request.prompt, previous: request.previous, localSuggestion: spec, correction }),
          text: { format: { type: 'json_schema', name: 'lorecraft_game', strict: true, schema } }, max_output_tokens: 2000,
        }),
      });
      if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}. Check the server API key, model access, and usage limits, or switch to Local generation.`);
      const data = await response.json() as { output?: { content?: { type?: string; text?: string }[] }[] };
      const text = data.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === 'output_text').map((item) => item.text ?? '').join('');
      try { spec = gameSpecSchema.parse(JSON.parse(text ?? '')); source = 'ai'; break; }
      catch { correction = 'The previous response did not validate. Return every required schema field with valid bounded values.'; if (attempt === 1) throw new Error('AI output failed validation twice. Try another prompt or use Local generation.'); notes.push('Invalid AI response detected; requested one schema repair.'); }
    }
  }
  let checks = playtest(spec);
  // A bounded build–test–repair loop: deterministic scene correction, then a full recheck.
  for (let attempt = 0; checks.some((check) => !check.passed) && attempt < 2; attempt++) {
    notes.push(`Playtest repair ${attempt + 1}: regenerated scene seed and rechecked all scenarios.`);
    spec = { ...spec, seed: spec.seed % 2147483646 + 1 }; checks = playtest(spec);
  }
  if (checks.some((check) => !check.passed)) throw new Error(`Game could not pass validation: ${checks.filter((c) => !c.passed).map((c) => c.name).join(', ')}.`);
  return { spec, source, checks, notes };
}

export function studioApi(options: GeneratorOptions): Plugin {
  const clients = new Map<string, { count: number; reset: number }>();
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next();
    const json = (code: number, data: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    const path = req.url.split('?')[0];
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return json(403, { error: 'Cross-origin requests are not allowed.' });
    if (path === '/api/status' && req.method === 'GET') return json(200, { aiAvailable: Boolean(options.apiKey), model: options.model ?? 'gpt-4.1-mini' });
    if (path !== '/api/generate') return json(404, { error: 'Unknown API route.' });
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Expected application/json.' });
    const ip = req.socket.remoteAddress ?? 'local', now = Date.now();
    if (clients.size > 1000) for (const [key, entry] of clients) if (entry.reset < now) clients.delete(key);
    const entry = clients.get(ip); const rate = entry && entry.reset > now ? entry : { count: 0, reset: now + 60000 }; clients.set(ip, rate);
    if (++rate.count > 12) return json(429, { error: 'Generation limit reached. Please wait one minute.' });
    const chunks: Buffer[] = []; let length = 0;
    try {
      for await (const chunk of req) { length += Buffer.byteLength(chunk); if (length > 20000) return json(413, { error: 'Request is too large.' }); chunks.push(Buffer.from(chunk)); }
      const result = await generateGame(JSON.parse(Buffer.concat(chunks).toString('utf8')), options); json(200, result);
    } catch (error) { json(error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 502, { error: error instanceof z.ZodError ? 'Invalid game request. Prompt must be 3–4,000 characters and project data must match the schema.' : error instanceof Error ? error.message : 'Generation failed.' }); }
  };
  return { name: 'lorecraft-studio-api', configureServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); }, configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void middleware(req, res, next); }); } };
}
