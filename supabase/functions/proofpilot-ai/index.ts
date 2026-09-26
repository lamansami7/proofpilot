import { createAIHandler, AI_SYSTEM } from '../_shared/ai.ts';
import { admin, allowedOrigins, authenticate } from '../_shared/runtime.ts';
import { HttpError, readJson } from '../_shared/http.ts';
const key = Deno.env.get('OPENAI_API_KEY');
const model = Deno.env.get('AI_MODEL');
Deno.serve(createAIHandler({
  allowedOrigins, authenticate, enabled: Deno.env.get('AI_ENABLED') === 'true' && Boolean(key && model),
  reserve: async userId => {
    const { data,error } = await admin.rpc('reserve_ai_request',{ actor:userId });
    if (error) throw new HttpError(503,'quota_unavailable');
    return data === true;
  },
  generate: async (route,body,signal) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST', signal, redirect:'error',
      headers:{ Authorization:`Bearer ${key}`,'Content-Type':'application/json' },
      body:JSON.stringify({ model, max_completion_tokens:700, response_format:{ type:'json_object' },
        messages:[{ role:'system',content:AI_SYSTEM },{ role:'user',content:JSON.stringify({ task:route,...body }) }] }),
    });
    if (!response.ok) throw new HttpError(503,'provider_unavailable');
    let result: Record<string, unknown>;
    try { result = await readJson(response, 65536); }
    catch { throw new HttpError(502,'invalid_provider_response'); }
    const choices = result.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const text = choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length > 16000) throw new HttpError(502,'invalid_provider_response');
    try { return JSON.parse(text); } catch { throw new HttpError(502,'invalid_provider_response'); }
  },
}));
