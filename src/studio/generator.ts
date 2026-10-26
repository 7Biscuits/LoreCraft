import * as z from 'zod/v4';
import { compilePrompt, gameSpecSchema, projectContextSchema } from './spec.ts';
import { playtest } from './playtest.ts';

const requestSchema = z.object({ prompt: z.string().trim().min(3).max(4000), previous: gameSpecSchema.optional(), context: projectContextSchema.optional(), mode: z.enum(['local', 'ai']).default('local') }).strict();
export interface GeneratorOptions {
  apiKey?: string; model?: string; baseUrl?: string;
  apiStyle?: 'responses' | 'chat_completions';
  jsonMode?: 'json_schema' | 'json_object' | 'prompt';
  fetch?: typeof fetch; signal?: AbortSignal;
}

export function generatorOptionsFromEnv(env: Record<string, string | undefined>): GeneratorOptions {
  return {
    apiKey: env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim(),
    model: env.LLM_MODEL?.trim() || env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    baseUrl: env.LLM_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    apiStyle: z.enum(['responses', 'chat_completions']).parse(env.LLM_API_STYLE || 'responses'),
    jsonMode: z.enum(['json_schema', 'json_object', 'prompt']).parse(env.LLM_JSON_MODE || 'json_schema'),
  };
}

function providerEndpoint(options: GeneratorOptions): string {
  const url = new URL(options.baseUrl ?? 'https://api.openai.com/v1');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('LLM_BASE_URL must use HTTPS, or HTTP on a loopback address for a local model.');
  if (url.username || url.password || url.search || url.hash) throw new Error('LLM_BASE_URL must not contain credentials, query parameters, or a fragment. Put credentials in LLM_API_KEY.');
  if (/\/(?:responses|chat\/completions)\/?$/.test(url.pathname)) throw new Error('Set LLM_BASE_URL to the API root, usually ending in /v1, without /responses or /chat/completions.');
  return `${url.href.replace(/\/+$/, '')}/${options.apiStyle === 'chat_completions' ? 'chat/completions' : 'responses'}`;
}

/** A constrained data generator: generated output is validated game data, never executable code. */
export async function generateGame(body: unknown, options: GeneratorOptions = {}) {
  const request = requestSchema.parse(body);
  let spec = compilePrompt(request.prompt, request.previous);
  let source: 'local' | 'ai' = 'local';
  const notes: string[] = [];
  if (request.mode === 'ai') {
    if (!options.apiKey) throw new Error('AI generation is not configured. Choose Local generation, or set LLM_API_KEY / OPENAI_API_KEY on the server.');
    const endpoint = providerEndpoint(options);
    const style = options.apiStyle ?? 'responses', jsonMode = options.jsonMode ?? 'json_schema';
    const schema = z.toJSONSchema(gameSpecSchema); delete schema.$schema;
    let correction = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const instructions = `You design polished playable 2D arcade games for LoreCraft. Return a complete GameSpec JSON object, with no markdown or commentary. Supported genres: platformer (gravity, jump, collect gems, ground exit), puzzle (grid movement, numbered gems collected in order, portal), adventure (collect gems and reach portal), shooter (auto-fire enemies, collect gems, reach portal), survival (evade enemies until timer ends), runner (scrolling hazards until timer ends). Themes: forest, space, dungeon, ocean, neon. Match the prompt using supported mechanics. Keep the game fair and winnable. For refinements preserve unspecified fields and seed. Describe the actual goal. Match this JSON schema exactly: ${JSON.stringify(schema)}`;
      const input = JSON.stringify({ prompt: request.prompt, previous: request.previous, localSuggestion: spec, context: request.context, correction });
      const format = jsonMode === 'json_schema' ? { type: 'json_schema', name: 'lorecraft_game', strict: true, schema } : { type: 'json_object' };
      const payload = style === 'chat_completions'
        ? { model: options.model ?? 'gpt-4.1-mini', messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }], stream: false, max_tokens: 2000,
          ...(jsonMode === 'prompt' ? {} : { response_format: jsonMode === 'json_schema' ? { type: 'json_schema', json_schema: { name: 'lorecraft_game', strict: true, schema } } : format }) }
        : { model: options.model ?? 'gpt-4.1-mini', store: false, instructions, input, max_output_tokens: 2000, ...(jsonMode === 'prompt' ? {} : { text: { format } }) };
      const response = await (options.fetch ?? fetch)(endpoint, {
        method: 'POST', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}. Check the base URL, API style, model, API key, and usage limits. If structured output is unsupported, try LLM_JSON_MODE=json_object or prompt, then restart the server.`);
      const data = await response.json() as { output?: { content?: { type?: string; text?: string }[] }[]; choices?: { message?: { content?: string | { text?: string }[] } }[] };
      const content = data.choices?.[0]?.message?.content;
      const text = style === 'chat_completions' ? typeof content === 'string' ? content : content?.map((part) => part.text ?? '').join('')
        : data.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === 'output_text').map((item) => item.text ?? '').join('');
      try { spec = gameSpecSchema.parse(JSON.parse((text ?? '').trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, ''))); source = 'ai'; break; }
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

