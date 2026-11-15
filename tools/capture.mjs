// capture.mjs — render the four dossier screenshots in headless Chromium over
// the DevTools protocol (Node's built-in WebSocket, no dependencies). For each
// scene in shots.json: navigate, wait for window.__shotReady, capture a JPEG,
// and record console errors and any request that leaves localhost.
//   node tools/capture.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 9333;
const BASE = 'http://localhost:8080';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('timed out waiting for ' + url);
}

// A minimal CDP client: request/response by id, plus an event hook.
class Cdp {
  constructor(ws, sessionId = null) {
    this.ws = ws; this.sessionId = sessionId;
    this.nextId = 1; this.pending = new Map(); this.onEvent = null;
    if (!sessionId) {
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        for (const c of Cdp.clients) {
          if (msg.sessionId !== (c.sessionId ?? undefined)) continue;
          if (msg.id && c.pending.has(msg.id)) {
            const { resolve, reject } = c.pending.get(msg.id);
            c.pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
          } else if (msg.method && c.onEvent) c.onEvent(msg.method, msg.params);
        }
      });
    }
    Cdp.clients.push(this);
  }
  static clients = [];
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const envelope = { id, method, params };
      if (this.sessionId) envelope.sessionId = this.sessionId;
      this.ws.send(JSON.stringify(envelope));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  }
}

async function main() {
  const server = spawn('node', [join(ROOT, 'serve.ts'), '8080'], { detached: true, stdio: 'ignore' });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--window-size=1280,720', '--force-device-scale-factor=1',
    '--remote-debugging-port=' + PORT, 'about:blank',
  ], { detached: true, stdio: 'ignore' });
  try {
    const version = await waitForHttp('http://localhost:' + PORT + '/json/version');
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const browser = new Cdp(ws);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Cdp(ws, sessionId);
    await run(page);
    ws.close();
  } finally {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already gone */ }
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

async function run(page) {
  const errors = [];
  const outside = [];
  page.onEvent = (method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errors.push(params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (method === 'Runtime.exceptionThrown') errors.push('exception: ' + (params.exceptionDetails?.exception?.description ?? 'unknown'));
    if (method === 'Network.requestWillBeSent' && !params.request.url.startsWith(BASE) && !params.request.url.startsWith('data:')) {
      outside.push(params.request.url);
    }
  };
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  const shots = JSON.parse(readFileSync(join(ROOT, 'shots.json'), 'utf8'));
  for (const shot of shots) {
    await page.send('Page.navigate', { url: BASE + '/' + shot.query });
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      await sleep(200);
      try { ready = await page.eval('window.__shotReady === true'); } catch { /* page still loading */ }
    }
    if (!ready) throw new Error(shot.name + ': window.__shotReady never set');
    await sleep(120);
    let quality = 88;
    let data = null;
    while (quality >= 60) {
      const shotRes = await page.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
      data = Buffer.from(shotRes.data, 'base64');
      if (data.length <= 256 * 1024) break;
      quality -= 8;
    }
    writeFileSync(join(ROOT, 'screenshots', shot.name), data);
    console.log(shot.name + ': ' + data.length + ' bytes (jpeg q' + quality + ')');
  }
  console.log('console errors: ' + errors.length + (errors.length ? ' — ' + errors.join(' | ') : ''));
  console.log('outside requests: ' + outside.length + (outside.length ? ' — ' + outside.join(' | ') : ''));
  if (errors.length || outside.length) process.exitCode = 1;
}

await main();

