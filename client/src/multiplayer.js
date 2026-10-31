import { io } from 'socket.io-client';
import { GAME_TICK_INTERVAL_MS, ROOM_CODE_LENGTH } from '../../shared/constants.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class MultiplayerClient {
  constructor({ onRoom = () => {}, onSnapshot = () => {}, onNetwork = () => {}, onEffect = () => {}, onError = () => {} } = {}) {
    this.onRoom = onRoom; this.onSnapshot = onSnapshot; this.onNetwork = onNetwork; this.onEffect = onEffect; this.onError = onError;
    this.room = null; this.input = { x: 0, z: 0 }; this.worldReady = false; this.worldError = ''; this.snapshotsInWindow = 0; this.lastRateWindow = Date.now(); this.pingMs = null; this.snapshotHz = 0;
    this.nameInput = document.querySelector('#player-name'); this.codeInput = document.querySelector('#room-code-input'); this.error = document.querySelector('#lobby-error');
    this.landing = document.querySelector('#landing-screen'); this.lobby = document.querySelector('#lobby-screen'); this.game = document.querySelector('#game-shell');
    this.nameInput.value = safeStorageGet('shadow-hunt-name');
    const roomCode = new URLSearchParams(location.search).get('room') || '';
    this.codeInput.value = [...roomCode.toUpperCase()].filter((char) => CODE_ALPHABET.includes(char)).slice(0, ROOM_CODE_LENGTH).join('');
    this.codeInput.addEventListener('input', () => { this.codeInput.value = [...this.codeInput.value.toUpperCase()].filter((char) => CODE_ALPHABET.includes(char)).slice(0, ROOM_CODE_LENGTH).join(''); });
    const botCount = new URLSearchParams(location.search).get('bots') === '2' ? 2 : 0;
    this.socket = io({ transports: ['websocket', 'polling'], reconnection: true, timeout: 8000, auth: { soloBots: botCount } });
    document.querySelector('#landing-card').addEventListener('submit', (event) => { event.preventDefault(); this.createRoom(); });
    document.querySelector('#join-room').addEventListener('click', () => this.joinRoom());
    document.querySelector('#ready-button').addEventListener('click', () => this.socket.emit('player:ready'));
    document.querySelector('#start-button').addEventListener('click', () => this.socket.emit('room:start'));
    document.querySelector('#leave-room').addEventListener('click', () => this.leaveRoom());
    document.querySelector('#leave-game').addEventListener('click', () => this.leaveRoom());
    document.querySelector('#copy-code').addEventListener('click', () => this.copy(this.room?.code || ''));
    document.querySelector('#copy-link').addEventListener('click', () => this.copy(`${location.origin}/?room=${this.room?.code || ''}`));
    document.querySelector('#lock-disguise').addEventListener('click', () => this.lockDisguise());
    document.querySelector('#prop-grid').addEventListener('click', (event) => { const button = event.target.closest('[data-prop]'); if (button && !button.disabled) this.chooseDisguise(button.dataset.prop); });
    document.querySelector('#restart-round').addEventListener('click', () => this.socket.emit('round:restart'));
    document.querySelector('#back-lobby').addEventListener('click', () => this.socket.emit('round:back-to-lobby'));
    this.socket.on('connect', () => this.clearError());
    this.socket.on('room:created', ({ code }) => { this.codeInput.value = code; if (botCount) this.socket.emit('debug:addBots', { count: botCount }); });
    this.socket.on('room:error', ({ message }) => { this.error.textContent = message || 'Unable to join room'; this.onError(message); this.render(); });
    this.socket.on('room:update', (room) => { this.room = room; this.render(); this.onRoom(room); });
    this.socket.on('room:snapshot', (snapshot) => {
      this.snapshotsInWindow += 1;
      if (this.room && snapshot?.code === this.room.code && snapshot.phase !== this.room.phase) {
        const byId = new Map((snapshot.players || []).map((player) => [player.id, player]));
        this.room = {
          ...this.room,
          phase: snapshot.phase,
          deadline: snapshot.deadline,
          roundNumber: snapshot.roundNumber ?? this.room.roundNumber,
          players: this.room.players.map((player) => ({ ...player, ...byId.get(player.id) })),
        };
        this.render();
        this.onRoom(this.room);
      }
      this.onSnapshot(snapshot);
      const now = Date.now(); if (now - this.lastRateWindow >= 1000) { this.snapshotHz = Math.round(this.snapshotsInWindow * 1000 / (now - this.lastRateWindow)); this.snapshotsInWindow = 0; this.lastRateWindow = now; this.reportNetwork(); }
    });
    this.socket.on('round:effect', (effect) => this.onEffect(effect));
    this.socket.on('net:pong', ({ sentAt }) => { this.pingMs = Math.max(0, Date.now() - Number(sentAt)); this.reportNetwork(); });
    this.socket.on('room:left', () => { this.room = null; this.render(); this.onRoom(null); });
    this.socket.on('disconnect', () => { this.input = { x: 0, z: 0 }; });
    this.inputTimer = setInterval(() => { if (['hide', 'hunt'].includes(this.room?.phase)) this.socket.emit('player:input', this.input); }, GAME_TICK_INTERVAL_MS);
    this.pingTimer = setInterval(() => { if (this.socket.connected) this.socket.emit('net:ping', Date.now()); }, 1000);
    this.uiTimer = setInterval(() => this.renderRoundHud(), 100);
    this.render();
  }
  validateName() { const name = this.nameInput.value.trim(); if (name.length < 2 || name.length > 14) { this.error.textContent = 'Enter your name'; this.nameInput.focus(); return null; } safeStorageSet('shadow-hunt-name', name); return name; }
  createRoom() { const name = this.validateName(); if (name) this.socket.emit('room:create', { name }); }
  joinRoom() { const name = this.validateName(); if (!name) return; const code = this.codeInput.value.toUpperCase(); if (code.length !== ROOM_CODE_LENGTH || [...code].some((char) => !CODE_ALPHABET.includes(char))) { this.error.textContent = 'Room not found'; return; } this.socket.emit('room:join', { name, code }); }
  chooseDisguise(type) { this.socket.emit('disguise:choose', { type }); }
  lockDisguise() { this.socket.emit('disguise:lock'); }
  strike(aim) { this.socket.emit('hunter:strike', aim); }
  setInput(input) { this.input = { x: clampInput(input?.x), z: clampInput(input?.z) }; }
  setWorldReady() { this.worldReady = true; this.worldError = ''; this.render(); }
  setWorldLoadError(message) { this.worldError = message || 'World assets failed to load. Refresh to retry.'; this.render(); }
  reportNetwork() { this.onNetwork({ pingMs: this.pingMs, snapshotHz: this.snapshotHz }); }
  clearError() { this.error.textContent = ''; }
  async copy(text) { try { await navigator.clipboard.writeText(text); this.error.textContent = 'Copied'; } catch { this.error.textContent = 'Copy unavailable'; } }
  leaveRoom() { if (this.room) this.socket.emit('room:leave'); else { this.landing.hidden = false; this.lobby.hidden = true; this.game.hidden = true; } }
  renderRoundHud() {
    const room = this.room; const hud = document.querySelector('#round-hud'); const picker = document.querySelector('#hider-picker'); const blocker = document.querySelector('#hunter-blocker'); const results = document.querySelector('#round-results');
    const active = room && ['hide', 'hunt'].includes(room.phase); hud.hidden = !active;
    if (!room) { picker.hidden = true; blocker.hidden = true; results.hidden = true; return; }
    const me = room.players.find((p) => p.id === room.playerId); const isHunter = me?.role === 'hunter';
    document.querySelector('#spectator-banner').hidden = !(active && me?.caught);
    document.querySelector('#round-role').textContent = isHunter ? 'YOU ARE THE HUNTER' : 'YOU ARE A HIDER';
    document.querySelector('#round-phase').textContent = room.phase === 'hide' ? 'HIDE PHASE' : 'HUNT PHASE';
    document.querySelector('#round-timer').textContent = String(Math.max(0, Math.ceil(((room.deadline || Date.now()) - Date.now()) / 1000)));
    const strikes = document.querySelector('#round-strikes'); strikes.hidden = !isHunter; strikes.textContent = `STRIKES ${room.strikesLeft ?? 0}`;
    const attackHint = document.querySelector('#attack-hint'); attackHint.hidden = !(room.phase === 'hunt' && isHunter && !me?.caught);
    document.querySelector('#round-alive').textContent = `PLAYERS ALIVE ${room.players.filter((p) => !p.caught).length}`;
    const hunterHiding = room.phase === 'hide' && isHunter;
    blocker.hidden = !hunterHiding; if (hunterHiding) blocker.textContent = `YOU ARE THE HUNTER\nHiders are hiding · ${Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000))}s`;
    picker.hidden = !(room.phase === 'hide' && me?.role === 'hider' && !me.disguiseLocked && !me.caught);
    document.querySelector('#lock-disguise').disabled = !me?.disguiseType || me?.disguiseLocked;
    results.hidden = room.phase !== 'results';
    if (room.phase === 'results') {
      const winner = room.results?.winner; document.querySelector('#results-title').textContent = winner === 'hunter' ? 'HUNTER WINS' : 'HIDERS WIN';
      document.querySelector('#results-reason').textContent = room.results?.reason === 'Hunter left' ? 'Hunter left' : room.results?.reason || '';
      const list = document.querySelector('#caught-list'); list.replaceChildren();
      for (const caught of room.results?.caught || []) { const li = document.createElement('li'); li.textContent = caught.name; list.append(li); }
      const host = Boolean(me?.host); document.querySelector('#restart-round').hidden = !host; document.querySelector('#back-lobby').hidden = !host; document.querySelector('#restart-waiting').hidden = host;
    }
    this.renderProps(me);
  }
  renderProps(me) {
    const grid = document.querySelector('#prop-grid'); if (!this.room || me?.role !== 'hider') { grid.replaceChildren(); return; }
    const fragment = document.createDocumentFragment();
    for (const prop of this.room.props || []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `prop-choice${me.disguiseType === prop.id ? ' selected' : ''}`; button.dataset.prop = prop.id;
      button.disabled = Boolean(prop.takenBy && prop.takenBy !== me.name) || Boolean(me.disguiseLocked);
      if (prop.preview) { const image = document.createElement('img'); image.src = prop.preview; image.alt = ''; button.append(image); }
      const label = document.createElement('span'); label.textContent = prop.takenBy && prop.takenBy !== me.name ? `${prop.label} · ${prop.takenBy}` : prop.label;
      button.append(label); fragment.append(button);
    }
    grid.replaceChildren(fragment);
  }
  render() {
    const room = this.room;
    if (!room) { this.landing.hidden = false; this.lobby.hidden = true; this.game.hidden = true; document.querySelector('#round-results').hidden = true; return; }
    this.landing.hidden = true; const inGame = room.phase !== 'lobby'; this.lobby.hidden = inGame; this.game.hidden = !inGame || !this.worldReady;
    document.querySelector('#room-code').textContent = room.code;
    const list = document.querySelector('#player-list'); list.replaceChildren();
    for (const player of room.players) { const row = document.createElement('li'); const name = document.createElement('span'); name.className = 'player-name'; name.textContent = player.name; name.style.color = player.color; const tags = document.createElement('span'); tags.className = 'player-tags'; if (player.host) { const tag = document.createElement('span'); tag.className = 'host-tag'; tag.textContent = 'HOST'; tags.append(tag); } const state = document.createElement('span'); state.textContent = player.ready ? 'READY' : 'NOT READY'; tags.append(state); row.append(name, tags); list.append(row); }
    const me = room.players.find((p) => p.id === room.playerId); const host = me?.host; const canStart = host && room.players.length >= 2 && room.players.filter((p) => !p.host).every((p) => p.ready) && this.worldReady;
    document.querySelector('#ready-button').hidden = inGame; document.querySelector('#ready-button').textContent = me?.ready ? 'Not ready' : 'Ready';
    document.querySelector('#start-button').hidden = !host || inGame; document.querySelector('#start-button').disabled = !canStart; document.querySelector('#start-button').textContent = this.worldReady ? 'Start' : this.worldError ? 'World load failed' : 'Loading world...';
    if (this.worldError) this.error.textContent = this.worldError;
    this.renderRoundHud();
  }
  dispose() { clearInterval(this.inputTimer); clearInterval(this.pingTimer); clearInterval(this.uiTimer); this.socket.disconnect(); }
}
function clampInput(value) { const number = Number(value) || 0; return Math.max(-1, Math.min(1, number)); }
function safeStorageGet(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* optional storage */ } }
