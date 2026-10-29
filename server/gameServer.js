import { randomInt, randomUUID } from 'node:crypto';
import { makeViewerState, hasLineOfSight } from './visibility.js';
import map from '../shared/map.js';
import { DECOY_ENTITIES } from '../shared/decoys.js';
import { WORLD_COLLIDERS, WORLD_VISION_BLOCKERS } from '../shared/world.js';
import { movePlayer } from '../shared/movement.js';
import { terrainHeightAt } from '../shared/terrainHeight.js';
import {
  CROSSBOW_RELOAD_MS, CROSSBOW_RANGE, DISGUISE_LOCK_CLUSTER_COUNT, DISGUISE_LOCK_RADIUS,
  CROSSBOW_CONE_DEGREES, GAME_TICK_HZ, HIDE_PHASE_SECONDS, HUNTER_CATCH_SCORE, HUNTER_CLOSE_CIRCLE_RANGE,
  HUNTER_CONE_RANGE, HUNTER_SWEEP_BONUS, HUNTER_TOTAL_STRIKES, HUNT_PHASE_SECONDS,
  KNIFE_COOLDOWN_MS, KNIFE_RANGE, MAX_PLAYERS, MIN_PLAYERS, PISTOL_CONE_DEGREES, PISTOL_COOLDOWN_MS,
  PISTOL_RANGE, PISTOL_REVEAL_MS, PISTOL_REVEAL_RADIUS, PLAYER_HIT_RADIUS, PROP_STRIKE_RADIUS, PLAYER_NAME_MAX_LENGTH, PLAYER_NAME_MIN_LENGTH,
  PLAYER_REJOIN_SECONDS, ROUND_INTERMISSION_MS, HIDER_DISGUISE_SPEED_FACTOR,
  HIDER_SURVIVAL_BONUS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
  DEBUG_BOT_MAX_COUNT, DEBUG_BOT_RETHINK_MS, SPLASH_HEARING_DISTANCE, WATER_SPLASH_EVENT_COOLDOWN_MS,
} from '../shared/constants.js';
import { isInWater } from '../shared/water.js';

const WEAPONS = new Set(['knife', 'pistol', 'crossbow']);
const DISGUISES = new Set(['stump', 'boulder', 'bush']);

