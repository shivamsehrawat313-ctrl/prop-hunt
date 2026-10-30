import { writeFile } from 'node:fs/promises';

const page = (await (await fetch('http://localhost:9223/json/list')).json())
  .find((item) => item.type === 'page' && /localhost:5173|127\.0\.0\.1:5173/.test(item.url || ''));
if (!page) throw new Error('Open the game at http://localhost:5173 in Chrome first.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const expression = `new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{if(window.__environmentColliders?.length)resolve(JSON.stringify(window.__environmentColliders));else if(Date.now()-start>60000)reject(new Error('World collider generation timed out'));else setTimeout(poll,250)};poll()})`;
const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
socket.close();
const colliders = JSON.parse(result.result.value);
await writeFile(new URL('../shared/worldColliders.json', import.meta.url), `${JSON.stringify(colliders)}\n`);
console.log(`Wrote ${colliders.length} seeded world collision circles.`);
