import assert from 'node:assert/strict';

const baseUrl = process.argv[2] || 'http://localhost:3000';
const page = await fetch(baseUrl);
assert.equal(page.status, 200, `app page returned ${page.status}`);
const html = await page.text();
const stylesheetPath = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"|<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"/i)?.slice(1).find(Boolean);
assert.ok(stylesheetPath, 'production HTML includes a stylesheet link');
const stylesheetUrl = new URL(stylesheetPath, baseUrl);
const stylesheet = await fetch(stylesheetUrl);
assert.equal(stylesheet.status, 200, `stylesheet ${stylesheetUrl.pathname} returned ${stylesheet.status}`);
assert.match(stylesheet.headers.get('content-type') || '', /text\/css/i, 'stylesheet response uses CSS content type');
const css = await stylesheet.text();
const compactCss = css.replaceAll('::', ':');
for (const selector of ['#lobby-video', 'body:after', '.landing-card', '.or-divider', '.loading-track']) {
  assert.ok(compactCss.includes(selector), `built stylesheet contains ${selector}`);
}
console.log(`PASS: production stylesheet ${stylesheetUrl.pathname} loaded with HTTP ${stylesheet.status}; landing, video overlay, and loading styles are present.`);
