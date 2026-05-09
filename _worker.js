/**
 * _worker.js — Cloudflare Pages Worker
 *
 * VARIÁVEIS DE AMBIENTE (Pages > Settings > Environment Variables):
 *   SUPABASE_URL          ex: https://xyzxyz.supabase.co
 *   SUPABASE_ANON_KEY     chave pública — usada para login de usuários
 *   SUPABASE_SERVICE_KEY  chave secreta — usada para logs e validação de sessão
 *   TURNSTILE_SECRET_KEY  chave secreta do Turnstile
 */

// Rotas que exigem sessão válida
const PROTECTED = ['/dashboard', '/painel', '/relatorios', '/admin'];

// Rate limiting em memória (resetado por instância do Worker)
const rl = new Map();
const RL_MAX = 5;
const RL_WIN = 60; // segundos

function checkRateLimit(ip) {
  const now = Math.floor(Date.now() / 1000);
  const e = rl.get(ip) || { n: 0, t: now };
  if (now - e.t > RL_WIN) { e.n = 0; e.t = now; }
  e.n++;
  rl.set(ip, e);
  if (rl.size > 5000) {
    for (const [k, v] of rl)
      if (now - v.t > RL_WIN * 2) rl.delete(k);
  }
  return e.n > RL_MAX;
}

async function verifyTurnstile(token, ip, secret) {
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip })
  });
  return (await r.json()).success === true;
}

async function supabaseLogin(email, password, url, anonKey) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({ email, password })
  });
  const d = await r.json();
  if (!r.ok) return { error: d.error_description || d.msg || 'auth_failed' };
  return { token: d.access_token, user: d.user };
}

