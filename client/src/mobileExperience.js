const ACTIVE_PHASES = new Set(['hide', 'hunt']);

export class MobileExperience {
  constructor({ onResize = () => {}, showDebug = false } = {}) {
    this.onResize = onResize;
    this.showDebug = showDebug;
    this.debugPanel = document.querySelector('#debug-panel');
    this.shell = document.querySelector('#game-shell');
    this.overlay = document.querySelector('#rotate-overlay');
    this.settingsButton = document.querySelector('#phone-settings-toggle');
    this.touchDevice = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.phase = 'lobby';

    for (const id of ['#create-room', '#join-room', '#start-button', '#restart-round']) {
      document.querySelector(id)?.addEventListener('click', () => { void this.enterImmersiveLandscape(); }, { capture: true });
    }
    for (const id of ['#leave-room', '#leave-match', '#leave-game', '#back-lobby']) {
      document.querySelector(id)?.addEventListener('click', () => { void this.leaveImmersiveLandscape(); }, { capture: true });
    }
    this.settingsButton?.addEventListener('click', () => {
      const open = !this.shell.classList.contains('phone-settings-open');
      this.shell.classList.toggle('phone-settings-open', open);
      this.settingsButton.setAttribute('aria-expanded', String(open));
      if (this.debugPanel) this.debugPanel.hidden = !open || !this.showDebug;
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F3' && this.touchDevice()) {
        event.preventDefault();
        this.settingsButton?.click();
      }
    });
    this.bindJoystick();
    document.querySelector('#mobile-attack')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    });
    window.addEventListener('resize', () => { this.refreshOrientation(); this.onResize(); });
    window.addEventListener('orientationchange', () => { this.refreshOrientation(); this.onResize(); });
    screen.orientation?.addEventListener?.('change', () => this.refreshOrientation());
    this.refreshOrientation();
  }

  async enterImmersiveLandscape() {
    if (!this.touchDevice()) return;
    try {
      const root = document.documentElement;
      if (!document.fullscreenElement) {
        try {
          if (root.requestFullscreen) await root.requestFullscreen();
          else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
        } catch { try { await root.webkitRequestFullscreen?.(); } catch { /* Optional browser API. */ } }
      }
      try { await screen.orientation?.lock?.('landscape'); } catch { /* Orientation lock is optional. */ }
    } catch { /* Fullscreen is optional on Safari and embedded browsers. */ }
  }

  async leaveImmersiveLandscape() {
    try { screen.orientation?.unlock?.(); } catch { /* Ignore unsupported orientation APIs. */ }
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      } else if (document.webkitFullscreenElement) await document.webkitExitFullscreen?.();
    } catch { /* Ignore unsupported fullscreen APIs. */ }
    this.shell.classList.remove('phone-settings-open');
    this.settingsButton?.setAttribute('aria-expanded', 'false');
  }

  setRoomState(room) {
    const previous = this.phase;
    this.phase = room?.phase || 'lobby';
    if (['results', 'scoreboard', 'final'].includes(this.phase) || (this.phase === 'lobby' && previous !== 'lobby')) void this.leaveImmersiveLandscape();
    const me = room?.players?.find((player) => player.id === room.playerId);
    const active = ACTIVE_PHASES.has(this.phase);
    const controls = document.querySelector('#mobile-controls');
    const attack = document.querySelector('#mobile-attack');
    const lock = document.querySelector('#lock-disguise');
    if (controls) controls.hidden = !active;
    if (attack) attack.hidden = !(this.phase === 'hunt' && me?.role === 'hunter' && !me.caught);
    if (lock) lock.hidden = !(this.phase === 'hide' && me?.role === 'hider' && !me.caught);
    this.refreshOrientation();
  }

  refreshOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    const shouldShow = this.touchDevice() && ACTIVE_PHASES.has(this.phase) && portrait;
    if (this.overlay) this.overlay.hidden = !shouldShow;
    this.shell?.classList.toggle('phone-portrait-blocked', shouldShow);
  }

  bindJoystick() {
    const stick = document.querySelector('#move-stick');
    const knob = document.querySelector('#move-stick-knob');
    if (!stick || !knob) return;
    let pointerId = null;
    let center = null;
    const heldKeys = new Set();
    const keyFor = (code, down) => {
      if (down === heldKeys.has(code)) return;
      if (down) heldKeys.add(code); else heldKeys.delete(code);
      const key = code === 'KeyW' ? 'w' : code === 'KeyA' ? 'a' : code === 'KeyS' ? 's' : 'd';
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code, bubbles: true }));
    };
    const clear = () => { for (const key of [...heldKeys]) keyFor(key, false); knob.style.transform = 'translate(0, 0)'; };
    const update = (event) => {
      const dx = event.clientX - center.x; const dy = event.clientY - center.y;
      const distance = Math.hypot(dx, dy); const radius = Math.min(38, stick.clientWidth * 0.34);
      const factor = distance ? Math.min(1, radius / distance) : 0;
      const x = dx * factor; const y = dy * factor;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      const active = distance > 11;
      keyFor('KeyW', active && y < -10); keyFor('KeyS', active && y > 10);
      keyFor('KeyA', active && x < -10); keyFor('KeyD', active && x > 10);
    };
    stick.addEventListener('pointerdown', (event) => {
      event.preventDefault(); pointerId = event.pointerId;
      const rect = stick.getBoundingClientRect(); center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      stick.setPointerCapture(pointerId); update(event);
    });
    stick.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) { event.preventDefault(); update(event); } });
    const release = (event) => { if (event.pointerId !== pointerId) return; pointerId = null; clear(); };
    stick.addEventListener('pointerup', release); stick.addEventListener('pointercancel', release); window.addEventListener('blur', clear);
  }
}
