#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.WHACK_PORT || '7654', 10);
const DATA_DIR = process.env.WHACK_DATA_DIR
  || path.join(process.env.HOME || '/tmp', '.claude/plugins/data/whack-a-claude');
const ASSETS_DIR = process.env.WHACK_ASSETS_DIR
  || path.join(__dirname, '..', 'assets');
const STATUS_FILE = path.join(DATA_DIR, 'status.json');
const ASSETS_ROOT = path.resolve(ASSETS_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/status') {
      let body = '{"state":"idle"}';
      try { body = fs.readFileSync(STATUS_FILE, 'utf8'); } catch (_) {}
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(body);
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    const pathname = url.pathname === '/' ? '/game.html' : url.pathname;
    const resolved = path.resolve(ASSETS_DIR, '.' + pathname);
    if (resolved !== ASSETS_ROOT && !resolved.startsWith(ASSETS_ROOT + path.sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(resolved, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`whack-a-claude: port ${PORT} already in use, exiting.`);
    process.exit(0);
  }
  console.error('whack-a-claude server error:', err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`whack-a-claude listening on http://127.0.0.1:${PORT}`);
});

['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => process.exit(0)));
