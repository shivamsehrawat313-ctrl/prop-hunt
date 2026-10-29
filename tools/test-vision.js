import assert from 'node:assert/strict';
import { makeViewerState, hasLineOfSight } from '../server/visibility.js';

const hunter = { id: 'hunter-id', name: 'Hunter', role: 'hunter', x: 0, y: 0, z: 0, alive: true, connected: true, aim: { x: 1, z: 0 }, moving: false };
const hider = { id: 'hidden-id', name: 'Hider', role: 'hider', x: 5, y: 0, z: 0, alive: true, connected: true, aim: { x: 0, z: 1 }, moving: false, locked: false };
const room = { code: 'ABCD', hostId: hunter.id, phase: 'hunt', phaseEndsAt: 9000, round: 1, maxRounds: 2, hunterId: hunter.id, strikes: 3, weapon: 'knife', winner: null, hunterRevealedUntil: 0, players: new Map([[hunter.id, hunter], [hider.id, hider]]), decoys: [] };

assert.equal(hasLineOfSight(hunter, hider, [{ x: 2.5, z: 0, radius: 0.8 }]), false, 'a tree trunk blocks the sight ray');
assert.equal(hasLineOfSight(hunter, hider, []), true, 'an unobstructed ray is visible');
const blockedView = makeViewerState(room, 1000, hunter.id, { blockers: [{ x: 2.5, z: 0, radius: 0.8 }] });
assert.deepEqual(blockedView.players.map((player) => player.id), [hunter.id], 'hunter cannot see through a blocker');
const hunterView = makeViewerState(room, 1000, hunter.id);
assert.deepEqual(hunterView.players.map((player) => player.id), [hunter.id, hider.id], 'hunter sees an unobstructed hider in the forward cone');
const hiddenView = makeViewerState(room, 1000, hider.id);
assert.equal(hiddenView.players.some((player) => player.id === hunter.id), false, 'hider cannot see hunter outside reveal');
assert.equal(hiddenView.hunterId, null, 'hidden hunter identity is not sent to hiders');
assert.equal(hiddenView.hostId, null, 'host socket id does not expose the hunter');
assert.equal(hiddenView.dangerLevel, 3, 'danger is based on proximity to the hunter');
room.hunterRevealedUntil = 2000;
const revealedView = makeViewerState(room, 1500, hider.id);
assert.equal(revealedView.players.some((player) => player.id === hunter.id && player.revealed), true, 'pistol reveal is sent while its timer is active');
assert.ok(revealedView.hunterPosition);
const expiredView = makeViewerState(room, 2500, hider.id);
assert.equal(expiredView.players.some((player) => player.id === hunter.id), false, 'pistol reveal expires');
console.log('PASS: sight cones, prop occlusion, danger, hidden coordinates, and timed pistol reveal');

const propTarget = { ...hider, id: 'private-hider-id', x: 3.5, locked: true, disguise: 'bush', disguiseScale: 1.04, disguiseRotation: 0.8, moving: false };
room.players.set(propTarget.id, propTarget);
room.decoys = [{ id: 'bush-example', type: 'bush', model: 'plant_bushDetailed.glb', scale: 1.04, rotation: 0.8, x: 4, z: 1 }];
const disguised = makeViewerState(room, 1000, hunter.id);
assert.equal(disguised.players.some((player) => player.id === propTarget.id), false, 'locked disguise hides player identity');
assert.deepEqual(Object.keys(disguised.disguises[0]).sort(), ['id', 'model', 'rotation', 'scale', 'shimmer', 'type', 'x', 'z'].sort());
assert.equal(disguised.disguises[0].shimmer, false, 'a stationary disguise has no shimmer');
propTarget.moving = true;
const movingDisguised = makeViewerState(room, 1000, hunter.id);
assert.equal(movingDisguised.disguises[0].shimmer, true, 'a moving disguise shimmers inside the near range');
console.log('PASS: anonymous decoy-shaped disguise and proximity shimmer');