function cleanName(value) {
  return String(value ?? '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, PLAYER_NAME_MAX_LENGTH);
}

function randomCode() {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('');
}

export function createGameService(io, {
  now = () => Date.now(), random = Math.random, setIntervalFn = setInterval, clearIntervalFn = clearInterval,
  hideMs = HIDE_PHASE_SECONDS * 1000, huntMs = HUNT_PHASE_SECONDS * 1000,
  intermissionMs = ROUND_INTERMISSION_MS, colliders = WORLD_COLLIDERS, visionBlockers = WORLD_VISION_BLOCKERS, decoys = DECOY_ENTITIES,
} = {}) {
  const rooms = new Map();
  const connections = new Map();
  const tickMs = 1000 / GAME_TICK_HZ;

  const publicRoom = (room, time = now(), viewerId = null) => makeViewerState(room, time, viewerId, { blockers: visionBlockers, decoys });
  const emitRoom = (room, event = 'room:state') => {
    const time = now();
    for (const player of room.players.values()) {
      if (!player.connected || player.isBot) continue;
      const socket = io.sockets.sockets.get(player.id);
      socket?.emit(event, publicRoom(room, time, player.id));
    }
  };
  const sendError = (socket, code) => socket?.emit('room:error', { code, message: ({
    NOT_FOUND: 'Room not found', FULL: 'Room full', STARTED: 'Game already started', NAME: 'Enter your name',
    BAD_CODE: 'Enter a valid 4-letter room code', HOST: 'Only the host can do that', READY: 'All players must be ready',
    MIN_PLAYERS: 'At least 2 players are needed', PHASE: 'That action is unavailable now', DISGUISE: 'Choose a disguise first',
    CLUSTER: 'Find a cluster of the same prop', WEAPON: 'Choose a valid weapon', STRIKES: 'No strikes remain', COOLDOWN: 'Weapon is reloading',
  })[code] || 'Something went wrong' });

  function createRoom(socket, name) {
    name = cleanName(name);
    if (name.length < PLAYER_NAME_MIN_LENGTH) return sendError(socket, 'NAME');
    let code = randomCode(); while (rooms.has(code)) code = randomCode();
    const time = now();
    const room = { code, hostId: socket.id, phase: 'lobby', phaseEndsAt: 0, round: 0, maxRounds: 0, hunterId: null, strikes: HUNTER_TOTAL_STRIKES, weapon: 'knife', winner: null, hunterRevealedUntil: 0, players: new Map(), hunted: new Set(), cooldownUntil: 0, decoys, createdAt: time };
    rooms.set(code, room);
    attachPlayer(room, socket, name, time);
    socket.emit('room:created', { code });
    emitRoom(room);
  }

  function attachPlayer(room, socket, name, time) {
    const prior = [...room.players.values()].find((player) => player.name.toLowerCase() === name.toLowerCase() && !player.connected && time - player.disconnectedAt <= PLAYER_REJOIN_SECONDS * 1000);
    if (prior) {
      const oldId = prior.id;
      room.players.delete(prior.id);
      Object.assign(prior, { id: socket.id, connected: true, disconnectedAt: 0, input: { x: 0, z: 0 } });
      room.players.set(socket.id, prior);
      if (room.hunterId === oldId) room.hunterId = socket.id;
      if (room.hunted.delete(oldId)) room.hunted.add(socket.id);
    } else {
      const spawn = map.spawn;
      room.players.set(socket.id, { id: socket.id, name, ready: false, role: null, x: spawn.x, y: terrainHeightAt(spawn.x, spawn.y, map), z: spawn.y, alive: true, caught: false, disguise: null, locked: false, score: 0, hunted: false, moving: false, aim: { x: 0, z: 1 }, input: { x: 0, z: 0 }, connected: true, disconnectedAt: 0, lastStrikeAt: 0, weapon: 'knife' });
    }
    connections.set(socket.id, room.code);
    socket.join(room.code);
  }

  function findRoom(socket) { const code = connections.get(socket.id); return rooms.get(code); }

  function chooseHunter(room) {
    const remaining = [...room.players.values()].filter((player) => !room.hunted.has(player.id));
    if (!remaining.length) return null;
    return remaining[Math.floor(random() * remaining.length)];
  }

  function startRound(room, time = now()) {
    const hunter = chooseHunter(room);
    if (!hunter || room.players.size < MIN_PLAYERS) return false;
    room.round += 1;
    room.hunterId = hunter.id;
    room.phase = 'hide'; room.phaseEndsAt = time + hideMs; room.winner = null;
    room.strikes = HUNTER_TOTAL_STRIKES; room.cooldownUntil = 0; room.hunterRevealedUntil = 0;
    for (const player of room.players.values()) {
      player.role = player.id === hunter.id ? 'hunter' : 'hider';
      player.alive = true; player.caught = false; player.disguise = null; player.locked = false;
      player.input = { x: 0, z: 0 }; player.moving = false; player.weapon = 'knife';
      if (player.isBot && player.role === 'hider') player.disguise = ['stump', 'boulder', 'bush'][Math.floor(random() * 3)];
    }
    emitRoom(room);
    return true;
  }

  function finishRound(room, winner, time = now()) {
    if (room.phase !== 'hide' && room.phase !== 'hunt') return;
    room.phase = 'scoreboard'; room.winner = winner; room.phaseEndsAt = time + intermissionMs;
    const hunter = room.players.get(room.hunterId);
    if (hunter) {
      const caught = [...room.players.values()].filter((p) => p.role === 'hider' && p.caught).length;
      hunter.score += caught * HUNTER_CATCH_SCORE;
      if (winner === 'hunter' && caught === room.players.size - 1) hunter.score += HUNTER_SWEEP_BONUS;
      room.hunted.add(hunter.id); hunter.hunted = true;
    }
    for (const player of room.players.values()) if (player.role === 'hider' && !player.caught && winner === 'hiders') {
      const survived = Math.max(0, Math.floor((time - (room.huntStartedAt || time)) / 1000));
      player.score += survived + HIDER_SURVIVAL_BONUS;
    }
    emitRoom(room);
  }

  function removePlayer(room, socket, time = now()) {
    const player = room.players.get(socket.id);
    if (!player) return;
    socket.leave(room.code); connections.delete(socket.id);
    room.players.delete(player.id);
    if (player.id === room.hostId) room.hostId = [...room.players.keys()][0] || null;
    if (player.id === room.hunterId && ['hide', 'hunt'].includes(room.phase)) finishRound(room, 'hiders', time);
    if (!room.players.size || !room.hostId) rooms.delete(room.code);
    else emitRoom(room);
  }

  function inDecoyCluster(room, player, type) {
    const nearby = room.decoys.filter((item) => item.type === type && Math.hypot(item.x - player.x, item.z - player.z) <= DISGUISE_LOCK_RADIUS);
    return nearby.length >= DISGUISE_LOCK_CLUSTER_COUNT;
  }

  function strike(room, attacker, time, payload) {
    if (room.phase !== 'hunt' || attacker.id !== room.hunterId || room.strikes <= 0) return sendError(io.sockets.sockets.get(attacker.id), room.strikes <= 0 ? 'STRIKES' : 'PHASE');
    const weapon = attacker.weapon;
    if (!WEAPONS.has(weapon)) return sendError(io.sockets.sockets.get(attacker.id), 'WEAPON');
    const cooldown = weapon === 'knife' ? KNIFE_COOLDOWN_MS : weapon === 'crossbow' ? CROSSBOW_RELOAD_MS : PISTOL_COOLDOWN_MS;
    if (time - attacker.lastStrikeAt < cooldown || time < room.cooldownUntil) return sendError(io.sockets.sockets.get(attacker.id), 'COOLDOWN');
    attacker.lastStrikeAt = time; room.cooldownUntil = weapon === 'crossbow' ? time + CROSSBOW_RELOAD_MS : time + (weapon === 'pistol' ? PISTOL_COOLDOWN_MS : 0);
    room.strikes -= 1;
    const range = weapon === 'knife' ? KNIFE_RANGE : weapon === 'crossbow' ? CROSSBOW_RANGE : PISTOL_RANGE;
    const aim = payload?.aim || attacker.aim;
    const aimLength = Math.hypot(Number(aim.x) || 0, Number(aim.z) || 0) || 1;
    const ax = (Number(aim.x) || 0) / aimLength; const az = (Number(aim.z) || 0) / aimLength;
    const candidates = [];
    const addCandidate = (kind, id, x, z, hitRadius) => {
      const dx = x - attacker.x; const dz = z - attacker.z; const distance = Math.hypot(dx, dz);
      if (distance > range) return;
      if (!hasLineOfSight(attacker, { x, z }, visionBlockers)) return;
      if (weapon === 'knife') { candidates.push({ kind, id, distance, along: distance }); return; }
      const along = dx * ax + dz * az;
      const perpendicular = Math.abs(dx * az - dz * ax);
      const angle = Math.acos(Math.max(-1, Math.min(1, along / (distance || 1))));
      const maxAngle = weapon === 'pistol' ? PISTOL_CONE_DEGREES * Math.PI / 360 : CROSSBOW_CONE_DEGREES * Math.PI / 360;
      if (along >= 0 && perpendicular <= hitRadius && angle <= maxAngle) candidates.push({ kind, id, distance, along });
    };
    for (const decoy of room.decoys) addCandidate('decoy', decoy.id, decoy.x, decoy.z, PROP_STRIKE_RADIUS * decoy.scale);
    for (const target of room.players.values()) if (target.role === 'hider' && target.alive && target.connected) addCandidate('hider', target.id, target.x, target.z, PLAYER_HIT_RADIUS);
    candidates.sort((a, b) => (weapon === 'knife' ? a.distance - b.distance : a.along - b.along));
    const selected = candidates[0];
    const caught = selected?.kind === 'hider' ? room.players.get(selected.id) : null;
    if (caught) { caught.caught = true; caught.alive = false; caught.input = { x: 0, z: 0 }; }
    if (weapon === 'pistol') room.hunterRevealedUntil = time + PISTOL_REVEAL_MS;
    const strikeEvent = { attackerId: attacker.id, weapon, hit: Boolean(caught), targetType: selected?.kind || null, caughtId: caught?.id || null, strikes: room.strikes, revealedUntil: room.hunterRevealedUntil, aim: { x: ax, z: az } };
    for (const recipient of room.players.values()) {
      if (!recipient.connected || recipient.isBot) continue;
      const socket = io.sockets.sockets.get(recipient.id);
      const maySeeLocation = recipient.id === attacker.id || (weapon === 'pistol' && recipient.role === 'hider' && Math.hypot(recipient.x - attacker.x, recipient.z - attacker.z) <= PISTOL_REVEAL_RADIUS);
      const privateEvent = recipient.id === attacker.id
        ? { ...strikeEvent, at: { x: attacker.x, z: attacker.z } }
        : { ...strikeEvent, attackerId: undefined, ...(maySeeLocation ? { at: { x: attacker.x, z: attacker.z } } : {}) };
      socket?.emit('game:strike', privateEvent);
    }
    if ([...room.players.values()].filter((player) => player.role === 'hider' && player.alive).length === 0) finishRound(room, 'hunter', time);
    else if (room.strikes === 0) finishRound(room, 'hiders', time);
    emitRoom(room);
  }

  function onConnection(socket) {
    socket.on('room:create', ({ name } = {}) => createRoom(socket, name));
    socket.on('debug:addBots', ({ count } = {}) => {
      if (process.env.NODE_ENV === 'production') return;
      const room = findRoom(socket); if (!room || socket.id !== room.hostId || room.phase !== 'lobby') return;
      const add = Math.min(DEBUG_BOT_MAX_COUNT, Math.max(0, Math.floor(Number(count) || 0)));
      const names = ['Moss Bot', 'Fern Bot'];
      for (let i = 0; i < add && room.players.size < MAX_PLAYERS; i += 1) {
        const id = `bot-${randomUUID()}`; const spawn = map.spawn;
        room.players.set(id, { id, name: names[i], isBot: true, ready: true, role: null, x: spawn.x, y: terrainHeightAt(spawn.x, spawn.y, map), z: spawn.y, alive: true, caught: false, disguise: null, locked: false, score: 0, hunted: false, moving: false, aim: { x: 0, z: 1 }, input: { x: 0, z: 0 }, connected: true, disconnectedAt: 0, lastStrikeAt: 0, weapon: 'pistol', botNextThinkAt: 0, botTarget: null });
      }
      emitRoom(room);
    });
    socket.on('room:join', ({ name, code } = {}) => {
      name = cleanName(name); code = String(code || '').toUpperCase();
      if (name.length < PLAYER_NAME_MIN_LENGTH) return sendError(socket, 'NAME');
      if (code.length !== ROOM_CODE_LENGTH || [...code].some((character) => !ROOM_CODE_ALPHABET.includes(character))) return sendError(socket, 'BAD_CODE');
      const room = rooms.get(code);
      if (!room) return sendError(socket, 'NOT_FOUND');
      const reconnect = [...room.players.values()].some((p) => !p.connected && p.name.toLowerCase() === name.toLowerCase() && now() - p.disconnectedAt <= PLAYER_REJOIN_SECONDS * 1000);
      if (room.phase !== 'lobby' && !reconnect) return sendError(socket, 'STARTED');
      if (room.players.size >= MAX_PLAYERS && !reconnect) return sendError(socket, 'FULL');
      attachPlayer(room, socket, name, now()); socket.emit('room:joined', { code }); emitRoom(room);
    });
    socket.on('lobby:ready', () => { const room = findRoom(socket); const p = room?.players.get(socket.id); if (room?.phase === 'lobby' && p) { p.ready = !p.ready; emitRoom(room); } });
    socket.on('lobby:start', () => {
      const room = findRoom(socket); if (!room) return;
      if (socket.id !== room.hostId) return sendError(socket, 'HOST');
      if (room.phase !== 'lobby') return sendError(socket, 'PHASE');
      if (room.players.size < MIN_PLAYERS) return sendError(socket, 'MIN_PLAYERS');
      if ([...room.players.values()].some((p) => !p.ready)) return sendError(socket, 'READY');
      room.hunted.clear(); room.round = 0; for (const p of room.players.values()) { p.score = 0; p.hunted = false; }
      room.maxRounds = room.players.size; startRound(room);
    });
    socket.on('match:next', () => {
      const room = findRoom(socket); if (!room || socket.id !== room.hostId || room.phase !== 'scoreboard') return;
      if (room.hunted.size >= room.players.size) { room.phase = 'final'; room.phaseEndsAt = 0; emitRoom(room); }
      else startRound(room);
    });
    socket.on('match:again', () => {
      const room = findRoom(socket); if (!room || socket.id !== room.hostId || room.phase !== 'final') return;
      room.phase = 'lobby'; room.hunted.clear(); room.round = 0; room.maxRounds = 0;
      for (const p of room.players.values()) { p.ready = p.id === room.hostId; p.role = null; p.score = 0; }
      emitRoom(room);
    });
    socket.on('weapon:select', ({ weapon } = {}) => { const room = findRoom(socket); const player = room?.players.get(socket.id); if (room?.phase === 'hide' && player?.role === 'hunter' && WEAPONS.has(weapon)) { player.weapon = weapon; room.weapon = weapon; emitRoom(room); } });
    socket.on('disguise:select', ({ type } = {}) => { const room = findRoom(socket); const player = room?.players.get(socket.id); if ((room?.phase === 'hide' || room?.phase === 'hunt') && player?.role === 'hider' && player.alive && DISGUISES.has(type)) { player.disguise = type; player.locked = false; emitRoom(room); } });
    socket.on('disguise:lock', () => {
      const room = findRoom(socket); const player = room?.players.get(socket.id);
      if (!player || player.role !== 'hider' || !player.disguise) return sendError(socket, 'DISGUISE');
      const nearby = room.decoys.filter((item) => item.type === player.disguise && Math.hypot(item.x - player.x, item.z - player.z) <= DISGUISE_LOCK_RADIUS);
      if (nearby.length < DISGUISE_LOCK_CLUSTER_COUNT) return sendError(socket, 'CLUSTER');
      player.locked = !player.locked;
      if (player.locked) { const match = nearby.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0]; player.disguiseScale = match.scale; player.disguiseRotation = match.rotation; }
      emitRoom(room);
    });
    socket.on('player:input', (input = {}) => {
      const room = findRoom(socket); const player = room?.players.get(socket.id); if (!player?.connected || !player.alive || (room.phase === 'hide' && player.role === 'hunter') || !['hide', 'hunt'].includes(room.phase)) return;
      player.input = { x: Math.max(-1, Math.min(1, Number(input.x) || 0)), z: Math.max(-1, Math.min(1, Number(input.z) || 0)) };
      if (input.aim && Number.isFinite(input.aim.x) && Number.isFinite(input.aim.z)) player.aim = input.aim;
      player.moving = Math.hypot(player.input.x, player.input.z) > 0.1;
    });
    socket.on('game:strike', (payload = {}) => { const room = findRoom(socket); const player = room?.players.get(socket.id); if (room && player) strike(room, player, now(), payload); });
    socket.on('room:leave', () => { const room = findRoom(socket); if (room) removePlayer(room, socket); });
    socket.on('disconnect', () => {
      const room = findRoom(socket); const player = room?.players.get(socket.id); if (!room || !player) return;
      connections.delete(socket.id); player.connected = false; player.disconnectedAt = now(); player.input = { x: 0, z: 0 }; player.moving = false;
      if (player.id === room.hostId) room.hostId = [...room.players.values()].find((p) => p.connected && p.id !== player.id)?.id || player.id;
      if (player.id === room.hunterId && ['hide', 'hunt'].includes(room.phase)) finishRound(room, 'hiders');
      emitRoom(room);
    });
  }

  const timer = setIntervalFn(() => {
    const time = now();
    for (const room of rooms.values()) {
      if (room.phase === 'hide' && time >= room.phaseEndsAt) { room.phase = 'hunt'; room.phaseEndsAt = time + huntMs; room.huntStartedAt = time; emitRoom(room); }
      else if (room.phase === 'hunt' && time >= room.phaseEndsAt) finishRound(room, 'hiders', time);
      else if (room.phase === 'scoreboard' && time >= room.phaseEndsAt) {
        if (room.hunted.size >= room.players.size) { room.phase = 'final'; room.phaseEndsAt = 0; emitRoom(room); }
      }
      if (room.phase === 'hide' || room.phase === 'hunt') {
        for (const bot of room.players.values()) if (bot.isBot && bot.alive) {
          if (bot.role === 'hunter' && room.phase === 'hunt') {
            const target = [...room.players.values()].find((player) => player.role === 'hider' && player.alive && player.connected);
            if (target) {
              const dx = target.x - bot.x; const dz = target.z - bot.z; const length = Math.hypot(dx, dz) || 1;
              bot.aim = { x: dx / length, z: dz / length };
              if (Math.hypot(dx, dz) <= PISTOL_RANGE && time - bot.lastStrikeAt >= PISTOL_COOLDOWN_MS) strike(room, bot, time, { aim: bot.aim });
              else bot.input = { x: dx / length, z: dz / length };
            }
          } else if (!bot.botTarget || time >= bot.botNextThinkAt || Math.hypot(bot.botTarget.x - bot.x, bot.botTarget.z - bot.z) < 1.2) {
            bot.botTarget = { x: map.bounds.minX + 2 + random() * (map.bounds.maxX - 4), z: map.bounds.minY + 2 + random() * (map.bounds.maxY - 4) };
            bot.botNextThinkAt = time + DEBUG_BOT_RETHINK_MS;
            const dx = bot.botTarget.x - bot.x; const dz = bot.botTarget.z - bot.z; const length = Math.hypot(dx, dz) || 1;
            bot.input = { x: dx / length, z: dz / length };
          }
          bot.moving = Math.hypot(bot.input.x, bot.input.z) > 0.1;
        }
        for (const player of room.players.values()) if (player.alive && player.connected && player.moving) {
          const speedFactor = player.role === 'hider' && player.disguise ? HIDER_DISGUISE_SPEED_FACTOR : 1;
          const result = movePlayer(player, player.input, tickMs / 1000, { map, colliders, speedFactor });
          player.x = result.x; player.z = result.z; player.y = terrainHeightAt(player.x, player.z, map);
        }
        const hunter = room.players.get(room.hunterId);
        if (hunter?.connected && !hunter.isBot) {
          for (const hider of room.players.values()) {
            if (hider.role !== 'hider' || !hider.alive || !hider.connected || !hider.moving || !isInWater(hider.x, hider.z)) continue;
            if (time - (hider.lastSplashAt || 0) < WATER_SPLASH_EVENT_COOLDOWN_MS) continue;
            if (Math.hypot(hider.x - hunter.x, hider.z - hunter.z) > SPLASH_HEARING_DISTANCE) continue;
            hider.lastSplashAt = time;
            io.sockets.sockets.get(hunter.id)?.emit('game:event', { type: 'water-splash' });
          }
        }
        emitRoom(room);
      }
      for (const player of room.players.values()) if (!player.connected && time - player.disconnectedAt > PLAYER_REJOIN_SECONDS * 1000) {
        room.players.delete(player.id);
        if (room.hostId === player.id) room.hostId = [...room.players.keys()][0] || null;
      }
      if (!room.players.size) rooms.delete(room.code);
    }
  }, tickMs);

  io.on('connection', onConnection);
  return { rooms, close() { clearIntervalFn(timer); io.off('connection', onConnection); }, startRound, finishRound, publicRoom, onConnection };
}