async function validateSession(cookie, url, serviceKey) {
  if (!cookie) return null;
  const m = cookie.match(/(?:^|;\s*)pmoc_sess=([^;]+)/);
  if (!m) return null;
  const token = decodeURIComponent(m[1]);
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function writeLog(url, key, data) {
  fetch(`${url}/rest/v1/auth_logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      email: data.email || null,
      ip_address: data.ip,
      success: data.ok,
      failure_reason: data.reason || null,
      created_at: new Date().toISOString()
    })
  }).catch(() => {});
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(req, env) {
    const url  = new URL(req.url);
    const path = url.pathname;
    const ip   = req.headers.get('CF-Connecting-IP') || '0.0.0.0';
    const cook = req.headers.get('Cookie') || '';

    // ── POST /api/login ──────────────────────────────────────────────────────
    if (path === '/api/login' && req.method === 'POST') {
      let body;
      try { body = await req.json(); }
      catch { return json(400, { ok: false, message: 'Requisição inválida.' }); }

      const { email, password, remember, turnstileToken } = body;

      if (!email || !password || !turnstileToken)
        return json(400, { ok: false, message: 'Dados incompletos.' });

      if (checkRateLimit(ip)) {
        writeLog(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY,
          { email, ip, ok: false, reason: 'rate_limited' });
        return json(429, { ok: false, message: 'Muitas tentativas. Aguarde 1 minuto.' });
      }

      const tsOk = await verifyTurnstile(turnstileToken, ip, env.TURNSTILE_SECRET_KEY);
      if (!tsOk) {
        writeLog(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY,
          { email, ip, ok: false, reason: 'turnstile_failed' });
        return json(403, { ok: false, message: 'Verificação de segurança falhou.' });
      }

      const auth = await supabaseLogin(email, password, env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
      if (auth.error) {
        writeLog(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY,
          { email, ip, ok: false, reason: 'invalid_credentials' });
        return json(401, { ok: false, message: 'E-mail ou senha incorretos.' });
      }

      writeLog(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY,
        { email, ip, ok: true, reason: null });

      const maxAge = remember ? 60 * 60 * 24 * 7 : 0;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Set-Cookie': cookie('pmoc_sess', auth.token, maxAge)
        }
      });
    }

    // ── POST /api/recover ────────────────────────────────────────────────────
    if (path === '/api/recover' && req.method === 'POST') {
      let body;
      try { body = await req.json(); }
      catch { return json(400, { ok: false, message: 'Requisição inválida.' }); }

      const { email } = body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json(400, { ok: false, message: 'E-mail inválido.' });

      if (checkRateLimit(ip))
        return json(429, { ok: false, message: 'Muitas tentativas. Aguarde 1 minuto.' });

      try {
        const r = await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            email,
            // URL para onde o link do e-mail vai redirecionar após o clique.
            // Deve estar cadastrada nas Redirect URLs do Supabase.
            redirect_to: 'https://pmoc.pages.dev/reset-senha'
          })
        });

        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          console.error('[PMOCsys] Supabase /auth/v1/recover error:', r.status, err);
          return json(500, { ok: false, message: 'Erro ao processar. Tente novamente.' });
        }

        // O Supabase retorna 200 OK mesmo se o e-mail não existir (anti-enumeração)
        return json(200, { ok: true });

      } catch (e) {
        console.error('[PMOCsys] /api/recover fetch error:', e);
        return json(500, { ok: false, message: 'Erro de conexão com o servidor.' });
      }
    }

    // ── POST /api/reset ──────────────────────────────────────────────────────
    // Recebe { token, password } do reset-senha.html e atualiza a senha
    // server-side via Supabase Auth, sem expor chaves no front-end.
    if (path === '/api/reset' && req.method === 'POST') {
      let body;
      try { body = await req.json(); }
      catch { return json(400, { ok: false, message: 'Requisição inválida.' }); }

      const { token, password } = body;

      // Validações básicas
      if (!token || typeof token !== 'string' || token.trim() === '')
        return json(400, { ok: false, message: 'Token ausente.' });

      if (!password || typeof password !== 'string' || password.length < 8)
        return json(400, { ok: false, message: 'A senha deve ter no mínimo 8 caracteres.' });

      // Rate limiting — mesmo mecanismo do /api/login
      if (checkRateLimit(ip))
        return json(429, { ok: false, message: 'Muitas tentativas. Aguarde 1 minuto.' });

      try {
        // Atualiza a senha usando o access_token de recuperação como Bearer.
        // Este token é emitido pelo Supabase quando o usuário clica no link
        // do e-mail de recuperação — ele possui scope limitado (só reset).
        const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token.trim()}`
          },
          body: JSON.stringify({ password })
        });

        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          console.error('[PMOCsys] Supabase /auth/v1/user PUT error:', r.status, err);

          // 401 = token inválido ou expirado
          if (r.status === 401 || r.status === 403)
            return json(401, { ok: false, message: 'Link expirado ou inválido. Solicite um novo.' });

          return json(500, { ok: false, message: 'Erro ao redefinir senha. Tente novamente.' });
        }

        return json(200, { ok: true });

      } catch (e) {
        console.error('[PMOCsys] /api/reset fetch error:', e);
        return json(500, { ok: false, message: 'Erro de conexão com o servidor.' });
      }
    }

    // ── GET /api/logout ──────────────────────────────────────────────────────
    if (path === '/api/logout') {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': `pmoc_sess=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
          'Cache-Control': 'no-store'
        }
      });
    }

    // ── Rotas protegidas ─────────────────────────────────────────────────────
    if (PROTECTED.some(p => path.startsWith(p))) {
      const user = await validateSession(cook, env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      if (!user) return Response.redirect(`${url.origin}/login`, 302);
      return env.ASSETS.fetch(req);
    }

    // ── Login — redireciona se já autenticado ────────────────────────────────
    if (path === '/' || path === '/index.html') {
      const user = await validateSession(cook, env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      if (user) return Response.redirect(`${url.origin}/dashboard`, 302);
    }

    // ── Tudo mais — serve estático ───────────────────────────────────────────
    return env.ASSETS.fetch(req);
  }
};
