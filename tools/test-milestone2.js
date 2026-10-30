import assert from 'node:assert/strict';
import { io as connectSocket } from 'socket.io-client';
import { createGameServer } from '../server/gameServer.js';
import map from '../shared/map.js';
import { GAME_TICK_RATE_HZ, MAX_ROOM_PLAYERS, PLAYER_COLLISION_RADIUS, PLAYER_MAX_SPEED, RECONNECT_WINDOW_MS } from '../shared/constants.js';
import { isInWater } from '../shared/water.js';
import { isPositionClear } from '../shared/world.js';

function eventOnce(socket, name, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Timed out waiting for ${name}`)); }, timeoutMs);
    const listener = (...args) => {
      if (!predicate(...args)) return;
      clearTimeout(timer); socket.off(name, listener); resolve(args.length === 1 ? args[0] : args);
    };
    socket.on(name, listener);
  });
}

async function createClient(port, auth = {}) {
  const socket = connectSocket(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, timeout: 3000, auth });
  await eventOnce(socket, 'connect');
  return socket;
}

const clients = [];
const server = createGameServer({ port: 0, host: '127.0.0.1', staticRoot: new URL('../dist/client', import.meta.url).pathname });
const port = await server.listen();
const client = async (auth) => { const socket = await createClient(port, auth); clients.push(socket); return socket; };

try {
  assert.equal(GAME_TICK_RATE_HZ, 20);
  const host = await client(); const second = await client(); const third = await client();
  const created = eventOnce(host, 'room:created');
  const firstLobby = eventOnce(host, 'room:update', (room) => room.phase === 'lobby' && room.players.length === 1);
  host.emit('room:create', { name: 'Host One' });
  const { code } = await created; await firstLobby;
  assert.equal(code.length, 4); assert.ok([...code].every((char) => 'ABCDEFGHJKLMNPQRSTUVWXYZ'.includes(char)));

  const secondJoined = eventOnce(second, 'room:joined');
  const hostTwo = eventOnce(host, 'room:update', (room) => room.players.length === 2);
  second.emit('room:join', { code, name: 'Runner Two' }); await secondJoined; await hostTwo;
  const thirdJoined = eventOnce(third, 'room:joined');
  const hostThree = eventOnce(host, 'room:update', (room) => room.players.length === 3);
  third.emit('room:join', { code, name: 'Runner Three' }); await thirdJoined; await hostThree;

  const nonHostStartIgnored = eventOnce(host, 'room:snapshot', (snapshot) => snapshot.phase === 'lobby');
  second.emit('room:start');
  assert.equal((await nonHostStartIgnored).phase, 'lobby');
  const notReadyStartIgnored = eventOnce(host, 'room:snapshot', (snapshot) => snapshot.phase === 'lobby');
  host.emit('room:start');
  assert.equal((await notReadyStartIgnored).phase, 'lobby');

  const readyTwo = eventOnce(host, 'room:update', (room) => room.players.find((item) => item.name === 'Runner Two')?.ready);
  second.emit('player:ready'); await readyTwo;
  const readyThree = eventOnce(host, 'room:update', (room) => room.players.find((item) => item.name === 'Runner Three')?.ready);
  third.emit('player:ready'); await readyThree;
  const gameStates = [eventOnce(host, 'room:update', (room) => room.phase === 'game'), eventOnce(second, 'room:update', (room) => room.phase === 'game'), eventOnce(third, 'room:update', (room) => room.phase === 'game')];
  host.emit('room:start');
  const started = await Promise.all(gameStates);
  assert.ok(started.every((room) => room.players.length === 3));
  for (const room of started) for (const player of room.players) {
    assert.ok(!isInWater(player.x, player.z, map), `${player.name} spawned in the river`);
    assert.ok(isPositionClear(player.x, player.z), `${player.name} spawned in a collider`);
  }
  const starts = started[0].players;
  for (let i = 0; i < starts.length; i += 1) for (let j = i + 1; j < starts.length; j += 1) assert.ok(Math.hypot(starts[i].x - starts[j].x, starts[i].z - starts[j].z) > PLAYER_COLLISION_RADIUS * 2);
  const snapshots = await Promise.all([eventOnce(host, 'room:snapshot', (snapshot) => snapshot.phase === 'game'), eventOnce(second, 'room:snapshot', (snapshot) => snapshot.phase === 'game'), eventOnce(third, 'room:snapshot', (snapshot) => snapshot.phase === 'game')]);
  assert.ok(snapshots.every((snapshot) => snapshot.players.length === 3 && snapshot.players.every((item) => item.name && Number.isFinite(item.x) && Number.isFinite(item.z))));
  console.log('PASS: three-client create/join/ready/start and shared position snapshots; safe separated spawns');

  const wrong = await client(); const wrongError = eventOnce(wrong, 'room:error');
  wrong.emit('room:join', { code: 'ZZZZ', name: 'Wrong Code' });
  assert.equal((await wrongError).message, 'Room not found');
  const startedJoin = eventOnce(wrong, 'room:error');
  wrong.emit('room:join', { code, name: 'Late Guest' });
  assert.equal((await startedJoin).message, 'Game already started');
  console.log('PASS: wrong-code and already-started joins return the required errors');

  const baseline = await eventOnce(host, 'room:snapshot', (snapshot) => snapshot.phase === 'game');
  const before = baseline.players.find((item) => item.id === host.id);
  const afterPromise = eventOnce(host, 'room:snapshot', (snapshot) => snapshot.phase === 'game' && snapshot.players.find((item) => item.id === host.id)?.x !== before.x, 2500);
  host.emit('player:input', { x: 9999, z: 0, speed: 99999, position: { x: 100000, z: 100000 } });
  await new Promise((resolve) => setTimeout(resolve, 500));
  host.emit('player:input', { x: 0, z: 0 });
  const after = await afterPromise;
  const moved = after.players.find((item) => item.id === host.id);
  const displacement = Math.hypot(moved.x - before.x, moved.z - before.z);
  assert.ok(displacement <= PLAYER_MAX_SPEED * 0.65 + 0.25, `speed hack moved ${displacement.toFixed(2)} units in 0.5 seconds`);
  assert.ok(displacement > 0, 'speed test did not move');
  console.log(`PASS: movement authority clamps speed/ignores injected positions (${displacement.toFixed(2)}u / 0.5s)`);

  const rateCounts = [0, 0, 0];
  const rateSockets = [host, second, third];
  const rateHandlers = rateSockets.map((socket, index) => { const handler = (snapshot) => { if (snapshot.phase === 'game') rateCounts[index] += 1; }; socket.on('room:snapshot', handler); return handler; });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  rateSockets.forEach((socket, index) => socket.off('room:snapshot', rateHandlers[index]));
  assert.ok(rateCounts.every((count) => count >= 16 && count <= 24), `snapshot rates were ${rateCounts.join(', ')}`);
  console.log(`PASS: 20 Hz authoritative snapshot loop (${rateCounts.join('/')} snapshots in 1.1s)`);

  const fullHost = await client(); const fullCreate = eventOnce(fullHost, 'room:created');
  fullHost.emit('room:create', { name: 'Full Host' }); const fullCode = (await fullCreate).code;
  for (let index = 1; index < MAX_ROOM_PLAYERS; index += 1) {
    const joiner = await client(); const joined = eventOnce(joiner, 'room:joined');
    joiner.emit('room:join', { code: fullCode, name: `Player ${index}` }); await joined;
  }
  const seventh = await client(); const fullError = eventOnce(seventh, 'room:error');
  seventh.emit('room:join', { code: fullCode, name: 'Seventh Player' });
  assert.equal((await fullError).message, 'Room full');
  console.log('PASS: room rejects a seventh player');

  const reconnectHost = await client(); const reconnectCreated = eventOnce(reconnectHost, 'room:created');
  reconnectHost.emit('room:create', { name: 'Return Host' }); const reconnectCode = (await reconnectCreated).code;
  const guest = await client(); const guestJoined = eventOnce(guest, 'room:joined');
  const guestHostUpdate = eventOnce(guest, 'room:update', (room) => room.players.length === 2);
  guest.emit('room:join', { code: reconnectCode, name: 'Guest One' }); await guestJoined; await guestHostUpdate;
  const hostPromoted = eventOnce(guest, 'room:update', (room) => room.players.length === 1 && room.players[0].host);
  reconnectHost.disconnect(); await hostPromoted;
  const returningSocket = await client(); const rejoined = eventOnce(returningSocket, 'room:joined');
  const restored = eventOnce(returningSocket, 'room:update', (room) => room.players.some((item) => item.name === 'Return Host'));
  returningSocket.emit('room:join', { code: reconnectCode, name: 'Return Host' });
  assert.equal((await rejoined).rejoined, true);
  const restoredRoom = await restored;
  assert.ok(restoredRoom.players.find((item) => item.name === 'Return Host')?.ready);
  assert.ok(restoredRoom.players.find((item) => item.name === 'Guest One')?.host);
  assert.equal(RECONNECT_WINDOW_MS, 30_000);
  console.log('PASS: host disconnect promotes next player and same name restores its slot inside the reconnect window');

  const botHost = await client({ soloBots: 2 }); const botCreated = eventOnce(botHost, 'room:created');
  botHost.emit('room:create', { name: 'Solo Host' }); const botCode = (await botCreated).code;
  const botRoom = eventOnce(botHost, 'room:update', (room) => room.players.length === 3);
  botHost.emit('debug:addBots', { count: 2 }); await botRoom;
  const botStart = eventOnce(botHost, 'room:update', (room) => room.phase === 'game');
  botHost.emit('room:start'); const botGame = await botStart;
  assert.equal(botGame.players.filter((item) => item.isBot).length, 2);
  assert.ok(botCode);
  console.log('PASS: ?bots=2 creates two wandering test players');

  const emptyRoomHost = await client(); const emptyCreated = eventOnce(emptyRoomHost, 'room:created');
  emptyRoomHost.emit('room:create', { name: 'Empty Room' }); const emptyCode = (await emptyCreated).code;
  const left = eventOnce(emptyRoomHost, 'room:left'); emptyRoomHost.emit('room:leave'); await left;
  assert.equal(server.rooms.has(emptyCode), false);
  console.log('PASS: explicit leave deletes an empty room');
} finally {
  for (const socket of clients) socket.disconnect();
  await server.close();
}
