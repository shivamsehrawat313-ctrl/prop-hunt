import {
  AUDIO_AMBIENCE_DUCK_GAIN, AUDIO_AMBIENCE_DUCK_MS, AUDIO_AMBIENCE_VOICE_COUNT, AUDIO_MAX_SIMULTANEOUS_VOICES,
  AUDIO_HEARTBEAT_AMBIENCE_DUCK_GAIN, AUDIO_MASTER_VOLUME_DEFAULT, HEARTBEAT_INTERVALS_MS, HEARTBEAT_PEAK_VOLUME,
} from '../../shared/constants.js';

function safeStorage(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export class GameAudio {
  constructor({ contextFactory = null, storage = globalThis.localStorage } = {}) {
    this.contextFactory = contextFactory || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.storage = storage;
    this.context = null;
    this.master = null;
    this.ambienceGain = null;
    this.noiseBuffer = null;
    this.unlocked = false;
    this.muted = safeStorage('shadow-hunt-muted', 'false') === 'true';
    const savedVolume = Number(safeStorage('shadow-hunt-volume', String(AUDIO_MASTER_VOLUME_DEFAULT)));
    this.volume = Number.isFinite(savedVolume) ? Math.max(0, Math.min(1, savedVolume)) : AUDIO_MASTER_VOLUME_DEFAULT;
    this.activeVoices = 0;
    this.heartbeatTimer = null;
    this.heartbeatLevel = 0;
    this.ambience = null;
  }

  async unlock() {
    if (!this.context) {
      this.context = this.contextFactory();
      if (!this.context) return false;
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.context.destination);
      this.ambienceGain = this.context.createGain(); this.ambienceGain.gain.value = 1; this.ambienceGain.connect(this.master);
    }
    if (this.context.state !== 'running') await this.context.resume();
    this.unlocked = this.context.state === 'running';
    if (this.unlocked && this.heartbeatLevel) this.heartbeat(this.heartbeatLevel);
    return this.unlocked;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    try { this.storage?.setItem('shadow-hunt-muted', String(this.muted)); } catch {}
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.025);
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    try { this.storage?.setItem('shadow-hunt-volume', String(this.volume)); } catch {}
    if (this.master && this.context && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  #makeNoiseBuffer() {
    if (this.noiseBuffer || !this.context) return this.noiseBuffer;
    const length = this.context.sampleRate;
    this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    return this.noiseBuffer;
  }

  #canPlay() { return this.unlocked && this.context?.state === 'running' && this.activeVoices + (this.ambience ? AUDIO_AMBIENCE_VOICE_COUNT : 0) < AUDIO_MAX_SIMULTANEOUS_VOICES; }
  get activeSourceCount() { return this.activeVoices + (this.ambience ? AUDIO_AMBIENCE_VOICE_COUNT : 0); }

  #tone({ frequency = 440, endFrequency = frequency, duration = 0.14, volume = 0.06, type = 'sine', pan = 0, filter = null }) {
    if (!this.#canPlay()) return;
    const context = this.context; const start = context.currentTime;
    const source = context.createOscillator(); const gain = context.createGain();
    source.type = type; source.frequency.setValueAtTime(frequency, start); source.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.001, start); gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.025, duration * 0.25)); gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    let output = gain;
    if (filter) { const filterNode = context.createBiquadFilter(); filterNode.type = filter.type || 'lowpass'; filterNode.frequency.value = filter.frequency; gain.connect(filterNode); output = filterNode; }
    const panner = context.createStereoPanner?.();
    if (panner) { panner.pan.value = Math.max(-1, Math.min(1, pan)); output.connect(panner); panner.connect(this.master); }
    else output.connect(this.master);
    source.connect(gain); this.activeVoices += 1;
    source.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); source.disconnect(); gain.disconnect(); panner?.disconnect(); };
    source.start(start); source.stop(start + duration + 0.015);
  }

  #noise({ duration = 0.12, volume = 0.04, filterType = 'lowpass', frequency = 1000, pan = 0 }) {
    if (!this.#canPlay()) return;
    const context = this.context; const source = context.createBufferSource(); const gain = context.createGain();
    source.buffer = this.#makeNoiseBuffer();
    const filter = context.createBiquadFilter(); filter.type = filterType; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    const panner = context.createStereoPanner?.();
    source.connect(filter); filter.connect(gain);
    if (panner) { panner.pan.value = Math.max(-1, Math.min(1, pan)); gain.connect(panner); panner.connect(this.master); }
    else gain.connect(this.master);
    this.activeVoices += 1;
    source.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); source.disconnect(); filter.disconnect(); gain.disconnect(); panner?.disconnect(); };
    source.start(); source.stop(context.currentTime + duration);
  }

  footstep(surface = 'grass', role = 'hider') {
    const gain = role === 'hunter' ? 0.12 : 0.047;
    if (surface === 'bridge') this.#noise({ volume: gain, filterType: 'lowpass', frequency: 420 });
    else if (surface === 'dirt') this.#noise({ volume: gain * 0.72, filterType: 'bandpass', frequency: 720 });
    else this.#noise({ volume: gain * 0.55, filterType: 'highpass', frequency: 1300 });
  }
  splash(volume = 0.08, pan = 0) { this.#noise({ duration: 0.3, volume, filterType: 'bandpass', frequency: 900, pan }); this.#tone({ frequency: 240, endFrequency: 105, duration: 0.2, volume: volume * 0.38, pan }); }
  rustle() { this.#noise({ duration: 0.22, volume: 0.055, filterType: 'highpass', frequency: 1700 }); }
  knife() { this.#noise({ duration: 0.18, volume: 0.09, filterType: 'bandpass', frequency: 1800 }); }
  gunshot({ distance = 0, pan = 0 } = {}) { const volume = Math.max(0.035, 0.22 * (1 - Math.min(0.84, distance / 100))); this.#noise({ duration: 0.42, volume, filterType: 'lowpass', frequency: 680, pan }); this.#tone({ frequency: 92, endFrequency: 36, duration: 0.34, volume: volume * 0.72, type: 'triangle', pan }); }
  crossbow() { this.#tone({ frequency: 640, endFrequency: 260, duration: 0.32, volume: 0.09, type: 'triangle' }); }
  reload() { this.#tone({ frequency: 780, endFrequency: 450, duration: 0.055, volume: 0.045, type: 'square' }); }
  catchHit() { this.#tone({ frequency: 180, endFrequency: 72, duration: 0.42, volume: 0.14, type: 'triangle' }); this.#tone({ frequency: 540, endFrequency: 980, duration: 0.12, volume: 0.09 }); }
  wastedStrike() { this.#tone({ frequency: 160, endFrequency: 68, duration: 0.2, volume: 0.095, type: 'triangle' }); }
  warning() { this.#tone({ frequency: 520, endFrequency: 420, duration: 0.12, volume: 0.08 }); }
  countdown() { this.#tone({ frequency: 880, endFrequency: 680, duration: 0.075, volume: 0.06 }); }
  phaseSting(phase = 'hunt') { const base = phase === 'hide' ? 660 : 440; this.#tone({ frequency: base, endFrequency: base * 1.5, duration: 0.38, volume: 0.08, type: 'triangle' }); }
  button() { this.#tone({ frequency: 700, endFrequency: 620, duration: 0.05, volume: 0.025 }); }
  lobbyJoin() { this.#tone({ frequency: 490, endFrequency: 740, duration: 0.16, volume: 0.055 }); }
  ready() { this.#tone({ frequency: 620, endFrequency: 860, duration: 0.14, volume: 0.06 }); }
  roleReveal(role) { this.phaseSting(role === 'hunter' ? 'hunt' : 'hide'); }
  result(won) { this.#tone({ frequency: won ? 523 : 330, endFrequency: won ? 784 : 196, duration: 0.5, volume: 0.09, type: 'triangle' }); }

  heartbeat(level = 0) {
    const next = Math.max(0, Math.min(3, Math.floor(level || 0)));
    if (next === this.heartbeatLevel && (next === 0 || this.heartbeatTimer)) return;
    this.heartbeatLevel = next; clearInterval(this.heartbeatTimer); this.heartbeatTimer = null;
    if (this.unlocked) this.#setAmbienceDucking(next ? AUDIO_HEARTBEAT_AMBIENCE_DUCK_GAIN : 1);
    if (!next || !this.unlocked) return;
    const pulse = () => {
      const peak = HEARTBEAT_PEAK_VOLUME * next / 3;
      this.#tone({ frequency: 58, endFrequency: 42, duration: 0.15, volume: peak, type: 'sine' });
      setTimeout(() => this.#tone({ frequency: 49, endFrequency: 36, duration: 0.16, volume: peak, type: 'sine' }), 145);
    };
    pulse(); this.heartbeatTimer = setInterval(pulse, HEARTBEAT_INTERVALS_MS[next]);
  }

  startAmbience() {
    if (!this.unlocked || this.ambience || !this.context) return;
    if (this.activeVoices + AUDIO_AMBIENCE_VOICE_COUNT > AUDIO_MAX_SIMULTANEOUS_VOICES) return;
    const context = this.context;
    const makeToneBed = (frequency, volume, type = 'sine') => {
      const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.value = volume; oscillator.connect(gain); gain.connect(this.ambienceGain); oscillator.start(); return { oscillator, gain };
    };
    const makeNoiseBed = (filterType, frequency, volume) => {
      const source = context.createBufferSource(); source.buffer = this.#makeNoiseBuffer(); source.loop = true;
      const filter = context.createBiquadFilter(); filter.type = filterType; filter.frequency.value = frequency;
      const gain = context.createGain(); gain.gain.value = volume; source.connect(filter); filter.connect(gain); gain.connect(this.ambienceGain); source.start();
      return { oscillator: source, filter, gain };
    };
    this.ambience = {
      cricket: makeToneBed(1950, 0.002, 'sine'),
      river: makeNoiseBed('bandpass', 580, 0.0001),
      fire: makeNoiseBed('highpass', 1500, 0.0001),
      wind: makeNoiseBed('lowpass', 460, 0.012),
    };
    if (this.heartbeatLevel) this.#setAmbienceDucking(AUDIO_HEARTBEAT_AMBIENCE_DUCK_GAIN);
  }

  updateAmbience({ river = 0, campfire = 0 } = {}) {
    this.startAmbience();
    if (!this.ambience || !this.context) return;
    const now = this.context.currentTime;
    this.ambience.river.gain.gain.setTargetAtTime(0.0001 + Math.max(0, Math.min(1, river)) * 0.025, now, 0.3);
    this.ambience.fire.gain.gain.setTargetAtTime(0.0001 + Math.max(0, Math.min(1, campfire)) * 0.018, now, 0.3);
  }

  duckAmbience(durationMs = AUDIO_AMBIENCE_DUCK_MS) {
    if (!this.ambience || !this.context || !this.ambienceGain) return;
    const now = this.context.currentTime;
    this.#setAmbienceDucking(AUDIO_AMBIENCE_DUCK_GAIN);
    setTimeout(() => { if (!this.ambience || !this.context || !this.ambienceGain) return; this.#setAmbienceDucking(this.heartbeatLevel ? AUDIO_HEARTBEAT_AMBIENCE_DUCK_GAIN : 1); }, durationMs);
  }

  #setAmbienceDucking(gain) { if (this.ambienceGain && this.context) this.ambienceGain.gain.setTargetAtTime(gain, this.context.currentTime, 0.12); }

  stopAmbience() {
    for (const bed of Object.values(this.ambience || {})) { try { bed.oscillator.stop(); bed.oscillator.disconnect(); bed.filter?.disconnect(); bed.gain.disconnect(); } catch {} }
    this.ambience = null;
  }

  dispose() { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; this.stopAmbience(); this.context?.close?.(); this.context = null; this.unlocked = false; }
}

export const SOUND_METHODS = ['footstep','splash','rustle','knife','gunshot','crossbow','reload','catchHit','wastedStrike','warning','countdown','phaseSting','button','lobbyJoin','ready','roleReveal','result','heartbeat','startAmbience','updateAmbience','duckAmbience','setMuted','setVolume','toggleMute','stopAmbience','dispose'];
