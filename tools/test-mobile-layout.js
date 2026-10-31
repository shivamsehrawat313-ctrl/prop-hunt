import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const { access } = await import('node:fs/promises');
let chromePath;
for (const candidate of chromeCandidates) {
  try { await access(candidate); chromePath = candidate; break; } catch { /* Try next installed browser. */ }
}
assert.ok(chromePath, 'Chrome or Edge is required for viewport layout checks');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitFor(url, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { const response = await fetch(url); if (response.ok) return response; } catch { /* Server starting. */ }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const vitePort = await freePort();
const debugPort = await freePort();
const profile = await mkdtemp(join(tmpdir(), 'shadow-hunt-mobile-'));
const sourceHtml = await readFile(new URL('../client/index.html', import.meta.url), 'utf8');
const mainJs = await readFile(new URL('../client/src/main.js', import.meta.url), 'utf8');
assert.match(sourceHtml, /viewport-fit=cover/);
assert.match(sourceHtml, /maximum-scale=1, user-scalable=no/);
assert.match(mainJs, /const touchDevice = matchMedia\('\(pointer: coarse\)'\)\.matches \|\| navigator\.maxTouchPoints > 0;\s*let quality = touchDevice \? 'low' : 'high';/);
const bodyMarkup = sourceHtml.match(/<body>([\s\S]*?)<\/body>/i)?.[1]?.replace(/<script\s+type="module"\s+src="\/src\/main\.js"><\/script>/, '') || '';
const fixtureHtml = sourceHtml.replace(/<body>[\s\S]*?<\/body>/i, `<body>${bodyMarkup}<script type="module">import { MobileExperience } from '/src/mobileExperience.js'; window.__mobileExperience = new MobileExperience();</script></body>`)
  .replace('</head>', '<link rel="stylesheet" href="/src/style.css"></head>');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.config.js', '--configLoader', 'runner', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { stdio: 'ignore' });
const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--enable-unsafe-swiftshader', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let websocket;
let closeBrowser = async () => {};
try {
  const baseUrl = `http://127.0.0.1:${vitePort}`;
  await waitFor(baseUrl);
  console.log('Vite is serving the game; launching headless browser checks.');
  const version = await (await waitFor(`http://127.0.0.1:${debugPort}/json/version`)).json();
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl)}`, { method: 'PUT' });
  const target = await targetResponse.json();
  websocket = new WebSocket(target.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => { websocket.addEventListener('open', resolve, { once: true }); websocket.addEventListener('error', reject, { once: true }); }),
    delay(8000).then(() => { throw new Error('Timed out connecting to Chrome DevTools'); }),
  ]);
  let nextId = 0;
  const pending = new Map();
  websocket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') console.error('Browser exception:', message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') console.error('Browser console error:', message.params.args?.map((arg) => arg.value || arg.description).join(' '));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject }); websocket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 12000).unref();
  });
  closeBrowser = () => cdp('Browser.close');
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const navigate = async (width, height) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
    await cdp('Page.navigate', { url: baseUrl });
    const frame = await cdp('Page.getFrameTree');
    await cdp('Page.setDocumentContent', { frameId: frame.frameTree.frame.id, html: fixtureHtml });
    const started = Date.now();
    while (Date.now() - started < 30000) {
      try {
        const result = await cdp('Runtime.evaluate', { expression: 'Boolean(window.__mobileExperience)', returnByValue: true });
        if (result.result.value) break;
      } catch { /* Navigation still in progress. */ }
      await delay(150);
    }
    const result = await cdp('Runtime.evaluate', { expression: 'Boolean(window.__mobileExperience)', returnByValue: true });
    if (!result.result.value) {
      const diagnostics = await cdp('Runtime.evaluate', { expression: '({url:location.href,ready:document.readyState,title:document.title,body:document.body.innerText.slice(0,500)})', returnByValue: true });
      throw new Error(`game UI module did not initialize: ${JSON.stringify(diagnostics.result.value)}`);
    }
    await cdp('Runtime.evaluate', { expression: `(() => { const shell=document.querySelector('#game-shell'); shell.hidden=false; document.querySelector('#round-hud').hidden=false; const grid=document.querySelector('#prop-grid'); grid.replaceChildren(...Array.from({length:6},(_,i)=>{const b=document.createElement('button');b.className='prop-choice';b.textContent='Prop '+i;return b;})); document.querySelector('#hider-picker').hidden=false; document.querySelector('#lock-disguise').hidden=false; window.__mobileExperience.setRoomState({phase:'hunt',playerId:'self',players:[{id:'self',role:'hunter'}]}); return true; })()`, returnByValue: true });
    await delay(80);
  };
  const evaluate = async (expression) => (await cdp('Runtime.evaluate', { expression, returnByValue: true })).result.value;

  for (const [width, height] of [[844, 390], [740, 360], [667, 375]]) {
    await navigate(width, height);
    const layout = await evaluate(`(() => {
      const rect = (selector) => { const e=document.querySelector(selector), r=e.getBoundingClientRect(), s=getComputedStyle(e); return {x:r.x,y:r.y,w:r.width,h:r.height,display:s.display,position:s.position,right:s.right,bottom:s.bottom,hidden:e.hidden}; };
      return { viewport:{w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}, rotate:rect('#rotate-overlay'), stick:rect('.move-stick'), controls:rect('#mobile-controls'), attack:rect('#mobile-attack'), hud:rect('#round-hud'), map:rect('.minimap-frame'), brand:rect('.hud-top-left') };
    })()`);
    assert.equal(layout.rotate.hidden, true, `${width}x${height}: rotate overlay hidden in landscape`);
    assert.equal(layout.viewport.scrollW, width, `${width}x${height}: no horizontal page overflow`);
    assert.equal(layout.viewport.scrollH, height, `${width}x${height}: no vertical page overflow`);
    for (const [name, box] of [['stick', layout.stick], ['controls', layout.controls], ['attack', layout.attack], ['hud', layout.hud], ['minimap', layout.map], ['brand', layout.brand]]) {
      assert.notEqual(box.display, 'none', `${width}x${height}: ${name} is visible`);
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.w <= width + 1 && box.y + box.h <= height + 1, `${width}x${height}: ${name} is inside viewport`);
      if (!['brand', 'minimap'].includes(name)) assert.ok(box.h <= height * 0.45, `${width}x${height}: ${name} is <=45% viewport height`);
    }
    assert.ok(layout.controls.h <= height * 0.45, `${width}x${height}: control overlay <=45% viewport height`);
    assert.ok(layout.map.h <= height * 0.22, `${width}x${height}: minimap <=22% viewport height`);
    assert.ok(layout.stick.x + layout.stick.w < layout.attack.x, `${width}x${height}: joystick and attack button do not overlap`);
    assert.ok(layout.attack.x >= width * 0.55, `${width}x${height}: attack control is bottom-right`);
    const hider = await evaluate(`(() => { window.__mobileExperience.setRoomState({phase:'hide',playerId:'self',players:[{id:'self',role:'hider'}]}); const r=(s)=>{const e=document.querySelector(s),b=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:b.x,y:b.y,w:b.width,h:b.height,display:c.display,hidden:e.hidden}}; return {lock:r('#lock-disguise'),picker:r('#hider-picker'),stick:r('.move-stick'),props:[...document.querySelectorAll('.prop-choice')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})}; })()`);
    for (const [name, box] of [['lock', hider.lock], ['picker', hider.picker]]) {
      assert.notEqual(box.display, 'none', `${width}x${height}: hider ${name} is visible`);
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.w <= width + 1 && box.y + box.h <= height + 1, `${width}x${height}: hider ${name} is inside viewport`);
      assert.ok(box.h <= height * 0.45, `${width}x${height}: hider ${name} <=45% viewport height`);
    }
    assert.ok(hider.lock.x >= width * 0.55, `${width}x${height}: lock control is bottom-right`);
    assert.ok(hider.props.every((button) => button.w >= 44 && button.h >= 44), `${width}x${height}: prop buttons >=44px`);
    assert.ok(hider.picker.y + hider.picker.h < hider.stick.y, `${width}x${height}: picker and joystick do not overlap`);
    console.log(`PASS: ${width}x${height} landscape — HUD, minimap, joystick, prop picker and action targets fit without overlap`);
  }

  await navigate(390, 844);
  const portrait = await evaluate(`(() => { const e=document.querySelector('#rotate-overlay'),r=e.getBoundingClientRect(); return {hidden:e.hidden,display:getComputedStyle(e).display,w:r.width,h:r.height}; })()`);
  assert.equal(portrait.hidden, false, 'portrait round shows rotate overlay');
  assert.equal(portrait.display, 'flex', 'portrait rotate overlay is visible');
  assert.equal(portrait.w, 390); assert.equal(portrait.h, 844);
  console.log('PASS: 390x844 portrait — round displays the full-screen rotate-phone overlay');
  console.log(`Browser: ${version.Browser}`);
} finally {
  await Promise.race([closeBrowser().catch(() => {}), delay(1000)]);
  websocket?.close();
  const children = [chrome, vite];
  await Promise.race([Promise.all(children.map((child) => child.exitCode !== null ? Promise.resolve() : new Promise((resolve) => child.once('exit', resolve)))), delay(2200)]);
  for (const child of children) if (child.pid && child.exitCode === null) child.kill('SIGTERM');
  await delay(250);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
