// 生活 OS · AI 代理（Supabase Edge Function，名字必须叫 ai）
// 需要的密钥（Edge Functions → Secrets）：ANTHROPIC_API_KEY、OWNER_EMAIL
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json(503, { error: 'no_server_key' });

  // 只允许你自己的账号调用，别人拿不到你的 AI 额度
  const owner = (Deno.env.get('OWNER_EMAIL') || '').trim().toLowerCase();
  const auth = req.headers.get('Authorization') || '';
  const apikey = req.headers.get('apikey') || '';
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!who.ok) return json(401, { error: 'login' });
  const user = await who.json();
  if (!owner || String(user.email || '').toLowerCase() !== owner) return json(401, { error: 'login' });

  const body = await req.text();
  if (body.length > 12 * 1024 * 1024) return json(413, { error: 'too_large' });
  const up = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body,
  });
  return new Response(await up.text(), { status: up.status, headers: { ...cors, 'content-type': 'application/json' } });
});
