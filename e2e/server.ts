/*
 * Fixture server for the end-to-end suite. Serves the built library from `dist/`, the
 * pages in `e2e/pages/`, and the API routes below. Playwright starts it through
 * `webServer` in `playwright.config.ts`; run it alone with `node e2e/server.ts` to open
 * a page by hand.
 *
 * Keep routes generic and named for what they do, not for the spec that uses them.
 * State a spec reads back (`/api/log`, the store) is per server run, so a spec that needs a
 * clean slate resets it first.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 4317);

const ROOT = join(import.meta.dirname, '..');
const STATIC_DIRS: Record<string, string> = {
  '/dist/': join(ROOT, 'dist'),
  '/': join(import.meta.dirname, 'pages'),
};
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
};

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => void | Promise<void>;

/** Requests the server received, for specs that assert what reached the wire. */
const log: { method: string; path: string; headers: IncomingMessage['headers'] }[] = [];
let store: Record<string, unknown> = { name: 'Ada', items: [] };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: string, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}

function json(res: ServerResponse, status: number, data: unknown, headers = {}) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json',
    ...headers,
  });
}

/** RFC 7396 merge, applied to the server's copy of the store on push. */
function mergePatch(target: Record<string, any>, patch: Record<string, any>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete target[key];
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = mergePatch(
        target[key] && typeof target[key] === 'object' ? target[key] : {},
        value,
      );
    } else target[key] = value;
  }
  return target;
}

const routes: Record<string, Handler> = {
  'GET /api/log': (_req, res) => json(res, 200, log),
  'POST /api/reset': (_req, res) => {
    log.length = 0;
    store = { name: 'Ada', items: [] };
    send(res, 204, '');
  },

  // Echoes what arrived, so a spec can check the encoding a real server sees
  'POST /api/echo': async (req, res) => {
    const body = await readBody(req);
    json(res, 200, { contentType: req.headers['content-type'] ?? null, body });
  },
  'GET /api/fragment': (_req, res, url) =>
    send(
      res,
      200,
      `<p class="fragment">${url.searchParams.get('text') ?? 'fragment'}</p>`,
    ),

  // Navigation
  'GET /api/redirect-header': (_req, res) =>
    send(res, 200, '', { 'Rouse-Redirect': '/landing.html?via=header' }),
  'GET /api/redirect-302': (_req, res) => {
    res.writeHead(302, { Location: '/api/after-redirect' });
    res.end();
  },
  'GET /api/after-redirect': (_req, res) => send(res, 200, '<p>followed</p>'),
  'GET /api/push-url': (_req, res, url) =>
    send(res, 200, `<p>tab ${url.searchParams.get('tab')}</p>`, {
      'Rouse-Push-Url': `?tab=${url.searchParams.get('tab')}`,
    }),

  // Store sync: push merges into the server copy and answers with a server-owned field
  'GET /api/store': (_req, res) => json(res, 200, store),
  'PATCH /api/store': async (req, res) => {
    const patch = JSON.parse(await readBody(req));
    mergePatch(store, patch);
    store.savedAt = Date.now();
    json(res, 200, { savedAt: store.savedAt });
  },

  // A stream that sends two messages, then drops the connection so the browser
  // reconnects. `Last-Event-ID` on the reconnect continues the count.
  'GET /api/stream': (req, res) => {
    const last = Number(req.headers['last-event-id'] ?? 0);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 50\n\n');
    let n = last;
    const timer = setInterval(() => {
      n++;
      res.write(`id: ${n}\ndata: <b>${n}</b>\n\n`);
      if (n - last >= 2) {
        clearInterval(timer);
        res.end();
      }
    }, 30);
    req.on('close', () => clearInterval(timer));
  },
};

async function serveStatic(res: ServerResponse, pathname: string) {
  for (const [prefix, dir] of Object.entries(STATIC_DIRS)) {
    if (!pathname.startsWith(prefix)) continue;
    const relative = normalize(pathname.slice(prefix.length) || 'index.html');
    if (relative.startsWith('..')) break;
    try {
      const file = await readFile(join(dir, relative));
      res.writeHead(200, { 'Content-Type': TYPES[extname(relative)] ?? 'text/plain' });
      res.end(file);
      return;
    } catch {
      // Fall through to the next directory, then 404
    }
  }
  send(res, 404, 'Not found');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const route = routes[`${req.method} ${url.pathname}`];

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname !== '/api/log') {
      log.push({
        method: req.method ?? '',
        path: url.pathname + url.search,
        headers: req.headers,
      });
    }
    if (!route) return send(res, 404, `No route for ${req.method} ${url.pathname}`);
    return route(req, res, url);
  }
  return serveStatic(res, url.pathname);
});

server.listen(PORT, () => console.log(`e2e fixtures on http://localhost:${PORT}`));
