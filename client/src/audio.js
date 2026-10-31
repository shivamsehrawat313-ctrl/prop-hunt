const MUTE_KEY = 'jungle-hunt-muted';
const MAX_VOICES = 6;

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export class GameAudio {
  constructor() {
    this.context = null;
    this.voices = new Set();
    this.unlocked = false;
    this.muted = readMuted();
  }

  unlock() {
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        this.context = new AudioContextClass();
      }
      this.unlocked = true;
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* Audio is optional on unsupported or restricted browsers. */ }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* Storage is optional. */ }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  #makeVoice(play) {
    if (!this.unlocked || this.muted || !this.context) return;
    try {
      if (this.voices.size >= MAX_VOICES) {
        const oldest = this.voices.values().next().value;
        oldest?.stop();
        if (oldest) this.voices.delete(oldest);
      }
      const source = play(this.context);
      if (!source) return;
      this.voices.add(source);
      source.onended = () => this.voices.delete(source);
    } catch { /* Drop a sound if a browser audio node cannot be created. */ }
  }

  #tone({ frequency = 440, endFrequency = frequency, duration = 0.08, volume = 0.08, type = 'sine' } = {}) {
    this.#makeVoice((context) => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(1, frequency), now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.01);
      return oscillator;
    });
  }

  buttonTap() { this.#tone({ frequency: 680, endFrequency: 510, duration: 0.035, volume: 0.035 }); }
  tick() { this.#tone({ frequency: 1120, endFrequency: 820, duration: 0.045, volume: 0.045 }); }
  phaseStart() { this.#tone({ frequency: 360, endFrequency: 690, duration: 0.22, volume: 0.09 }); }
  footstep(role = 'hider') { this.#tone({ frequency: 145, endFrequency: 74, duration: 0.075, volume: role === 'hunter' ? 0.07 : 0.035, type: 'triangle' }); }
  knifeSwish() { this.#tone({ frequency: 740, endFrequency: 190, duration: 0.14, volume: 0.095, type: 'sawtooth' }); }
  catchHit() { this.#tone({ frequency: 420, endFrequency: 185, duration: 0.19, volume: 0.12, type: 'triangle' }); }
}
