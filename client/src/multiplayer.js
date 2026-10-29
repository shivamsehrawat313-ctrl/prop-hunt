import { GAME_TICK_HZ, MAX_PLAYERS, MIN_PLAYERS, PLAYER_NAME_MAX_LENGTH, PLAYER_NAME_MIN_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/constants.js';
import { io } from 'socket.io-client';

export class MultiplayerClient {
  constructor({ onState = () => {}, onEvent = () => {}, onInput = () => {}, unlockAudio = () => {} } = {}) {
    this.onState = onState; this.onEvent = onEvent; this.onInput = onInput; this.unlockAudio = unlockAudio;
    this.socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true, reconnection: true, reconnectionAttempts: Infinity, timeout: 8000 });
    this.room = null; this.selfId = null; this.pendingCode = '';
    this.connectedOnce = false;
    this.nameInput = document.querySelector('#player-name');
    this.nameInput.value = localStorage.getItem('shadow-hunt-name') || '';
    this.codeInput = document.querySelector('#room-code-input');
    this.codeInput.maxLength = ROOM_CODE_LENGTH;
    this.errorNode = document.querySelector('#lobby-error');
    const inviteCode = new URLSearchParams(location.search).get('room');
    if (inviteCode) this.codeInput.value = inviteCode.toUpperCase().slice(0, ROOM_CODE_LENGTH);
    this.codeInput.addEventListener('input', () => { this.codeInput.value = [...this.codeInput.value.toUpperCase()].filter((character) => ROOM_CODE_ALPHABET.includes(character)).slice(0, ROOM_CODE_LENGTH).join(''); });
    document.querySelector('#create-room').addEventListener('click', () => this.createRoom());
    document.querySelector('#join-room').addEventListener('click', () => this.joinRoom());
    document.querySelector('#ready-button').addEventListener('click', () => this.socket.emit('lobby:ready'));
    document.querySelector('#start-button').addEventListener('click', () => this.socket.emit('lobby:start'));
    document.querySelector('#leave-room').addEventListener('click', () => { this.socket.emit('room:leave'); this.showLanding(); });
    document.querySelector('#copy-code').addEventListener('click', () => navigator.clipboard?.writeText(this.room?.code || ''));
    document.querySelector('#copy-link').addEventListener('click', () => { const link = `${location.origin}/?room=${this.room?.code || ''}`; navigator.clipboard?.writeText(link); });
    document.querySelector('#how-to-open').addEventListener('click', () => { document.querySelector('#lobby-screen').hidden = true; document.querySelector('#how-to-screen').hidden = false; });
    document.querySelector('#how-to-close').addEventListener('click', () => { document.querySelector('#how-to-screen').hidden = true; document.querySelector('#lobby-screen').hidden = false; });
    document.querySelector('#next-round').addEventListener('click', () => this.socket.emit('match:next'));
    document.querySelector('#new-match').addEventListener('click', () => this.socket.emit('match:again'));
    document.querySelector('#weapon-select').addEventListener('change', (event) => this.socket.emit('weapon:select', { weapon: event.target.value }));
    document.querySelector('#disguise-select').addEventListener('change', (event) => this.socket.emit('disguise:select', { type: event.target.value }));
    document.querySelector('#lock-disguise').addEventListener('click', () => this.socket.emit('disguise:lock'));
    document.querySelector('#strike-button').addEventListener('click', () => this.strike());
    window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'e' && this.room?.phase === 'hunt') this.socket.emit('disguise:lock'); });
    this.socket.on('connect', () => {
      this.selfId = this.socket.id;
      if (this.connectedOnce && this.room?.code) this.socket.emit('room:join', { name: this.nameInput.value.trim(), code: this.room.code });
      this.connectedOnce = true;
    });
    this.socket.on('room:created', ({ code }) => {
      this.pendingCode = code; this.errorNode.textContent = '';
      const bots = Math.min(2, Number(new URLSearchParams(location.search).get('bots')) || 0);
      if (bots) this.socket.emit('debug:addBots', { count: bots });
    });
    this.socket.on('room:joined', ({ code }) => { this.pendingCode = code; this.errorNode.textContent = ''; });
    this.socket.on('room:error', ({ message }) => { this.errorNode.textContent = message || 'Something went wrong'; });
    this.socket.on('room:state', (room) => this.applyState(room));
    this.socket.on('game:strike', (event) => this.onEvent('strike', event));
    this.socket.on('game:event', (event) => this.onEvent(event.type, event));
    this.input = { x: 0, z: 0, aim: { x: 0, z: 1 } };
    this.interval = setInterval(() => { if (this.room && ['hide', 'hunt'].includes(this.room.phase)) this.socket.emit('player:input', this.input); }, 1000 / GAME_TICK_HZ);
    document.querySelector('#landing-screen').hidden = false;
  }

  validName() {
    const name = this.nameInput.value.trim();
    if (name.length < PLAYER_NAME_MIN_LENGTH || name.length > PLAYER_NAME_MAX_LENGTH) { this.errorNode.textContent = 'Enter your name'; this.nameInput.focus(); return null; }
    localStorage.setItem('shadow-hunt-name', name); this.unlockAudio(); return name;
  }
  createRoom() { const name = this.validName(); if (name) this.socket.emit('room:create', { name }); }
  joinRoom() { const name = this.validName(); if (!name) return; if (this.codeInput.value.length !== ROOM_CODE_LENGTH) { this.errorNode.textContent = 'Room not found'; return; } this.socket.emit('room:join', { name, code: this.codeInput.value }); }
  setInput(input) { this.input = { ...this.input, x: input.x, z: input.z }; }
  setAim(aim) { this.input.aim = aim; }
  strike() { this.socket.emit('game:strike', { weapon: document.querySelector('#weapon-select').value, aim: this.input.aim }); }
  showLanding() { this.room = null; document.querySelector('#game-shell').hidden = true; document.querySelector('#lobby-screen').hidden = true; document.querySelector('#landing-screen').hidden = false; }

  applyState(room) {
    this.room = room;
    this.serverClockOffset = room.serverTime - Date.now();
    const me = room.players.find((player) => player.id === this.socket.id);
    const inMatch = ['hide', 'hunt'].includes(room.phase);
    const inScore = ['scoreboard', 'final'].includes(room.phase);
    if (room.phase === 'lobby') {
      document.querySelector('#landing-screen').hidden = true;
      document.querySelector('#how-to-screen').hidden = true;
      document.querySelector('#lobby-screen').hidden = false;
      document.querySelector('#game-shell').hidden = true;
      document.querySelector('#hunter-blackout').hidden = true;
      document.querySelector('#room-code').textContent = room.code;
      const list = document.querySelector('#player-list'); list.replaceChildren();
      for (const player of room.players) { const item = document.createElement('li'); item.textContent = `${player.name}${player.id === room.hostId ? ' · Host' : ''}`; const ready = document.createElement('span'); ready.textContent = player.ready ? 'READY' : 'NOT READY'; item.append(ready); list.append(item); }
      document.querySelector('#ready-button').textContent = me?.ready ? 'Not ready' : 'Ready';
      document.querySelector('#start-button').disabled = this.socket.id !== room.hostId || room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS || room.players.some((p) => !p.ready);
    }
    if (inMatch) {
      document.querySelector('#landing-screen').hidden = true; document.querySelector('#lobby-screen').hidden = true; document.querySelector('#scoreboard-screen').hidden = true; document.querySelector('#game-shell').hidden = false;
      const hud = document.querySelector('#game-hud'); hud.hidden = false;
      const hunterBlackout = me?.role === 'hunter' && room.phase === 'hide';
      document.querySelector('#hunter-blackout').hidden = !hunterBlackout;
      document.querySelector('#game-role').textContent = me?.role === 'hunter' ? 'YOU ARE THE HUNTER' : 'HIDE!';
      document.querySelector('#game-status').textContent = room.phase === 'hide' ? (me?.role === 'hunter' ? 'Hiders are hiding' : 'Choose a disguise and hide') : `${room.players.filter((p) => p.role === 'hider' && p.alive).length} hiders alive`;
      document.querySelector('#strike-count').textContent = me?.role === 'hunter' ? `STRIKES ${room.strikes}/3` : '';
      const seconds = Math.max(0, Math.ceil((room.phaseEndsAt - (Date.now() + this.serverClockOffset)) / 1000));
      document.querySelector('#game-timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      document.querySelector('#weapon-select').disabled = me?.role !== 'hunter' || room.phase !== 'hide';
      document.querySelector('#disguise-select').disabled = me?.role !== 'hider';
      document.querySelector('#lock-disguise').hidden = me?.role !== 'hider';
      document.querySelector('#lock-disguise').textContent = me?.locked ? 'Unlock disguise (E)' : 'Lock disguise (E)';
      document.querySelector('#strike-button').hidden = me?.role !== 'hunter' || room.phase !== 'hunt';
      this.onState(room, me);
    }
    if (inScore) {
      document.querySelector('#game-shell').hidden = false; document.querySelector('#game-hud').hidden = true;
      const overlay = document.querySelector('#scoreboard-screen'); overlay.hidden = false;
      document.querySelector('#hunter-blackout').hidden = true;
      document.querySelector('#round-result').textContent = room.phase === 'final' ? 'MATCH COMPLETE' : `${room.winner === 'hunter' ? 'HUNTER WINS' : 'HIDERS WIN'} · ROUND ${room.round}`;
      const list = document.querySelector('#scoreboard-list'); list.replaceChildren();
      for (const player of [...room.players].sort((a, b) => b.score - a.score)) { const item = document.createElement('li'); item.textContent = `${player.name}${player.id === room.hunterId ? ' · Hunter' : ''}`; const score = document.createElement('span'); score.textContent = `${player.score} pts`; item.append(score); list.append(item); }
      const final = room.phase === 'final'; document.querySelector('#next-round').hidden = final || this.socket.id !== room.hostId; document.querySelector('#new-match').hidden = !final || this.socket.id !== room.hostId;
      document.querySelector('#new-match').onclick = () => this.socket.emit('match:again');
    }
    if (room.phase === 'lobby') document.querySelector('#scoreboard-screen').hidden = true;
  }
}
