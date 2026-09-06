// Single-file Worker for Cloudflare Pages "advanced mode".
// WHY THIS EXISTS: a dashboard zip upload does NOT compile the functions/ directory —
// only a git build or `wrangler pages deploy` does. Uploading functions/ + _routes.json
// therefore left the gate switched off and every one-pager public. This file is the same
// gate, in the one form a direct upload actually runs.

const enc = new TextEncoder();

async function key(secret){
  return crypto.subtle.importKey('raw', enc.encode(secret),
    {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}
function b64url(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function mint(secret, days = 90){
  const exp = Date.now() + days * 864e5;
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(String(exp)));
  return exp + '.' + b64url(sig);
}
async function valid(secret, token){
  if (!token || !token.includes('.')) return false;
  const [exp, sig] = token.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expect = b64url(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(exp)));
  if (sig.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}
function readCookie(request, name){
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')){
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const path = url.pathname;
    const secret = env.GATE_SECRET;

    // "Is this visitor unlocked?" — used by the page, never exposes the cookie.
    if (path === '/api/status'){
      const ok = secret ? await valid(secret, readCookie(request, 'tec_sub')) : false;
      return new Response(JSON.stringify({ unlocked: ok }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    // Kit sends confirmed subscribers here with ?k=<UNLOCK_KEY>.
    if (path === '/unlocked'){
      if (!secret) return new Response('Gate not configured.', { status: 503 });
      if (url.searchParams.get('k') !== env.UNLOCK_KEY){
        return Response.redirect(url.origin + '/#newsletter', 302);
      }
      const token = await mint(secret, 90);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': url.origin + '/?unlocked=1#newsletter',
          'Set-Cookie': `tec_sub=${token}; Path=/; Max-Age=${90*86400}; HttpOnly; Secure; SameSite=Lax`,
          'Cache-Control': 'no-store'
        }
      });
    }

    // The gate itself. Fails closed if the secret was never configured.
    if (path.startsWith('/_gated/')){
      if (request.method !== 'GET' && request.method !== 'HEAD'){
        return new Response('Method not allowed', { status: 405 });
      }
      if (!secret) return new Response('Gate not configured.', { status: 503 });
      if (!(await valid(secret, readCookie(request, 'tec_sub')))){
        return Response.redirect(url.origin + '/#newsletter', 302);
      }
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, max-age=86400');
      out.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return out;
    }

    return env.ASSETS.fetch(request);
  }
};
