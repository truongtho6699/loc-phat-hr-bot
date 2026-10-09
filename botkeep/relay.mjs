import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function createRelay({ webhookSecret, relaySecret, appsScriptUrl, fetchImpl = fetch }) {
  if (!webhookSecret || webhookSecret.length < 8 || !relaySecret || relaySecret.length < 32) throw new Error('Missing webhook/relay secrets.');
  const upstream = new URL(appsScriptUrl);
  if (upstream.protocol !== 'https:' || upstream.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(upstream.pathname)) throw new Error('Invalid Apps Script deployment URL.');
  upstream.searchParams.set('bot', '1');
  return http.createServer(async (req, res) => {
    const respond = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/health') return respond(200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/zalo/webhook') return respond(404, { ok: false });
    const actual = Buffer.from(String(req.headers['x-bot-api-secret-token'] || ''));
    const expected = Buffer.from(webhookSecret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return respond(403, { ok: false });
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { respond(413, { ok: false }); req.resume(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      try { JSON.parse(body); } catch (_) { return respond(400, { ok: false }); }
      const timestamp = Date.now();
      const signature = createHmac('sha256', relaySecret).update(`${timestamp}.${body}`).digest('hex');
      const response = await fetchImpl(upstream.toString(), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timestamp, body, signature }), signal: AbortSignal.timeout(25000),
      });
      const result = response.ok && await response.json();
      if (!result || result.success !== true) return respond(502, { ok: false });
      respond(200, { ok: true });
    } catch (_) { respond(502, { ok: false }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createRelay({ webhookSecret: process.env.BOT_WEBHOOK_SECRET, relaySecret: process.env.BOT_RELAY_SECRET, appsScriptUrl: process.env.APPS_SCRIPT_URL });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('HR bot relay is listening.'));
}
