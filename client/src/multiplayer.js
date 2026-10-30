import { io } from 'socket.io-client';
import { GAME_TICK_INTERVAL_MS, ROOM_CODE_LENGTH } from '../../shared/constants.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class MultiplayerClient {
  constructor({ onRoom = () => {}, onSnapshot = () => {}, onNetwork = () => {}, onError = () => {} } = {}) {
    this.onRoom = onRoom; this.onSnapshot = onSnapshot; this.onNetwork = onNetwork; this.onError = onError;
    this.room = null; this.input = { x: 0, z: 0 }; this.worldReady = false; this.snapshotsInWindow = 0; this.lastRateWindow = Date.now(); this.pingMs = null; this.snapshotHz = 0;
    this.nameInput = document.querySelector('#player-name');
    this.codeInput = document.querySelector('#room-code-input');
    this.error = document.querySelector('#lobby-error');
    this.landing = document.querySelector('#landing-screen'); this.lobby = document.querySelector('#lobby-screen'); this.game = document.querySelector('#game-shell');
    this.nameInput.value = safeStorageGet('shadow-hunt-name');
    const urlCode = new URLSearchParams(location.search).get('room') || '';
    this.codeInput.value = [...urlCode.toUpperCase()].filter((char) => CODE_ALPHABET.includes(char)).slice(0, ROOM_CODE_LENGTH).join('');
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
    this.socket.on('connect', () => this.clearError());
    this.socket.on('room:created', ({ code }) => { this.codeInput.value = code; if (botCount) this.socket.emit('debug:addBots', { count: botCount }); });
    this.socket.on('room:joined', () => this.clearError());
    this.socket.on('room:error', ({ message }) => { this.error.textContent = message || 'Unable to join room'; this.onError(message); this.render(); });
    this.socket.on('room:update', (room) => { this.room = room; this.render(); this.onRoom(room); });
    this.socket.on('room:snapshot', (snapshot) => {
      this.snapshotsInWindow += 1; this.onSnapshot(snapshot);
      const now = Date.now();
      if (now - this.lastRateWindow >= 1000) { this.snapshotHz = Math.round(this.snapshotsInWindow * 1000 / (now - this.lastRateWindow)); this.snapshotsInWindow = 0; this.lastRateWindow = now; this.reportNetwork(); }
    });
    this.socket.on('net:pong', ({ sentAt }) => { this.pingMs = Math.max(0, Date.now() - Number(sentAt)); this.reportNetwork(); });
    this.socket.on('room:left', () => { this.room = null; this.render(); this.onRoom(null); });
    this.socket.on('disconnect', () => { this.input = { x: 0, z: 0 }; });
    this.inputTimer = setInterval(() => { if (this.room?.phase === 'game') this.socket.emit('player:input', this.input); }, GAME_TICK_INTERVAL_MS);
    this.pingTimer = setInterval(() => { if (this.socket.connected) this.socket.emit('net:ping', Date.now()); }, 1000);
    this.render();
  }

  validateName() {
    const name = this.nameInput.value.trim();
    if (name.length < 2 || name.length > 14) { this.error.textContent = 'Enter your name'; this.nameInput.focus(); return null; }
    safeStorageSet('shadow-hunt-name', name); return name;
  }
  createRoom() { const name = this.validateName(); if (name) this.socket.emit('room:create', { name }); }
  joinRoom() {
    const name = this.validateName(); if (!name) return;
    const code = this.codeInput.value.toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH || [...code].some((char) => !CODE_ALPHABET.includes(char))) { this.error.textContent = 'Room not found'; return; }
    this.socket.emit('room:join', { name, code });
  }
  setInput(input) { this.input = { x: clampInput(input?.x), z: clampInput(input?.z) }; }
  setWorldReady() { this.worldReady = true; this.render(); }
  reportNetwork() { this.onNetwork({ pingMs: this.pingMs, snapshotHz: this.snapshotHz }); }
  clearError() { this.error.textContent = ''; }
  async copy(text) { try { await navigator.clipboard.writeText(text); this.error.textContent = 'Copied'; } catch { this.error.textContent = 'Copy unavailable'; } }
  leaveRoom() { if (this.room) this.socket.emit('room:leave'); else { this.landing.hidden = false; this.lobby.hidden = true; this.game.hidden = true; } }

  render() {
    const room = this.room;
    if (!room) { this.landing.hidden = false; this.lobby.hidden = true; this.game.hidden = true; return; }
    this.landing.hidden = true;
    const gameStarted = room.phase === 'game';
    this.lobby.hidden = gameStarted; this.game.hidden = !gameStarted || !this.worldReady;
    document.querySelector('#room-code').textContent = room.code;
    const list = document.querySelector('#player-list'); list.replaceChildren();
    for (const player of room.players) {
      const row = document.createElement('li');
      const name = document.createElement('span'); name.className = 'player-name'; name.textContent = player.name; name.style.color = player.color;
      const tags = document.createElement('span'); tags.className = 'player-tags';
      if (player.host) { const host = document.createElement('span'); host.className = 'host-tag'; host.textContent = 'HOST'; tags.append(host); }
      const ready = document.createElement('span'); ready.textContent = player.ready ? 'READY' : player.isBot ? 'READY' : 'NOT READY'; tags.append(ready);
      row.append(name, tags); list.append(row);
    }
    const me = room.players.find((player) => player.id === room.playerId);
    const isHost = me?.host;
    const canStart = isHost && room.players.length >= 2 && room.players.filter((player) => !player.host).every((player) => player.ready) && this.worldReady;
    document.querySelector('#ready-button').textContent = me?.ready ? 'Not ready' : 'Ready';
    document.querySelector('#start-button').hidden = !isHost;
    document.querySelector('#start-button').disabled = !canStart;
    document.querySelector('#start-button').textContent = this.worldReady ? 'Start' : 'Loading world...';
  }

  dispose() { clearInterval(this.inputTimer); clearInterval(this.pingTimer); this.socket.disconnect(); }
}

function clampInput(value) { const number = Number(value) || 0; return Math.max(-1, Math.min(1, number)); }
function safeStorageGet(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function safeStorageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ } }
