import {
  DANGER_LEVEL_1_DISTANCE, DANGER_LEVEL_2_DISTANCE, DANGER_LEVEL_3_DISTANCE,
  HIDER_SIGHT_RADIUS, HUNTER_CLOSE_CIRCLE_RANGE, HUNTER_CONE_RANGE,
  HUNTER_VIEW_CONE_DEGREES, PISTOL_REVEAL_RADIUS, SHIMMER_DISTANCE,
} from '../shared/constants.js';

export function hasLineOfSight(from, to, blockers = []) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 0.0001) return true;
  for (const blocker of blockers) {
    const t = ((blocker.x - from.x) * dx + (blocker.z - from.z) * dz) / lengthSquared;
    if (t <= 0.035 || t >= 0.965) continue;
    const nearestX = from.x + dx * t;
    const nearestZ = from.z + dz * t;
    if (Math.hypot(blocker.x - nearestX, blocker.z - nearestZ) < blocker.radius) return false;
  }
  return true;
}

function inHunterView(hunter, target, blockers) {
  const dx = target.x - hunter.x;
  const dz = target.z - hunter.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= HUNTER_CLOSE_CIRCLE_RANGE) return hasLineOfSight(hunter, target, blockers);
  if (distance > HUNTER_CONE_RANGE) return false;
  const aim = hunter.aim || { x: 0, z: 1 };
  const aimLength = Math.hypot(aim.x, aim.z) || 1;
  const forward = (dx * aim.x + dz * aim.z) / (distance * aimLength);
  if (forward < Math.cos(HUNTER_VIEW_CONE_DEGREES * Math.PI / 360)) return false;
  return hasLineOfSight(hunter, target, blockers);
}

function inHiderView(observer, target, blockers) {
  return Math.hypot(target.x - observer.x, target.z - observer.z) <= HIDER_SIGHT_RADIUS && hasLineOfSight(observer, target, blockers);
}

function playerSnapshot(player) {
  return {
    id: player.id, name: player.name, ready: player.ready, role: player.role,
    x: player.x, y: player.y, z: player.z, alive: player.alive, caught: player.caught,
    disguise: player.disguise, locked: player.locked, disguiseScale: player.disguiseScale,
    disguiseRotation: player.disguiseRotation, score: player.score, moving: player.moving,
    aim: player.aim, connected: player.connected, isBot: Boolean(player.isBot),
  };
}

function withinDisclosedRadius(observer, target, radius, blockers) {
  return Math.hypot(target.x - observer.x, target.z - observer.z) <= radius && hasLineOfSight(observer, target, blockers);
}

export function makeViewerState(room, now, viewerId, { blockers = [], decoys = room.decoys } = {}) {
  const viewer = room.players.get(viewerId);
  const active = ['hide', 'hunt'].includes(room.phase);
  const base = {
    code: room.code, hostId: active ? null : room.hostId, phase: room.phase, phaseEndsAt: room.phaseEndsAt,
    round: room.round, maxRounds: room.maxRounds,
    hunterId: active && viewer?.role !== 'hunter' ? null : room.hunterId,
    strikes: room.strikes, weapon: room.weapon, winner: room.winner,
    hunterRevealedUntil: room.hunterRevealedUntil,
    serverTime: now,
  };
  const players = [...room.players.values()];
  if (!active) return { ...base, players: players.map(playerSnapshot), disguises: [], dangerLevel: 0, hunterPosition: null };
  if (!viewer) return { ...base, players: [], disguises: [], dangerLevel: 0, hunterPosition: null };

  const hunter = room.players.get(room.hunterId);
  const visiblePlayers = [playerSnapshot(viewer)];
  const disguises = [];
  let dangerLevel = 0;
  let hunterPosition = null;
  if (viewer.role === 'hunter') {
    const targets = players.filter((target) => target.role === 'hider' && target.alive && target.connected);
    let disguiseIndex = 0;
    for (const target of targets) {
      if (!inHunterView(viewer, target, blockers)) continue;
      if (target.locked && target.disguise) {
        const match = decoys.find((item) => item.type === target.disguise && Math.hypot(item.x - target.x, item.z - target.z) <= 0.4);
        disguises.push({
          id: `sighting-${disguiseIndex++}`, type: target.disguise,
          model: match?.model || null, x: target.x, z: target.z,
          scale: target.disguiseScale || match?.scale || 1,
          rotation: target.disguiseRotation || match?.rotation || 0,
          shimmer: Boolean(target.moving && Math.hypot(target.x - viewer.x, target.z - viewer.z) <= SHIMMER_DISTANCE),
        });
      } else visiblePlayers.push(playerSnapshot(target));
    }
  } else if (viewer.role === 'hider') {
    for (const target of players) {
      if (target.id === viewer.id || !target.alive || !target.connected) continue;
      if (target.role === 'hider' && inHiderView(viewer, target, blockers)) visiblePlayers.push(playerSnapshot(target));
    }
    if (hunter && now <= room.hunterRevealedUntil && withinDisclosedRadius(viewer, hunter, PISTOL_REVEAL_RADIUS, blockers)) {
      visiblePlayers.push({ ...playerSnapshot(hunter), revealed: true });
      hunterPosition = { x: hunter.x, z: hunter.z, expiresAt: room.hunterRevealedUntil };
    }
    if (hunter) {
      const distance = Math.hypot(hunter.x - viewer.x, hunter.z - viewer.z);
      dangerLevel = distance <= DANGER_LEVEL_3_DISTANCE ? 3 : distance <= DANGER_LEVEL_2_DISTANCE ? 2 : distance <= DANGER_LEVEL_1_DISTANCE ? 1 : 0;
    }
  }
  return { ...base, players: visiblePlayers, disguises, dangerLevel, hunterPosition };
}
