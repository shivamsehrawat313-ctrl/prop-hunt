import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import map from '../shared/map.js';
import { PROP_TYPES } from '../shared/propTypes.js';
import { movePlayer } from '../shared/movement.js';
import { chooseSpawnPoints, WORLD_COLLIDERS } from '../shared/world.js';
import { isInWater } from '../shared/water.js';
import {
  BOT_MAX_COUNT, BOT_WANDER_INTERVAL_MAX_MS, BOT_WANDER_INTERVAL_MIN_MS,
  GAME_TICK_INTERVAL_MS, GAME_TICK_RATE_HZ, HIDE_PHASE_SEC, HUNTER_STRIKES,
  HUNT_PHASE_SEC, HIDER_SPEED_FACTOR, HUNTER_SPEED_FACTOR, INPUT_MAX_ABS, KNIFE_COOLDOWN_SEC,
  KNIFE_HIT_RADIUS, KNIFE_RANGE,
  MAX_ROOM_PLAYERS, PICK_DEADLINE_BEFORE_HIDE_END_SEC, PLAYER_MAX_SPEED,
  PROP_DECOY_SCALE_MAX, PROP_DECOY_SCALE_MIN, RECONNECT_WINDOW_MS, ROOM_CODE_LENGTH,
  ROUND_RESULTS_DISPLAY_MS,
} from '../shared/constants.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PLAYER_COLORS = ['#7fffe1', '#f6ce72', '#a9a2ff', '#ff9e88', '#8bdbff', '#f6a9d9'];
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const builtClientRoot = resolve(projectRoot, 'dist', 'client');
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const freeProps = (players) => PROP_TYPES.filter((prop) => !players.some((player) => player.disguiseType === prop.id));
const cleanName = (raw) => { const name = String(raw || '').trim().replace(/[\u0000-\u001f]/g, ''); return name.length >= 2 && name.length <= 14 ? name : null; };
const validInput = (input) => { const x = Number(input?.x); const z = Number(input?.z); return { x: Number.isFinite(x) ? Math.max(-INPUT_MAX_ABS, Math.min(INPUT_MAX_ABS, x)) : 0, z: Number.isFinite(z) ? Math.max(-INPUT_MAX_ABS, Math.min(INPUT_MAX_ABS, z)) : 0 }; };

