import assert from 'node:assert/strict';
import { GameAudio, SOUND_METHODS } from '../client/src/audio.js';
import { AUDIO_MAX_SIMULTANEOUS_VOICES } from '../shared/constants.js';

class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}

class FakeNode {
  connect() {}
  disconnect() {}
  start() {}
  stop() { queueMicrotask(() => this.onended?.()); }
}

class FakeAudioContext {
  state = 'suspended'; sampleRate = 8000; currentTime = 1; destination = new FakeNode();
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { return Object.assign(new FakeNode(), { gain: new Param() }); }
  createOscillator() { return Object.assign(new FakeNode(), { frequency: new Param(), type: 'sine' }); }
  createBiquadFilter() { return Object.assign(new FakeNode(), { frequency: new Param(), type: 'lowpass' }); }
  createStereoPanner() { return Object.assign(new FakeNode(), { pan: new Param() }); }
  createBufferSource() { return Object.assign(new FakeNode(), { loop: false, buffer: null }); }
  createBuffer(_channels, length) { const samples = new Float32Array(length); return { getChannelData: () => samples }; }
}

let contextCreations = 0;
const audio = new GameAudio({ contextFactory: () => { contextCreations += 1; return new FakeAudioContext(); }, storage: { getItem: () => null, setItem() {} } });
assert.equal(audio.unlocked, false);
assert.equal(contextCreations, 0, 'constructing the audio layer does not start sound before a gesture');
for (const method of SOUND_METHODS) assert.equal(typeof audio[method], 'function', `missing sound function ${method}`);
audio.footstep(); audio.splash(); audio.rustle(); audio.knife(); audio.gunshot(); audio.crossbow(); audio.reload();
audio.catchHit(); audio.wastedStrike(); audio.warning(); audio.countdown(); audio.phaseSting(); audio.button(); audio.lobbyJoin(); audio.ready(); audio.roleReveal('hunter'); audio.result(true); audio.heartbeat(3); audio.startAmbience(); audio.updateAmbience(); audio.duckAmbience();
assert.equal(contextCreations, 0, 'sound calls before the first tap are silent and do not construct a context');

assert.equal(await audio.unlock(), true);
assert.equal(contextCreations, 1);
audio.startAmbience();
audio.footstep('dirt', 'hunter'); audio.footstep('grass', 'hider'); audio.footstep('bridge', 'hunter'); audio.splash(0.07, 0.5); audio.rustle();
audio.knife(); audio.gunshot({ distance: 5, pan: -0.4 }); audio.crossbow(); audio.reload(); audio.catchHit(); audio.wastedStrike();
audio.warning(); audio.countdown(); audio.phaseSting('hide'); audio.button(); audio.lobbyJoin(); audio.ready(); audio.roleReveal('hider'); audio.result(false);
audio.heartbeat(2); audio.updateAmbience({ river: 0.5, campfire: 0.3 }); audio.duckAmbience(1);
assert.ok(audio.activeSourceCount <= AUDIO_MAX_SIMULTANEOUS_VOICES, 'effects and ambience stay within the configured cap');
await new Promise((resolve) => setTimeout(resolve, 5));
audio.dispose();
assert.equal(audio.unlocked, false);
console.log('PASS: sound methods, voice cap, unlock gate, and Web Audio synthesis');
