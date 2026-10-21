import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDir, '../../frontend');
const port = Number(process.env.FRONTEND_PORT ?? 5500);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendText(res, status, message) {
  const body = `${message}\n`;
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

async function resolveFile(pathname) {
  let decoded;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const candidate = path.resolve(root, `.${decoded}`);

  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  const info = await stat(candidate).catch(() => null);

  if (!info) {
    return null;
  }

  if (info.isDirectory()) {
    const index = path.join(candidate, 'index.html');
    const indexInfo = await stat(index).catch(() => null);
    return indexInfo?.isFile() ? index : null;
  }

  return info.isFile() ? candidate : null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendText(res, 405, 'Método no permitido');
  }

  let pathname;

  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return sendText(res, 400, 'Solicitud no válida');
  }

  const file = await resolveFile(pathname);

  if (!file) {
    return sendText(res, 404, 'Archivo no encontrado');
  }

  const info = await stat(file);
  const type = MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });

  if (req.method === 'HEAD') {
    return res.end();
  }

  const stream = createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) {
      sendText(res, 500, 'No se pudo leer el archivo');
    } else {
      res.destroy();
    }
  });
  return stream.pipe(res);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${port} ya está en uso.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Frontend disponible en http://localhost:${port}`);
});
