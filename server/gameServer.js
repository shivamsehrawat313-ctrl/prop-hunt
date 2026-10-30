import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import map from '../shared/map.js';
import { movePlayer } from '../shared/movement.js';
import { chooseSpawnPoints, WORLD_COLLIDERS } from '../shared/world.js';
import {
  BOT_MAX_COUNT, BOT_WANDER_INTERVAL_MAX_MS, BOT_WANDER_INTERVAL_MIN_MS,
  GAME_TICK_INTERVAL_MS, GAME_TICK_RATE_HZ, INPUT_MAX_ABS, MAX_ROOM_PLAYERS,
  PLAYER_MAX_SPEED, RECONNECT_WINDOW_MS, ROOM_CODE_LENGTH,
} from '../shared/constants.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PLAYER_COLORS = ['#7fffe1', '#f6ce72', '#a9a2ff', '#ff9e88', '#8bdbff', '#f6a9d9'];
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const builtClientRoot = resolve(projectRoot, 'dist', 'client');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4',
};

function cleanName(raw) {
  const name = String(raw || '').trim().replace(/[\u0000-\u001f]/g, '');
  return name.length >= 2 && name.length <= 14 ? name : null;
}

function makeCode(rooms) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate a room code.');
}

function validInput(input) {
  const x = Number(input?.x); const z = Number(input?.z);
  return { x: Number.isFinite(x) ? Math.max(-INPUT_MAX_ABS, Math.min(INPUT_MAX_ABS, x)) : 0, z: Number.isFinite(z) ? Math.max(-INPUT_MAX_ABS, Math.min(INPUT_MAX_ABS, z)) : 0 };
}

function publicRoom(room, viewerId = null) {
  const players = [...room.players.values()].filter((player) => player.connected).map((player) => ({
    id: player.id, name: player.name, x: player.x, z: player.z, angle: player.angle,
    ready: player.ready, host: player.id === room.hostId, isBot: Boolean(player.isBot),
    color: player.color,
  }));
  return { code: room.code, phase: room.phase, hostId: room.hostId, players, playerId: viewerId, tickRate: GAME_TICK_RATE_HZ };
}

