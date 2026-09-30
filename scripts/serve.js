/* Serveur statique local pour tester l'interface sans compilation (dev only).
   Usage : node scripts/serve.js  →  http://127.0.0.1:8347/dev.html */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'frontend');
const PORT = 8347;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.normalize(path.join(ROOT, url === '/' ? 'dev.html' : url));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('403');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('404 Not Found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log('Serveur dev : http://127.0.0.1:' + PORT + '/dev.html  (Ctrl+C pour arrêter)');
  });
