const STORAGE_MUTED = 'shadow-hunt-audio-muted';
const STORAGE_VOLUME = 'shadow-hunt-audio-volume';
const MAX_VOICES = 10;
const SPATIAL_RANGE = 12;

export class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.unlocked = false;
    this.unlockPromise = null;
    this.voiceCount = 0;
    this.muted = readStorage(STORAGE_MUTED) === 'true';
    this.volume = clamp(Number(readStorage(STORAGE_VOLUME) ?? 0.7), 0, 1);
    this.listener = { x: 0, z: 0 };
    this.lastLocal = null;
    this.localDistance = 0;
    this.localStationaryTime = 0;
    this.remoteSteps = new Map();
    this.gameActive = false;
    this.riverDistance = Infinity;
    this.ambient = null;
  }

  bindUnlockGestures() {
    const firstTouch = () => { this.unlock(); };
    window.addEventListener('touchstart', firstTouch, { once: true, passive: true });
    for (const id of ['create-room', 'join-room']) {
      const button = document.getElementById(id);
      button?.addEventListener('pointerdown', firstTouch, { once: true, passive: true });
      button?.addEventListener('click', firstTouch, { once: true });
    }
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const unlockClick = ['create-room', 'join-room'].includes(button.id) && !this.unlocked;
      if (unlockClick) {
        this.unlock().then(() => this.playUiClick());
      } else {
        this.playUiClick();
      }
    });
  }

  async unlock() {
    if (this.unlocked && this.context) return true;
    if (this.unlockPromise) return this.unlockPromise;
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return false;
      this.context ??= new AudioContextType();
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.context.destination);
        this.createAmbientLoops();
      }
      this.unlockPromise = this.context.resume().then(() => {
        this.unlocked = this.context.state === 'running';
        this.updateAmbientLevels();
        return this.unlocked;
      }).catch(() => false).finally(() => { this.unlockPromise = null; });
      return await this.unlockPromise;
    } catch {
      this.unlockPromise = null;
      return false;
    }
  }

  createAmbientLoops() {
    const ctx = this.context;
    const noise = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 2)), ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    this.ambientNoise = noise;

    const makeNoiseLoop = (frequency, type, gainValue) => {
      const source = ctx.createBufferSource(); source.buffer = noise; source.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency;
      const gain = ctx.createGain(); gain.gain.value = gainValue;
      source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
      return { source, filter, gain };
    };
    const wind = makeNoiseLoop(380, 'lowpass', 0);
    const river = makeNoiseLoop(740, 'lowpass', 0);

    const cricket = ctx.createOscillator(); cricket.type = 'sine'; cricket.frequency.value = 4100;
    const cricketGain = ctx.createGain(); cricketGain.gain.value = 0;
    const chirp = ctx.createOscillator(); chirp.type = 'square'; chirp.frequency.value = 5.2;
    const chirpDepth = ctx.createGain(); chirpDepth.gain.value = 0.0007;
    chirp.connect(chirpDepth); chirpDepth.connect(cricketGain.gain); cricket.connect(cricketGain); cricketGain.connect(this.master);
    cricket.start(); chirp.start();
    this.ambient = { wind, river, cricket, cricketGain, chirp, chirpDepth };
    this.updateAmbientLevels();
  }

  updateAmbientLevels() {
    if (!this.ambient || !this.context) return;
    const now = this.context.currentTime;
    const active = this.unlocked && this.gameActive && !this.muted;
    const fade = active ? 1 : 0;
    const riverFade = active ? Math.pow(clamp(1 - this.riverDistance / 14, 0, 1), 2) : 0;
    const targets = [0.0012 * fade, 0.0017 * riverFade, 0.00055 * fade];
    this.ambientTargets ??= [NaN, NaN, NaN];
    const nodes = [this.ambient.wind.gain, this.ambient.river.gain, this.ambient.cricketGain.gain];
    targets.forEach((target, i) => {
      if (Math.abs(target - this.ambientTargets[i]) > 0.00003) {
        nodes[i].setTargetAtTime(target, now, i === 1 ? 0.7 : 0.8);
        this.ambientTargets[i] = target;
      }
    });
  }

  setGameActive(active) {
    this.gameActive = Boolean(active);
    this.updateAmbientLevels();
  }

  setRiverDistance(distance) {
    this.riverDistance = Number.isFinite(distance) ? Math.max(0, distance) : Infinity;
    this.updateAmbientLevels();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    writeStorage(STORAGE_MUTED, String(this.muted));
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.025);
    this.updateAmbientLevels();
  }

  setVolume(volume) {
    this.volume = clamp(Number(volume) || 0, 0, 1);
    writeStorage(STORAGE_VOLUME, String(this.volume));
    if (this.master && this.context && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
  }

  toggleMuted() { this.setMuted(!this.muted); return this.muted; }

  setListener(x, z) {
    if (Number.isFinite(x) && Number.isFinite(z)) this.listener = { x, z };
  }

  distanceGain(x, z) {
    const distance = Math.hypot(x - this.listener.x, z - this.listener.z);
    return distance >= SPATIAL_RANGE ? 0 : Math.pow(1 - distance / SPATIAL_RANGE, 1.45);
  }

  beginVoice(level = 1, position = null) {
    if (!this.unlocked || !this.context || this.muted || this.voiceCount >= MAX_VOICES) return null;
    const distance = position ? this.distanceGain(position.x, position.z) : 1;
    if (distance <= 0) return null;
    const ctx = this.context; const now = ctx.currentTime;
    const envelope = ctx.createGain(); envelope.gain.value = 0.0001;
    envelope.connect(this.master);
    if (position && typeof ctx.createStereoPanner === 'function') {
      const pan = ctx.createStereoPanner(); pan.pan.value = clamp((position.x - this.listener.x) / SPATIAL_RANGE, -1, 1);
      envelope.disconnect(); envelope.connect(pan); pan.connect(this.master);
    }
    this.voiceCount += 1;
    return { ctx, now, envelope, level: Math.max(0.0001, level * distance), finish: (duration) => {
      setTimeout(() => { try { envelope.disconnect(); } catch {} this.voiceCount = Math.max(0, this.voiceCount - 1); }, duration * 1000 + 100);
    } };
  }

  tone(frequency, endFrequency, duration, level = 0.08, position = null, waveform = 'sine', delay = 0) {
    const voice = this.beginVoice(level, position); if (!voice) return false;
    const { ctx, now, envelope } = voice; const start = now + delay;
    const oscillator = ctx.createOscillator(); oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0.0001, start); envelope.gain.linearRampToValueAtTime(voice.level, start + Math.min(0.012, duration * 0.25));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope); oscillator.start(start); oscillator.stop(start + duration + 0.02); voice.finish(delay + duration);
    return true;
  }

  noiseTone(duration, level = 0.05, position = null, filterType = 'bandpass', frequency = 900) {
    const voice = this.beginVoice(level, position); if (!voice) return false;
    const { ctx, now, envelope } = voice;
    const source = ctx.createBufferSource(); source.buffer = this.ambientNoise;
    const filter = ctx.createBiquadFilter(); filter.type = filterType; filter.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, now); envelope.gain.linearRampToValueAtTime(voice.level, now + Math.min(0.02, duration * 0.25));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter); filter.connect(envelope); source.start(now, Math.random() * 0.4, duration); voice.finish(duration);
    return true;
  }

  playUiClick() { return this.tone(720, 560, 0.045, 0.035, null, 'triangle'); }
  playFootstep(role = 'hider', position = null, remote = false) {
    const level = (role === 'hunter' ? 0.105 : 0.055) * (remote ? 0.44 : 1);
    const played = this.tone(role === 'hunter' ? 105 : 82, 54, 0.075, level, position, 'sine');
    this.noiseTone(0.055, level * 0.62, position, 'highpass', 250);
    return played;
  }
  playKnife(position = null) {
    const played = this.noiseTone(0.22, 0.085, position, 'bandpass', 1150);
    this.tone(510, 180, 0.13, 0.028, position, 'triangle');
    return played;
  }
  playCatch(position = null) {
    const played = this.tone(190, 58, 0.22, 0.11, position, 'triangle');
    this.noiseTone(0.11, 0.045, position, 'lowpass', 520);
    return played;
  }
  playThud(position = null) {
    const played = this.tone(120, 42, 0.19, 0.085, position, 'sine');
    this.noiseTone(0.12, 0.035, position, 'lowpass', 360);
    return played;
  }
  playLock() { return this.tone(630, 380, 0.075, 0.06, null, 'triangle'); }
  playRoleReveal() {
    this.tone(440, 660, 0.26, 0.055, null, 'sine');
    return this.tone(660, 990, 0.3, 0.045, null, 'triangle', 0.12);
  }
  playTick() { return this.tone(980, 720, 0.045, 0.035, null, 'sine'); }
  playWin() {
    this.tone(523, 523, 0.28, 0.065, null, 'sine'); this.tone(659, 659, 0.31, 0.055, null, 'sine', 0.12);
    return this.tone(784, 784, 0.42, 0.06, null, 'sine', 0.24);
  }
  playLose() {
    this.tone(392, 392, 0.28, 0.055, null, 'triangle'); this.tone(330, 330, 0.32, 0.05, null, 'triangle', 0.15);
    return this.tone(262, 262, 0.42, 0.05, null, 'triangle', 0.3);
  }
  playResult(won) { return won ? this.playWin() : this.playLose(); }

  playRoundEffect(effect) {
    const position = { x: effect.x, z: effect.z };
    this.playKnife(position);
    if (effect.result === 'caught') this.playCatch({ x: effect.endX, z: effect.endZ });
    else if (effect.result === 'wasted' || effect.result === 'miss') this.playThud({ x: effect.endX, z: effect.endZ });
    return true;
  }

  updateLocalFootsteps(position, role, moving, delta) {
    if (!position || !role || !this.gameActive) { this.lastLocal = null; this.localDistance = 0; this.localStationaryTime = 0; return; }
    this.setListener(position.x, position.z);
    if (!this.lastLocal) { this.lastLocal = { x: position.x, z: position.z }; return; }
    const distance = Math.hypot(position.x - this.lastLocal.x, position.z - this.lastLocal.z);
    this.lastLocal = { x: position.x, z: position.z };
    if (distance > 0.0005) { this.localDistance += distance; this.localStationaryTime = 0; }
    else this.localStationaryTime += delta;
    const stepDistance = role === 'hunter' ? 3.8 : 2.2;
    if (moving && this.localDistance >= stepDistance) {
      this.playFootstep(role);
      this.localDistance %= stepDistance;
    } else if (this.localStationaryTime > 0.18) {
      this.localDistance = 0;
    }
  }

  updateRemoteFootsteps(players, localPlayerId) {
    const seen = new Set();
    for (const player of players || []) {
      if (!player || player.id === localPlayerId || player.caught) continue;
      seen.add(player.id);
      const previous = this.remoteSteps.get(player.id);
      this.remoteSteps.set(player.id, { x: player.x, z: player.z, lastPlayed: previous?.lastPlayed ?? -Infinity });
      if (!previous || player.role === 'hider' && player.disguiseLocked !== false) continue;
      const moved = Math.hypot(player.x - previous.x, player.z - previous.z) > 0.018;
      const now = performance.now();
      if (moved && now - previous.lastPlayed >= (player.role === 'hunter' ? 350 : 470)) {
        const position = { x: player.x, z: player.z };
        if (this.distanceGain(position.x, position.z) > 0) {
          this.playFootstep(player.role, position, true);
          this.remoteSteps.set(player.id, { x: player.x, z: player.z, lastPlayed: now });
        }
      }
    }
    for (const id of this.remoteSteps.keys()) if (!seen.has(id)) this.remoteSteps.delete(id);
  }

  dispose() {
    for (const node of [this.ambient?.wind?.source, this.ambient?.river?.source, this.ambient?.cricket, this.ambient?.chirp]) {
      try { node?.stop(); } catch {}
    }
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
  }
}

function clamp(value, min, max) { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min; }
function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key, value) { try { localStorage.setItem(key, value); } catch { /* storage is optional */ } }
