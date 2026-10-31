import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { isInWater, waterDepth } from '../shared/water.js';
import { createGameService } from './gameServer.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 3001);
const distRoot = resolve(projectRoot, 'build/client');
const productionFilesReady = existsSync(resolve(distRoot, 'index.html'));

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };

function sendFile(response, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream', 'cache-control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600' });
  createReadStream(filePath).pipe(response);
  return true;
}

const httpServer = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, game: 'shadow-hunt' }));
    return;
  }
  if (url.pathname === '/water') {
    const x = Number(url.searchParams.get('x')); const z = Number(url.searchParams.get('z'));
    if (!Number.isFinite(x) || !Number.isFinite(z)) { response.writeHead(400, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: 'Provide numeric x and z query values.' })); return; }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ isInWater: isInWater(x, z), waterDepth: waterDepth(x, z) })); return;
  }
  if (!productionFilesReady) { response.writeHead(404); response.end('Shadow Hunt dev server is on port 5173'); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400); response.end('Bad path'); return; }
  if (pathname.startsWith('/maps/')) {
    const mapPath = resolve(projectRoot, `.${pathname}`);
    if (!mapPath.startsWith(`${resolve(projectRoot, 'maps')}${sep}`) || !sendFile(response, mapPath)) { response.writeHead(404); response.end('Not found'); }
    return;
  }
  const assetPath = resolve(distRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!assetPath.startsWith(`${distRoot}${sep}`) && assetPath !== resolve(distRoot, 'index.html')) { response.writeHead(403); response.end('Forbidden'); return; }
  if (sendFile(response, assetPath)) return;
  if (!extname(pathname) && sendFile(response, resolve(distRoot, 'index.html'))) return;
  response.writeHead(404); response.end('Not found');
});

const io = new Server(httpServer, {
  // The game is served from the same origin; both transports remain enabled
  // so browsers can fall back to polling when a websocket cannot connect.
  transports: ['websocket', 'polling'], allowEIO3: false,
});
createGameService(io);

httpServer.listen(port, '0.0.0.0', () => console.log(`Shadow Hunt Socket.IO server listening on ${port}`));