export function createGameServer({ port = 0, host = '127.0.0.1', staticRoot = builtClientRoot, logger = console, testHooks = false, roundTiming = {} } = {}) {
  const rooms = new Map(); const socketRooms = new Map();
  let botCounter = 0; let closed = false;
  const hideMs = roundTiming.hideSeconds == null ? HIDE_PHASE_SEC * 1000 : roundTiming.hideSeconds * 1000;
  const huntMs = roundTiming.huntSeconds == null ? HUNT_PHASE_SEC * 1000 : roundTiming.huntSeconds * 1000;
  const resultMs = roundTiming.resultsSeconds == null ? ROUND_RESULTS_DISPLAY_MS : roundTiming.resultsSeconds * 1000;

  const httpServer = createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/health') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true, game: 'shadow-hunt', tickRate: GAME_TICK_RATE_HZ })); return; }
    let decoded; try { decoded = decodeURIComponent(pathname); } catch { response.writeHead(400); response.end('Bad path'); return; }
    const target = resolve(staticRoot, `.${decoded}`);
    if (target !== staticRoot && !target.startsWith(`${staticRoot}${sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }
    try { const file = await stat(target); if (!file.isFile()) throw new Error('Not a file'); response.writeHead(200, { 'content-type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' }); response.end(await readFile(target)); }
    catch { const accept = request.headers.accept || ''; if (pathname !== '/' && !accept.includes('text/html')) { response.writeHead(404); response.end('Not found'); return; } try { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); response.end(await readFile(resolve(staticRoot, 'index.html'))); } catch { response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Built client not found. Run npm run build first.'); } }
  });
  const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 16_384 });
  const roomForSocket = (socket) => { const code = socketRooms.get(socket.id); return code ? rooms.get(code) : null; };
  const roomCode = (roomsMap) => { for (let i = 0; i < 1000; i += 1) { let code = ''; for (let j = 0; j < ROOM_CODE_LENGTH; j += 1) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]; if (!roomsMap.has(code)) return code; } throw new Error('Room code allocation failed'); };

  function publicRoom(room, viewerId) {
    const me = room.players.get(viewerId);
    return {
      code: room.code, phase: room.phase, hostId: room.hostId, playerId: viewerId,
      deadline: room.deadline, roundNumber: room.roundNumber, hunterId: room.hunterId,
      strikesLeft: room.strikesLeft, results: room.results, catches: room.catches,
      players: [...room.players.values()].filter((p) => p.connected).map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, angle: p.angle, ready: p.ready, host: p.id === room.hostId, color: p.color, role: p.role, caught: p.caught, disguiseLocked: me?.role !== 'hunter' || room.phase !== 'hide' ? p.disguiseLocked : undefined, disguiseType: me?.role === 'hider' || room.phase !== 'hide' ? p.disguiseType : undefined, disguiseScale: me?.role === 'hider' || room.phase !== 'hide' ? p.disguiseScale : undefined })),
      propPicks: me?.role === 'hider' ? [...room.players.values()].filter((p) => p.role === 'hider' && p.disguiseType).map((p) => ({ id: p.id, name: p.name, prop: p.disguiseType, locked: p.disguiseLocked })) : [],
      props: PROP_TYPES.map(({ id, label, model, preview }) => ({ id, label, model, preview, ...(me?.role === 'hider' ? { takenBy: [...room.players.values()].find((p) => p.role === 'hider' && p.disguiseType === id)?.name || null } : {}) })),
      tickRate: GAME_TICK_RATE_HZ,
    };
  }
  function broadcastRoom(room) { for (const p of room.players.values()) if (p.connected && p.socket) { const state = publicRoom(room, p.id); p.socket.emit('room:update', state); if (room.phase !== 'lobby') p.socket.emit('round:update', state); } }
  function sendError(socket, message) { socket.emit('room:error', { message }); }
  function clearTimers(room) { clearTimeout(room.deleteTimer); clearTimeout(room.resultTimer); }
  function resetPlayerRound(p) { p.role = null; p.caught = false; p.disguiseType = null; p.disguiseLocked = false; p.disguiseScale = 1; p.lastStrikeAt = 0; p.input = { x: 0, z: 0 }; }
  function returnToLobby(room) {
    room.phase = 'lobby'; room.deadline = 0; room.roundNumber = 0; room.results = null; room.catches = [];
    for (const p of room.players.values()) {
      resetPlayerRound(p);
      p.ready = p.id === room.hostId;
      p.x = map.spawn.x; p.z = map.spawn.y;
    }
    broadcastRoom(room);
  }
  function finishRound(room, winner, reason) {
    if (room.phase === 'results' || room.phase === 'lobby') return;
    room.phase = 'results'; room.deadline = 0; room.results = { winner, reason, caught: room.catches.map((item) => ({ ...item })), at: Date.now() };
    for (const p of room.players.values()) p.input = { x: 0, z: 0 };
    broadcastRoom(room);
    if (resultMs > 0) {
      clearTimeout(room.resultTimer);
      room.resultTimer = setTimeout(() => { if (room.phase === 'results') returnToLobby(room); }, resultMs);
      room.resultTimer.unref?.();
    }
  }
  function beginRound(room) {
    clearTimeout(room.resultTimer);
    const players = [...room.players.values()].filter((p) => p.connected);
    if (players.length < 2) { room.phase = 'lobby'; room.deadline = 0; broadcastRoom(room); return; }
    const spawns = chooseSpawnPoints(players.length, map);
    const hunter = players[Math.floor(Math.random() * players.length)];
    room.phase = 'hide'; room.roundNumber += 1; room.hunterId = hunter.id; room.strikesLeft = HUNTER_STRIKES; room.results = null; room.catches = []; room.startedAt = Date.now(); room.deadline = room.startedAt + hideMs;
    players.forEach((p, index) => { resetPlayerRound(p); p.role = p.id === hunter.id ? 'hunter' : 'hider'; p.x = spawns[index].x; p.z = spawns[index].z; p.angle = 0; });
    broadcastRoom(room);
  }
  function beginHunt(room, now) {
    const hiders = [...room.players.values()].filter((p) => p.connected && p.role === 'hider' && !p.caught);
    for (const p of hiders) {
      if (!p.disguiseType) { const chosen = freeProps(hiders).sort(() => Math.random() - 0.5)[0]; p.disguiseType = chosen?.id || PROP_TYPES[0].id; }
      p.disguiseLocked = true;
    }
    room.phase = 'hunt'; room.deadline = now + huntMs; broadcastRoom(room);
  }
  function addBots(room, count) {
    const current = [...room.players.values()].filter((p) => p.isBot).length;
    const amount = Math.max(0, Math.min(BOT_MAX_COUNT - current, MAX_ROOM_PLAYERS - room.players.size, Math.floor(count)));
    for (let i = 0; i < amount; i += 1) { const id = `bot-${++botCounter}`; room.players.set(id, { id, name: `Bot ${current + i + 1}`, normalizedName: id, x: map.spawn.x, z: map.spawn.y, angle: 0, ready: true, connected: true, socket: null, isBot: true, input: { x: 0, z: 0 }, color: PLAYER_COLORS[room.players.size % PLAYER_COLORS.length], nextWanderAt: 0, role: null, caught: false }); }
  }
  function removePlayer(room, player, disconnected = false) {
    const wasHunter = room.phase !== 'lobby' && player.id === room.hunterId;
    room.players.delete(player.id);
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find((p) => p.connected)?.id || null;
    const active = [...room.players.values()].filter((p) => p.connected);
    if (wasHunter) finishRound(room, 'hiders', 'Hunter left');
    else if (room.phase !== 'lobby' && player.role === 'hider') {
      if (!room.catches.some((item) => item.id === player.id)) room.catches.push({ id: player.id, name: player.name, left: true });
      if (![...room.players.values()].some((p) => p.connected && p.role === 'hider' && !p.caught)) finishRound(room, 'hunter', 'All hiders left');
    }
    if (active.length <= 1 && room.phase === 'lobby') { room.deadline = 0; room.catches = []; room.results = null; for (const p of active) resetPlayerRound(p); }
    if (![...room.players.values()].some((p) => p.connected && !p.isBot)) { room.deleteTimer = setTimeout(() => rooms.delete(room.code), RECONNECT_WINDOW_MS); room.deleteTimer.unref?.(); }
    if (!room.players.size) rooms.delete(room.code); else broadcastRoom(room);
  }
  function spawn(room, player) {
    const others = [...room.players.values()].filter((p) => p.connected && p.id !== player.id);
    const next = chooseSpawnPoints(others.length + 1, map).find((point) => others.every((p) => Math.hypot(p.x - point.x, p.z - point.z) > 0.65));
    return next || { x: map.spawn.x, z: map.spawn.y };
  }
  function strike(room, hunter, aim) {
    const now = Date.now();
    if (room.phase !== 'hunt' || hunter.role !== 'hunter' || hunter.caught || room.strikesLeft <= 0) return;
    if (now - (hunter.lastStrikeAt || 0) < KNIFE_COOLDOWN_SEC * 1000) return;
    hunter.lastStrikeAt = now; room.strikesLeft -= 1;
    let ax = Number(aim?.x); let az = Number(aim?.z); const length = Math.hypot(ax, az);
    if (!Number.isFinite(length) || length < 0.01) { ax = -Math.sin(hunter.angle); az = -Math.cos(hunter.angle); } else { ax /= length; az /= length; }
    const candidates = [];
    for (const p of room.players.values()) if (p.connected && p.role === 'hider' && !p.caught) { const dx = p.x - hunter.x; const dz = p.z - hunter.z; const along = dx * ax + dz * az; const side = Math.abs(dx * az - dz * ax); if (along > 0 && along <= KNIFE_RANGE && side <= KNIFE_HIT_RADIUS) candidates.push({ kind: 'hider', target: p, along }); }
    candidates.sort((a, b) => a.along - b.along);
    const hit = candidates[0]; let result = 'miss';
    if (hit?.kind === 'hider') { const p = hit.target; p.caught = true; p.input = { x: 0, z: 0 }; result = 'caught'; room.catches.push({ id: p.id, name: p.name }); }
    for (const p of room.players.values()) if (p.connected && p.socket) p.socket.emit('round:effect', { kind: 'knife', result, x: hunter.x, z: hunter.z, endX: hunter.x + ax * Math.min(KNIFE_RANGE, hit?.along || KNIFE_RANGE), endZ: hunter.z + az * Math.min(KNIFE_RANGE, hit?.along || KNIFE_RANGE) });
    if (![...room.players.values()].some((p) => p.connected && p.role === 'hider' && !p.caught)) finishRound(room, 'hunter', 'All hiders caught');
    else if (room.strikesLeft === 0) finishRound(room, 'hiders', 'Hunter out of strikes');
    else broadcastRoom(room);
  }

  io.on('connection', (socket) => {
    socket.on('room:create', ({ name: rawName } = {}) => {
      const name = cleanName(rawName); if (!name) return sendError(socket, 'Enter your name'); if (roomForSocket(socket)) return sendError(socket, 'Leave your current room first');
      const code = roomCode(rooms); const room = { code, phase: 'lobby', hostId: socket.id, players: new Map(), roundNumber: 0, hunterId: null, strikesLeft: HUNTER_STRIKES, deadline: 0, results: null, catches: [], createdAt: Date.now() };
      const player = { id: socket.id, name, normalizedName: name.toLowerCase(), x: map.spawn.x, z: map.spawn.y, angle: 0, ready: true, connected: true, socket, input: { x: 0, z: 0 }, color: PLAYER_COLORS[0], role: null, caught: false, disguiseType: null, disguiseLocked: false };
      room.players.set(player.id, player); rooms.set(code, room); socketRooms.set(socket.id, code); socket.join(code); socket.emit('room:created', { code }); broadcastRoom(room);
    });
    socket.on('room:join', ({ code: rawCode, name: rawName } = {}) => {
      const code = String(rawCode || '').toUpperCase(); const name = cleanName(rawName); if (!name) return sendError(socket, 'Enter your name');
      if (!new RegExp(`^[${CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(code) || !rooms.has(code)) return sendError(socket, 'Room not found');
      const room = rooms.get(code); if (room.phase !== 'lobby') return sendError(socket, 'Game already started'); if (roomForSocket(socket)) return sendError(socket, 'Leave your current room first');
      if (room.players.size >= MAX_ROOM_PLAYERS) return sendError(socket, 'Room full');
      if ([...room.players.values()].some((p) => p.normalizedName === name.toLowerCase())) return sendError(socket, 'Name already in room');
      const used = new Set([...room.players.values()].map((p) => p.color)); const player = { id: socket.id, name, normalizedName: name.toLowerCase(), x: map.spawn.x, z: map.spawn.y, angle: 0, ready: false, connected: true, socket, input: { x: 0, z: 0 }, color: PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[room.players.size % PLAYER_COLORS.length], role: null, caught: false, disguiseType: null, disguiseLocked: false };
      room.players.set(player.id, player); socketRooms.set(socket.id, code); socket.join(code); socket.emit('room:joined', { code }); broadcastRoom(room);
    });
    socket.on('player:ready', () => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); if (!room || room.phase !== 'lobby' || !p) return; p.ready = !p.ready; broadcastRoom(room); });
    socket.on('room:start', () => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); if (!room || !p || room.phase !== 'lobby' || room.hostId !== p.id) return; const players = [...room.players.values()].filter((item) => item.connected); if (players.length < 2 || players.some((item) => item.id !== room.hostId && !item.ready)) return; beginRound(room); });
    socket.on('room:leave', () => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); if (!room || !p) return; socketRooms.delete(socket.id); socket.leave(room.code); removePlayer(room, p); socket.emit('room:left'); });
    socket.on('round:restart', () => { const room = roomForSocket(socket); if (room?.phase === 'results' && room.hostId === socket.id) beginRound(room); });
    socket.on('round:back-to-lobby', () => { const room = roomForSocket(socket); if (!room || room.phase !== 'results' || room.hostId !== socket.id) return; clearTimeout(room.resultTimer); returnToLobby(room); });
    socket.on('disguise:choose', ({ type } = {}) => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); if (!room || room.phase !== 'hide' || p?.role !== 'hider' || p.disguiseLocked) return; if (!PROP_TYPES.some((prop) => prop.id === type)) return sendError(socket, 'Unknown prop'); if ([...room.players.values()].some((other) => other.id !== p.id && other.role === 'hider' && other.disguiseType === type)) return sendError(socket, 'Already taken'); p.disguiseType = type; p.disguiseScale = PROP_DECOY_SCALE_MIN + Math.random() * (PROP_DECOY_SCALE_MAX - PROP_DECOY_SCALE_MIN); broadcastRoom(room); });
    socket.on('disguise:lock', () => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); if (!room || room.phase !== 'hide' || p?.role !== 'hider' || !p.disguiseType || p.disguiseLocked) return; p.disguiseLocked = true; broadcastRoom(room); });
    socket.on('hunter:strike', (aim = {}) => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); if (room && p) strike(room, p, aim); });
    socket.on('player:input', (input = {}) => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); if (!room || !p || !['hide', 'hunt'].includes(room.phase) || p.caught || (room.phase === 'hide' && p.role === 'hunter')) return; p.input = validInput(input); if (Math.hypot(p.input.x, p.input.z) > 0.02) p.angle = Math.atan2(-p.input.x, -p.input.z); });
    socket.on('debug:addBots', ({ count = BOT_MAX_COUNT } = {}) => { const room = roomForSocket(socket); if (room?.phase === 'lobby' && room.hostId === socket.id && socket.handshake.auth?.soloBots === BOT_MAX_COUNT) { addBots(room, count); broadcastRoom(room); } });
    if (testHooks && socket.handshake.auth?.milestone3Test) socket.on('test:teleport', ({ playerId, x, z } = {}) => { const room = roomForSocket(socket); const p = room?.players.get(playerId); if (room && p && Number.isFinite(x) && Number.isFinite(z) && !isInWater(x, z, map)) { p.x = x; p.z = z; p.input = { x: 0, z: 0 }; } });
    socket.on('net:ping', (sentAt) => socket.emit('net:pong', { sentAt, serverTime: Date.now() }));
    socket.on('disconnect', () => { const room = roomForSocket(socket); const p = room?.players.get(socket.id); socketRooms.delete(socket.id); if (room && p) removePlayer(room, p, true); });
  });

  const tickTimer = setInterval(() => {
    const now = Date.now(); const dt = GAME_TICK_INTERVAL_MS / 1000;
    for (const room of rooms.values()) {
      if (room.phase === 'hide' && now >= room.deadline - PICK_DEADLINE_BEFORE_HIDE_END_SEC * 1000) {
        let changed = false; const hiders = [...room.players.values()].filter((p) => p.connected && p.role === 'hider');
        for (const p of hiders) if (!p.disguiseType) { const choice = freeProps(hiders).sort(() => Math.random() - 0.5)[0]; if (choice) { p.disguiseType = choice.id; p.disguiseScale = PROP_DECOY_SCALE_MIN + Math.random() * (PROP_DECOY_SCALE_MAX - PROP_DECOY_SCALE_MIN); changed = true; } }
        if (changed) broadcastRoom(room);
      }
      if (room.phase === 'hide' && now >= room.deadline) beginHunt(room, now);
      else if (room.phase === 'hunt' && now >= room.deadline) finishRound(room, 'hiders', 'Time expired');
      if (room.phase === 'hide' || room.phase === 'hunt') for (const p of room.players.values()) {
        if (!p.connected && !p.isBot || p.caught || room.phase === 'hide' && p.role === 'hunter') continue;
        if (p.isBot && now >= (p.nextWanderAt || 0)) { p.nextWanderAt = now + BOT_WANDER_INTERVAL_MIN_MS + Math.random() * (BOT_WANDER_INTERVAL_MAX_MS - BOT_WANDER_INTERVAL_MIN_MS); const angle = Math.random() * Math.PI * 2; p.input = Math.random() < 0.2 ? { x: 0, z: 0 } : { x: Math.cos(angle), z: Math.sin(angle) }; }
        const speedFactor = p.role === 'hunter' ? HUNTER_SPEED_FACTOR : p.role === 'hider' && p.disguiseType ? HIDER_SPEED_FACTOR : 1;
        const moved = movePlayer(p, p.input, dt, { map, colliders: WORLD_COLLIDERS, speed: PLAYER_MAX_SPEED * speedFactor }); p.x = moved.x; p.z = moved.z;
      }
      const players = [...room.players.values()].filter((p) => p.connected);
      for (const p of room.players.values()) if (p.connected && p.socket) {
        const snapshotPlayers = players.map((item) => {
          const state = { id: item.id, name: item.name, x: item.x, z: item.z, angle: item.angle, ready: item.ready, role: item.role, caught: item.caught };
          if (p.role !== 'hunter' || room.phase !== 'hide') Object.assign(state, { disguiseType: item.disguiseType, disguiseLocked: item.disguiseLocked, disguiseScale: item.disguiseScale });
          return state;
        });
      p.socket.emit('room:snapshot', { code: room.code, phase: room.phase, roundNumber: room.roundNumber, serverTime: now, deadline: room.deadline, players: snapshotPlayers });
      }
    }
  }, GAME_TICK_INTERVAL_MS);
  return { rooms, io, httpServer, async listen() { await new Promise((resolveListen, reject) => { httpServer.once('error', reject); httpServer.listen(port, host, () => { httpServer.off('error', reject); resolveListen(); }); }); return httpServer.address().port; }, async close() { if (closed) return; closed = true; clearInterval(tickTimer); for (const room of rooms.values()) clearTimers(room); await new Promise((resolveClose) => io.close(resolveClose)); if (httpServer.listening) await new Promise((resolveClose) => httpServer.close(resolveClose)); }, logger };
}
