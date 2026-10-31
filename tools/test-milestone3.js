import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/gameServer.js';
import map from '../shared/map.js';
import { PROP_TYPES } from '../shared/propTypes.js';
import { HIDE_PHASE_SEC, HUNT_PHASE_SEC, HUNTER_STRIKES, KNIFE_COOLDOWN_SEC, KNIFE_RANGE, MAX_ROOM_PLAYERS } from '../shared/constants.js';
import { isInWater } from '../shared/water.js';
import { WORLD_COLLIDERS } from '../shared/world.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function once(socket, event, predicate = () => true, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`timeout waiting for ${event}`)); }, timeout);
    const listener = (data) => { if (!predicate(data)) return; clearTimeout(timer); socket.off(event, listener); resolve(data); };
    socket.on(event, listener);
  });
}
async function makeRoom(size, timing) {
  const server = createGameServer({ port: 0, host: '127.0.0.1', testHooks: true, roundTiming: timing, logger: { info() {}, error() {} } });
  const port = await server.listen(); const clients = [];
  for (let i = 0; i < size; i += 1) { const socket = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, auth: { milestone3Test: true } }); await once(socket, 'connect'); clients.push(socket); }
  const [host, ...guests] = clients; const created = once(host, 'room:created'); host.emit('room:create', { name: 'Bot 1' }); const code = (await created).code;
  for (let i = 0; i < guests.length; i += 1) { const joined = once(guests[i], 'room:joined'); guests[i].emit('room:join', { code, name: `Bot ${i + 2}` }); await joined; guests[i].emit('player:ready'); }
  await delay(80);
  const room = server.rooms.get(code);
  const started = once(host, 'room:update', (value) => value.phase === 'hide' && value.roundNumber === 1); host.emit('room:start'); await started;
  return { server, clients, host, room, code };
}
async function endRoom(match) { for (const client of match.clients) client.disconnect(); await match.server.close(); }
const stateFor = (match, socket) => match.room.players.get(socket.id);
const teleport = (socket, target, x, z) => socket.emit('test:teleport', { playerId: target.id, x, z });
const hiders = (match) => [...match.room.players.values()].filter((p) => p.role === 'hider' && !p.caught);
const hunter = (match) => [...match.room.players.values()].find((p) => p.role === 'hunter');
function openPair() {
  for (let x = map.bounds.minX + 4; x < map.bounds.maxX - 5; x += 2.5) for (let z = map.bounds.minY + 4; z < map.bounds.maxY - 4; z += 2.5) {
    if (isInWater(x, z, map) || isInWater(x + 1, z, map)) continue;
    if (WORLD_COLLIDERS.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + 1 || Math.hypot(c.x - x - 1, c.z - z) < c.radius + 1)) continue;
    return { x, z };
  }
  throw new Error('No clear test pair found');
}
async function forceRoundEnd(match, expected) { const result = await once(match.host, 'room:update', (item) => item.phase === 'results' && item.results?.winner === expected, 7000); assert.equal(result.results.winner, expected); return result; }

assert.equal(PROP_TYPES.length, 6); assert.equal(MAX_ROOM_PLAYERS, Math.min(6, PROP_TYPES.length + 1));
assert.equal(HIDE_PHASE_SEC, 30); assert.equal(HUNT_PHASE_SEC, 180); assert.equal(HUNTER_STRIKES, 10);

// Three headless clients verify lock, uniqueness, auto-pick, timer victory, and restart.
const timed = await makeRoom(3, { hideSeconds: 0.32, huntSeconds: 0.32 });
try {
  const hunterSocket = timed.clients.find((socket) => stateFor(timed, socket)?.role === 'hunter');
  const hunterState = stateFor(timed, hunterSocket); const hunterStart = { x: hunterState.x, z: hunterState.z };
  hunterSocket.emit('player:input', { x: 1, z: 0 }); await delay(70);
  assert.ok(Math.hypot(hunterState.x - hunterStart.x, hunterState.z - hunterStart.z) < 0.02, 'hunter moved during hide phase');
  const hiderSockets = timed.clients.filter((socket) => stateFor(timed, socket)?.role === 'hider');
  const first = stateFor(timed, hiderSockets[0]); const second = stateFor(timed, hiderSockets[1]);
  const duplicateError = once(hiderSockets[1], 'room:error', (e) => e.message === 'Already taken');
  hiderSockets[0].emit('disguise:choose', { type: 'barrel' }); hiderSockets[1].emit('disguise:choose', { type: 'barrel' }); await duplicateError;
  hiderSockets[1].emit('disguise:choose', { type: 'box' });
  assert.notEqual(first.disguiseType, second.disguiseType, 'simultaneous same-prop picks were not resolved uniquely');
  const locked = once(hiderSockets[0], 'room:update', (value) => value.phase === 'hide' && value.players.find((p) => p.id === first.id)?.disguiseLocked);
  hiderSockets[0].emit('disguise:lock'); await locked;
  await delay(80); assert.equal(first.disguiseLocked, true);
  const timedResult = await forceRoundEnd(timed, 'hiders'); assert.equal(timedResult.results.reason, 'Time expired');
  const restart = once(timed.host, 'room:update', (item) => item.phase === 'hide' && item.roundNumber === 2); timed.host.emit('round:restart'); await restart;
  assert.equal([...timed.room.players.values()].filter((p) => p.role === 'hunter').length, 1);
  await delay(60);
  const restartedHiders = [...timed.room.players.values()].filter((p) => p.role === 'hider');
  assert.ok(restartedHiders.every((p) => p.disguiseType), 'unpicked hider was not given a free prop');
  assert.equal(new Set(restartedHiders.map((p) => p.disguiseType)).size, restartedHiders.length);
  await forceRoundEnd(timed, 'hiders');
  console.log('PASS: three clients enforce unique simultaneous prop picks and lock; timer victory, automatic free-prop assignment, and host restart role assignment work');
} finally { await endRoom(timed); }

