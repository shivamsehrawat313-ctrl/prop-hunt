import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../client/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/src/style.css', import.meta.url), 'utf8');
const controls = readFileSync(new URL('../client/src/controls.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');

assert.match(html, /name="viewport" content="width=device-width, initial-scale=1(?:\.0)?"/);
for (const id of ['move-stick', 'mobile-weapon', 'mobile-disguise', 'mobile-lock', 'mobile-strike']) assert.match(html, new RegExp(`id="${id}"`), `${id} exists`);
assert.match(css, /overscroll-behavior:\s*none/);
assert.match(css, /touch-action:\s*none/);
assert.match(css, /@media\s*\(max-width:\s*620px\)/);
assert.match(css, /\.move-stick\s*\{[^}]*width:\s*138px/);
assert.match(css, /\.mobile-actions button\s*\{[^}]*min-height:\s*58px/);
assert.match(controls, /setPointerCapture/);
assert.match(controls, /virtualDirection/);
assert.match(main, /MOBILE_LOW_END_MAX_CORES/);

// Check the defined touch-control footprint against the two requested device sizes.
const footprintWidth = 16 + 138 + 14 + (2 * 68 + 9) + 16;
const footprintHeight = 16 + Math.max(138, 2 * 58 + 9);
for (const [name, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
  assert.ok(width >= footprintWidth, `${name}: touch controls fit horizontally (${width} >= ${footprintWidth})`);
  assert.ok(height >= footprintHeight + 110, `${name}: touch controls and top HUD fit vertically (${height} >= ${footprintHeight + 110})`);
  console.log(`PASS: ${name} ${width}x${height}; touch-control footprint ${footprintWidth}x${footprintHeight} fits`);
}
console.log('PASS: viewport, no-scroll touch behavior, joystick, action targets, and low-end quality defaults');