export function createGameServer({ port = 0, host = '127.0.0.1', staticRoot = builtClientRoot, logger = console } = {}) {
  const rooms = new Map();
  const socketRooms = new Map();
  let botCounter = 0;
  let closed = false;

  const httpServer = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true, game: 'shadow-hunt', tickRate: GAME_TICK_RATE_HZ })); return;
    }
    if (pathname === '/water') { response.writeHead(404); response.end('Not found'); return; }
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400); response.end('Bad path'); return; }
    const target = resolve(staticRoot, `.${decoded}`);
    if (target !== staticRoot && !target.startsWith(`${staticRoot}${sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }
    try {
      const file = await stat(target);
      if (!file.isFile()) throw new Error('Not a file');
      response.writeHead(200, { 'content-type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
      response.end(await readFile(target));
    } catch {
      const accept = request.headers.accept || '';
      if (pathname !== '/' && !accept.includes('text/html')) { response.writeHead(404); response.end('Not found'); return; }
      try { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); response.end(await readFile(resolve(staticRoot, 'index.html'))); }
      catch { response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Built client not found. Run npm run build first.'); }
    }
  });
  const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 16_384 });

  function roomForSocket(socket) { const code = socketRooms.get(socket.id); return code ? rooms.get(code) : null; }
  function broadcastRoom(room) {
    for (const player of room.players.values()) player.host = player.id === room.hostId;
    const data = publicRoom(room);
    for (const player of room.players.values()) if (player.connected && player.socket) player.socket.emit('room:update', { ...data, playerId: player.id });
  }
  function removePlayer(room, player, { allowRejoin = false } = {}) {
    if (!allowRejoin) room.players.delete(player.id);
    else {
      player.connected = false; player.socket = null; player.input = { x: 0, z: 0 }; player.disconnectedAt = Date.now();
      clearTimeout(player.reconnectTimer);
      player.reconnectTimer = setTimeout(() => {
        if (!player.connected && room.players.get(player.id) === player) { room.players.delete(player.id); broadcastRoom(room); }
      }, RECONNECT_WINDOW_MS);
      player.reconnectTimer.unref?.();
    }
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find((item) => item.connected)?.id || null;
    if (![...room.players.values()].some((item) => item.connected && !item.isBot)) {
      clearTimeout(room.deleteTimer);
      room.deleteTimer = setTimeout(() => { if (![...room.players.values()].some((item) => item.connected && !item.isBot)) { for (const item of room.players.values()) clearTimeout(item.reconnectTimer); rooms.delete(room.code); } }, RECONNECT_WINDOW_MS);
      room.deleteTimer.unref?.();
    }
    if (room.players.size === 0) rooms.delete(room.code);
    else broadcastRoom(room);
  }
  function attachSocket(room, player, socket) {
    player.id = socket.id; player.socket = socket; player.connected = true; player.disconnectedAt = 0;
    room.players.set(player.id, player);
    socketRooms.set(socket.id, room.code); socket.join(room.code);
    clearTimeout(room.deleteTimer); room.deleteTimer = null; clearTimeout(player.reconnectTimer); player.reconnectTimer = null;
    socket.emit('room:joined', { code: room.code, rejoined: Boolean(player.rejoined) });
    player.rejoined = false;
    broadcastRoom(room);
  }
  function sendError(socket, message) { socket.emit('room:error', { message }); }
  function snapshot(room, now) {
    const players = [...room.players.values()].filter((player) => player.connected).map(({ id, name, x, z, angle, ready, isBot }) => ({ id, name, x, z, angle, ready, isBot }));
    for (const player of room.players.values()) if (player.connected && player.socket) player.socket.emit('room:snapshot', { code: room.code, phase: room.phase, serverTime: now, players });
  }

  io.on('connection', (socket) => {
    socket.on('room:create', ({ name: rawName } = {}) => {
      const name = cleanName(rawName);
      if (!name) return sendError(socket, 'Enter your name');
      if (roomForSocket(socket)) return sendError(socket, 'Leave your current room first');
      const code = makeCode(rooms);
      const room = { code, phase: 'lobby', hostId: socket.id, players: new Map(), createdAt: Date.now(), deleteTimer: null };
      const player = { id: socket.id, name, normalizedName: name.toLocaleLowerCase(), x: map.spawn.x, z: map.spawn.y, angle: 0, ready: true, host: true, color: PLAYER_COLORS[0], connected: true, socket, input: { x: 0, z: 0 }, isBot: false };
      room.players.set(player.id, player); rooms.set(code, room);
      socket.emit('room:created', { code }); socketRooms.set(socket.id, code); socket.join(code); broadcastRoom(room);
    });

    socket.on('room:join', ({ code: rawCode, name: rawName } = {}) => {
      const code = String(rawCode || '').toUpperCase(); const name = cleanName(rawName);
      if (!name) return sendError(socket, 'Enter your name');
      if (!new RegExp(`^[${CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(code)) return sendError(socket, 'Room not found');
      if (roomForSocket(socket)) return sendError(socket, 'Leave your current room first');
      const room = rooms.get(code);
      if (!room) return sendError(socket, 'Room not found');
      if (room.phase !== 'lobby') return sendError(socket, 'Game already started');
      const normalizedName = name.toLocaleLowerCase();
      const returning = [...room.players.values()].find((player) => !player.connected && player.normalizedName === normalizedName && Date.now() - player.disconnectedAt <= RECONNECT_WINDOW_MS);
      if (returning) {
        const oldId = returning.id; room.players.delete(oldId); returning.rejoined = true;
        attachSocket(room, returning, socket); return;
      }
      if (room.players.size >= MAX_ROOM_PLAYERS) return sendError(socket, 'Room full');
      if ([...room.players.values()].some((player) => player.normalizedName === normalizedName)) return sendError(socket, 'Name already in room');
      const usedColors = new Set([...room.players.values()].map((item) => item.color));
      const color = PLAYER_COLORS.find((item) => !usedColors.has(item)) || PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
      const player = { id: socket.id, name, normalizedName, x: map.spawn.x, z: map.spawn.y, angle: 0, ready: false, host: false, color, connected: true, socket, input: { x: 0, z: 0 }, isBot: false };
      room.players.set(player.id, player); attachSocket(room, player, socket);
    });

    socket.on('player:ready', () => {
      const room = roomForSocket(socket); const player = room?.players.get(socket.id);
      if (!room || room.phase !== 'lobby' || !player) return;
      player.ready = !player.ready; broadcastRoom(room);
    });

    socket.on('room:start', () => {
      const room = roomForSocket(socket); const player = room?.players.get(socket.id);
      if (!room || !player || room.phase !== 'lobby' || room.hostId !== socket.id) return;
      const connected = [...room.players.values()].filter((item) => item.connected);
      if (connected.length < 2 || connected.some((item) => item.id !== room.hostId && !item.ready)) return;
      let spawns;
      try { spawns = chooseSpawnPoints(connected.length, map); } catch (error) { sendError(socket, error.message); return; }
      connected.forEach((item, index) => {
        item.x = spawns[index].x; item.z = spawns[index].z; item.angle = 0; item.input = { x: 0, z: 0 };
      });
      room.phase = 'game'; room.startedAt = Date.now(); broadcastRoom(room);
    });

    socket.on('room:leave', () => {
      const room = roomForSocket(socket); const player = room?.players.get(socket.id);
      if (!room || !player) return;
      socketRooms.delete(socket.id); socket.leave(room.code); removePlayer(room, player);
      socket.emit('room:left');
    });

    socket.on('player:input', (input = {}) => {
      const room = roomForSocket(socket); const player = room?.players.get(socket.id);
      if (!room || room.phase !== 'game' || !player) return;
      player.input = validInput(input);
      const length = Math.hypot(player.input.x, player.input.z);
      if (length > 0.02) player.angle = Math.atan2(-player.input.x, -player.input.z);
    });

    socket.on('debug:addBots', ({ count = BOT_MAX_COUNT } = {}) => {
      const room = roomForSocket(socket);
      if (!room || room.phase !== 'lobby' || room.hostId !== socket.id || socket.handshake.auth?.soloBots !== BOT_MAX_COUNT) return;
      const currentBots = [...room.players.values()].filter((player) => player.isBot).length;
      const addCount = Math.max(0, Math.min(BOT_MAX_COUNT - currentBots, MAX_ROOM_PLAYERS - room.players.size, Math.floor(Number(count) || 0)));
      for (let i = 0; i < addCount; i += 1) {
        const id = `bot-${++botCounter}`;
        const usedColors = new Set([...room.players.values()].map((item) => item.color));
        const color = PLAYER_COLORS.find((item) => !usedColors.has(item)) || PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
        room.players.set(id, { id, name: `Wanderer ${currentBots + i + 1}`, normalizedName: id, x: map.spawn.x, z: map.spawn.y, angle: 0, ready: true, host: false, color, connected: true, socket: null, input: { x: 0, z: 0 }, isBot: true, nextWanderAt: 0, wanderUntil: 0 });
      }
      broadcastRoom(room);
    });

    socket.on('net:ping', (sentAt) => socket.emit('net:pong', { sentAt, serverTime: Date.now() }));
    socket.on('disconnect', () => {
      const room = roomForSocket(socket); const player = room?.players.get(socket.id);
      socketRooms.delete(socket.id);
      if (room && player) removePlayer(room, player, { allowRejoin: true });
    });
  });

  const tickTimer = setInterval(() => {
    const now = Date.now(); const delta = GAME_TICK_INTERVAL_MS / 1000;
    for (const room of rooms.values()) {
      if (room.phase === 'game') for (const player of room.players.values()) {
        if (!player.connected && !player.isBot) continue;
        if (player.isBot && now >= (player.nextWanderAt || 0)) {
          player.nextWanderAt = now + BOT_WANDER_INTERVAL_MIN_MS + Math.random() * (BOT_WANDER_INTERVAL_MAX_MS - BOT_WANDER_INTERVAL_MIN_MS);
          const angle = Math.random() * Math.PI * 2;
          player.input = Math.random() < 0.2 ? { x: 0, z: 0 } : { x: Math.cos(angle), z: Math.sin(angle) };
        }
        if (Math.hypot(player.input.x, player.input.z) > 0.02) player.angle = Math.atan2(-player.input.x, -player.input.z);
        const moved = movePlayer(player, player.input, delta, { map, colliders: WORLD_COLLIDERS, speed: PLAYER_MAX_SPEED });
        player.x = moved.x; player.z = moved.z;
      }
      snapshot(room, now);
    }
  }, GAME_TICK_INTERVAL_MS);

  return {
    rooms, io, httpServer,
    async listen() {
      await new Promise((resolveListen, rejectListen) => {
        httpServer.once('error', rejectListen);
        httpServer.listen(port, host, () => { httpServer.off('error', rejectListen); resolveListen(); });
      });
      return httpServer.address().port;
    },
    async close() {
      if (closed) return; closed = true;
      clearInterval(tickTimer);
      for (const room of rooms.values()) { clearTimeout(room.deleteTimer); for (const player of room.players.values()) clearTimeout(player.reconnectTimer); }
      await new Promise((resolveClose) => io.close(() => resolveClose()));
      if (httpServer.listening) await new Promise((resolveClose) => httpServer.close(() => resolveClose()));
    },
    logger,
  };
}