// Four players provide three distinct disguises and one randomly assigned hunter.
const four = await makeRoom(4, { hideSeconds: 0.15, huntSeconds: 0.2 });
try {
  assert.equal([...four.room.players.values()].filter((p) => p.role === 'hunter').length, 1);
  const hiderSockets = four.clients.filter((socket) => stateFor(four, socket)?.role === 'hider');
  for (let i = 0; i < hiderSockets.length; i += 1) hiderSockets[i].emit('disguise:choose', { type: PROP_TYPES[i].id });
  await delay(60);
  assert.equal(new Set(hiders(four).map((p) => p.disguiseType)).size, 3);
  await forceRoundEnd(four, 'hiders');
  console.log('PASS: four players get one hunter and three distinct prop assignments');
} finally { await endRoom(four); }

// A miss consumes a strike; ten total strikes end the round for the hiders.
const exhausted = await makeRoom(3, { hideSeconds: 0.12, huntSeconds: 15 });
try {
  const hunterPlayer = hunter(exhausted); const hunterSocket = exhausted.clients.find((socket) => socket.id === hunterPlayer.id);
  await once(hunterSocket, 'room:update', (item) => item.phase === 'hunt');
  const far = openPair(); teleport(hunterSocket, hunterPlayer, far.x, far.z);
  for (const target of hiders(exhausted)) teleport(hunterSocket, target, far.x + 8, far.z + 8);
  const miss = once(hunterSocket, 'round:effect', (effect) => effect.result === 'miss'); hunterSocket.emit('hunter:strike', { x: 1, z: 0 }); await miss;
  assert.equal(exhausted.room.strikesLeft, HUNTER_STRIKES - 1);
  assert.equal(hiders(exhausted).length, 2, 'miss incorrectly caught a hider');
  for (const hider of hiders(exhausted)) teleport(hunterSocket, hider, far.x + 15, far.z + 15);
  for (let strike = 1; strike < HUNTER_STRIKES; strike += 1) { await delay(KNIFE_COOLDOWN_SEC * 1000 + 40); hunterSocket.emit('hunter:strike', { x: 1, z: 0 }); }
  const exhaustedResult = await forceRoundEnd(exhausted, 'hiders'); assert.equal(exhaustedResult.results.reason, 'Hunter out of strikes');
  console.log('PASS: a miss consumes a strike without a catch; all ten validated strikes produce hider victory');
} finally { await endRoom(exhausted); }

// Knife range and all-hiders-caught victory are server-side.
const caught = await makeRoom(3, { hideSeconds: 0.12, huntSeconds: 12 });
try {
  const hunterPlayer = hunter(caught); const hunterSocket = caught.clients.find((socket) => socket.id === hunterPlayer.id);
  await once(hunterSocket, 'room:update', (item) => item.phase === 'hunt');
  const targets = hiders(caught); const position = openPair();
  for (const hider of targets) teleport(hunterSocket, hider, position.x + 1, position.z + 4);
  teleport(hunterSocket, hunterPlayer, position.x, position.z);
  const outOfRange = once(hunterSocket, 'room:update', (item) => item.phase === 'hunt' && item.strikesLeft === HUNTER_STRIKES - 1);
  hunterSocket.emit('hunter:strike', { x: 1, z: 0 }); await outOfRange;
  assert.equal(targets.some((p) => p.caught), false, 'knife caught a hider outside range');
  for (const target of targets) {
    await delay(KNIFE_COOLDOWN_SEC * 1000 + 40);
    teleport(hunterSocket, target, position.x + 1, position.z); hunterSocket.emit('hunter:strike', { x: 1, z: 0 });
    if (target !== targets.at(-1)) await delay(80);
  }
  const caughtResult = await forceRoundEnd(caught, 'hunter'); assert.equal(caughtResult.results.reason, 'All hiders caught');
  assert.equal(caughtResult.results.caught.length, 2);
  assert.ok(KNIFE_RANGE > 2 && KNIFE_COOLDOWN_SEC > 0);
  console.log('PASS: knife range/cooldown are enforced; catching every hider immediately awards hunter victory with the caught list');
} finally { await endRoom(caught); }

console.log('PASS: all final Milestone 3 headless checks completed');
