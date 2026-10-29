import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createGameService } from '../server/gameServer.js';
import { GAME_TICK_HZ, HUNTER_TOTAL_STRIKES, KNIFE_COOLDOWN_MS } from '../shared/constants.js';
import { DECOY_ENTITIES } from '../shared/decoys.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = predicate(); if (value) return value; await wait(10); }
  throw new Error(`Timed out waiting for ${label}`);
}

async function makeMatch({ hideMs = 500, huntMs = 500, intermissionMs = 100 } = {}) {
  const server = createServer(); const ioServer = new Server(server, { transports: ['websocket', 'polling'] });
  const service = createGameService(ioServer, { hideMs, huntMs, intermissionMs });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = ['Birch', 'Moss', 'Fern'].map((name) => {
    const socket = connect(url, { transports: ['websocket'], reconnection: false }); socket.latest = null;
    socket.on('room:state', (state) => { socket.latest = state; }); socket.playerName = name; return socket;
  });
  await Promise.all(clients.map((socket) => new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); })));
  const created = new Promise((resolve) => clients[0].once('room:created', resolve)); clients[0].emit('room:create', { name: clients[0].playerName }); const { code } = await created;
  for (const client of clients.slice(1)) { const joined = new Promise((resolve) => client.once('room:joined', resolve)); client.emit('room:join', { name: client.playerName, code }); await joined; }
  for (const client of clients) client.emit('lobby:ready');
  await until(() => clients[0].latest?.players?.length === 3 && clients[0].latest.players.every((player) => player.ready), 'all players ready');
  const next = new Promise((resolve) => clients[0].once('room:state', (state) => state.phase !== 'lobby' && resolve(state)));
  clients[0].emit('lobby:start'); await next;
  return { clients, server, ioServer, service, async close() { clients.forEach((client) => client.disconnect()); service.close(); await new Promise((resolve) => ioServer.close(resolve)); } };
}

function sharedState(clients) { return clients.find((client) => client.latest?.phase)?.latest || null; }
function socketForId(clients, id) { return clients.find((client) => client.id === id); }
function waitPhase(clients, phase, predicate = () => true) { return until(() => { const state = sharedState(clients); return state?.phase === phase && predicate(state) ? state : null; }, `phase ${phase}`); }

async function testTimerWin() {
  const match = await makeMatch({ hideMs: 150, huntMs: 280, intermissionMs: 50 });
  try { const result = await waitPhase(match.clients, 'scoreboard'); assert.equal(result.winner, 'hiders'); console.log('PASS: timer expiry awards the hiders'); }
  finally { await match.close(); }
}

async function testStrikesOut() {
  const match = await makeMatch({ hideMs: 700, huntMs: 8000, intermissionMs: 50 });
  try {
    let state = await waitPhase(match.clients, 'hide');
    const hunter = socketForId(match.clients, state.hunterId);
    for (const player of state.players.filter((item) => item.role === 'hider')) {
      const client = socketForId(match.clients, player.id); const dir = client.playerName === 'Moss' ? 1 : -1;
      client.emit('player:input', { x: dir, z: 0, aim: { x: 0, z: 1 } });
    }
    state = await waitPhase(match.clients, 'hunt');
    for (const player of state.players.filter((item) => item.role === 'hider')) socketForId(match.clients, player.id).emit('player:input', { x: 0, z: 0 });
    await wait(KNIFE_COOLDOWN_MS + 80);
    for (let strike = 0; strike < HUNTER_TOTAL_STRIKES; strike += 1) {
      state = sharedState(match.clients); hunter.emit('game:strike', { aim: { x: 0, z: 1 } });
      await until(() => sharedState(match.clients)?.strikes === state.strikes - 1, `strike ${strike + 1}`);
      if (strike < HUNTER_TOTAL_STRIKES - 1) await wait(KNIFE_COOLDOWN_MS + 40);
    }
    const result = await waitPhase(match.clients, 'scoreboard'); assert.equal(result.winner, 'hiders'); assert.equal(result.strikes, 0); console.log('PASS: three wasted strikes award the hiders');
  } finally { await match.close(); }
}

