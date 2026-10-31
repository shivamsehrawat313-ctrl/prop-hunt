import assert from 'node:assert/strict';
import { GameAudio } from '../client/src/audio.js';

let contextCount = 0;
let started = 0;
class Param {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}
class Node {
  constructor() {
    this.gain = new Param(); this.frequency = new Param(440); this.pan = new Param();
    this.Q = new Param(); this.detune = new Param(); this.playbackRate = new Param(1);
  }
  connect() { return this; }
  disconnect() {}
  start() { started += 1; }
  stop() {}
}
class MockAudioContext {
  constructor() { contextCount += 1; this.state = 'suspended'; this.sampleRate = 8000; this.currentTime = 0; this.destination = new Node(); }
  createGain() { return new Node(); }
  createOscillator() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createBufferSource() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

globalThis.window = { AudioContext: MockAudioContext };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const audio = new GameAudio();

// Calling effects before a user gesture neither creates a context nor starts audio.
audio.playUiClick(); audio.playFootstep(); audio.playKnife(); audio.playCatch(); audio.playThud();
audio.playLock(); audio.playRoleReveal(); audio.playTick(); audio.playWin(); audio.playLose();
audio.playResult(true); audio.playResult(false); audio.playRoundEffect({ kind: 'knife', result: 'caught', x: 0, z: 0, endX: 1, endZ: 0 });
audio.setGameActive(true); audio.setRiverDistance(0); audio.updateAmbientLevels();
audio.updateLocalFootsteps({ x: 0, z: 0 }, 'hunter', true, 0.05);
audio.updateRemoteFootsteps([], 'local');
assert.equal(contextCount, 0, 'AudioContext must not exist before the first gesture');
assert.equal(started, 0, 'No oscillator or buffer source may start before the first gesture');

assert.equal(await audio.unlock(), true, 'gesture unlock should resume audio');
assert.equal(contextCount, 1, 'the manager should create exactly one AudioContext');
audio.playUiClick(); audio.playFootstep('hider'); audio.playFootstep('hunter', { x: 2, z: 0 }, true);
audio.playKnife({ x: 1, z: 0 }); audio.playCatch({ x: 1, z: 0 }); audio.playThud({ x: 1, z: 0 });
audio.playLock(); audio.playRoleReveal(); audio.playTick(); audio.playWin(); audio.playLose();
audio.playRoundEffect({ kind: 'knife', result: 'caught', x: 0, z: 0, endX: 1, endZ: 0 });
audio.playRoundEffect({ kind: 'knife', result: 'wasted', x: 0, z: 0, endX: 1, endZ: 0 });
audio.playRoundEffect({ kind: 'knife', result: 'miss', x: 0, z: 0, endX: 1, endZ: 0 });
audio.setGameActive(true); audio.setRiverDistance(2); audio.setMuted(false); audio.setVolume(0.5); audio.toggleMuted(); audio.toggleMuted();
audio.setListener(0, 0);
audio.updateLocalFootsteps({ x: 0, z: 0 }, 'hider', false, 0.05);
for (let x = 1; x <= 3; x += 1) audio.updateLocalFootsteps({ x, z: 0 }, 'hider', true, 0.05);
audio.voiceCount = 0;
audio.updateRemoteFootsteps([{ id: 'locked', x: 2, z: 0, role: 'hider', disguiseLocked: true }], 'local');
const beforeLockedSteps = audio.voiceCount;
audio.updateRemoteFootsteps([{ id: 'locked', x: 3, z: 0, role: 'hider', disguiseLocked: true }], 'local');
assert.equal(audio.voiceCount, beforeLockedSteps, 'locked hiders must not trigger remote footsteps');
audio.updateRemoteFootsteps([{ id: 'free', x: 2, z: 0, role: 'hider', disguiseLocked: false }], 'local');
audio.updateRemoteFootsteps([{ id: 'free', x: 3, z: 0, role: 'hider', disguiseLocked: false }], 'local');
assert.ok(started > 0, 'audio functions should synthesize sounds after unlock');
audio.dispose();
console.log('Audio checks passed: gated before gesture, one reusable context, sound functions execute after unlock.');