async function testDisguiseLock() {
  const match = await makeMatch({ hideMs: 5000, huntMs: 8000, intermissionMs: 50 });
  try {
    const state = await waitPhase(match.clients, 'hide');
    const hiderState = state.players.find((player) => player.role === 'hider');
    const hider = socketForId(match.clients, hiderState.id);
    let error;
    hider.once('room:error', (value) => { error = value; });
    hider.emit('disguise:select', { type: 'stump' });
    await until(() => sharedState(match.clients)?.players.find((player) => player.id === hider.id)?.disguise === 'stump', 'disguise selection');
    hider.emit('disguise:lock');
    await until(() => error, 'cluster validation error');
    assert.equal(error.code, 'CLUSTER');
    const cluster = DECOY_ENTITIES.find((decoy) => DECOY_ENTITIES.filter((other) => other.type === decoy.type && Math.hypot(other.x - decoy.x, other.z - decoy.z) <= 3).length >= 2);
    const room = [...match.service.rooms.values()][0];
    Object.assign(room.players.get(hider.id), { x: cluster.x, z: cluster.z });
    hider.emit('disguise:select', { type: cluster.type });
    hider.emit('disguise:lock');
    const locked = await until(() => { const player = sharedState(match.clients)?.players.find((item) => item.id === hider.id); return player?.locked ? player : null; }, 'valid disguise lock');
    const nearest = DECOY_ENTITIES.filter((item) => item.type === cluster.type && Math.hypot(item.x - cluster.x, item.z - cluster.z) <= 3).sort((a, b) => Math.hypot(a.x - cluster.x, a.z - cluster.z) - Math.hypot(b.x - cluster.x, b.z - cluster.z))[0];
    assert.equal(locked.disguiseScale, nearest.scale);
    console.log('PASS: disguise locks require a matching two-prop cluster and copy the decoy scale');
  } finally { await match.close(); }
}

async function testSoloBots() {
  const server = createServer(); const ioServer = new Server(server, { transports: ['websocket', 'polling'] });
  const service = createGameService(ioServer, { hideMs: 150, huntMs: 300, intermissionMs: 50 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socket = connect(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], reconnection: false });
  let state = null; socket.on('room:state', (room) => { state = room; });
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const created = new Promise((resolve) => socket.once('room:created', resolve)); socket.emit('room:create', { name: 'Ranger' }); await created;
    socket.emit('debug:addBots', { count: 2 });
    await until(() => state?.players.length === 3 && state.players.filter((player) => player.isBot).length === 2, 'debug bots');
    socket.emit('lobby:ready'); socket.emit('lobby:start');
    const game = await until(() => state?.phase === 'hide' ? state : null, 'solo bot match');
    assert.equal(game.players.length, 3); console.log('PASS: ?bots=2 creates two ready AI players for solo testing');
  } finally { socket.disconnect(); service.close(); await new Promise((resolve) => ioServer.close(resolve)); }
}

async function catchAllHiders(match) {
  let state = await waitPhase(match.clients, 'hunt'); const hunter = socketForId(match.clients, state.hunterId);
  while (state.phase === 'hunt' && state.players.some((player) => player.role === 'hider' && player.alive)) {
    const beforeCaught = state.players.filter((player) => player.role === 'hider' && player.alive).length;
    hunter.emit('game:strike', { aim: { x: 0, z: 1 } });
    state = await until(() => { const current = sharedState(match.clients); return current && (current.players.filter((player) => player.role === 'hider' && player.alive).length < beforeCaught || current.phase === 'scoreboard') ? current : null; }, 'catch');
    if (state.phase !== 'scoreboard') await wait(KNIFE_COOLDOWN_MS + 30);
  }
  return waitPhase(match.clients, 'scoreboard');
}

async function testAllCaughtAndRotation() {
  const match = await makeMatch({ hideMs: 120, huntMs: 8000, intermissionMs: 600 });
  try {
    const hunters = [];
    for (let round = 0; round < 3; round += 1) {
      const state = await waitPhase(match.clients, 'hide', (room) => room.round === round + 1);
      hunters.push(state.hunterId);
      await waitPhase(match.clients, 'hunt', (room) => room.round === round + 1);
      const result = await catchAllHiders(match);
      assert.equal(result.winner, 'hunter');
      const host = socketForId(match.clients, result.hostId);
      host.emit('match:next');
      if (round < 2) await waitPhase(match.clients, 'hide', (room) => room.round === round + 2);
      else await waitPhase(match.clients, 'final');
    }
    assert.equal(new Set(hunters).size, 3, 'each player must be selected as hunter exactly once');
    console.log('PASS: all caught wins the hunter; hunter rotation covers every player');
  } finally { await match.close(); }
}

await testTimerWin();
await testStrikesOut();
await testDisguiseLock();
await testSoloBots();
await testAllCaughtAndRotation();
console.log(`PASS: Socket.IO bot suite (${GAME_TICK_HZ} Hz)`);
