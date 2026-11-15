// playtest.mjs — drive the real game in headless Chromium: open the title,
// click NORMAL, build a tower on a plot, loose wave 1, pause and resume —
// while counting console errors and any request that leaves localhost.
//   node tools/playtest.mjs
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 9334;
const BASE = 'http://localhost:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('timed out waiting for ' + url);
}

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
    await drive(page);
    ws.close();
  } finally {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already gone */ }
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

async function drive(page) {
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

  const snap = async (name) => {
    const r = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buf = Buffer.from(r.data, 'base64');
    writeFileSync('/tmp/' + name, buf);
    return buf;
  };
  const click = async (x, y) => {
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const key = async (k) => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'Key' + k.toUpperCase() });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Key' + k.toUpperCase() });
  };

  await page.send('Page.navigate', { url: BASE + '/' });
  await sleep(1200);
  const rect = await page.eval('JSON.stringify(document.querySelector("canvas").getBoundingClientRect())');
  console.log('canvas rect: ' + rect);
  await snap('pt-1-title.png');

  await click(640, 511); // the NORMAL difficulty card
  await sleep(500);
  await snap('pt-2-buildphase.png');

  await click(108, 290); // plot (1,3): raise the picked tower there
  await sleep(400);
  await snap('pt-3-built.png');

  await click(1076, 631); // START WAVE button
  await sleep(3000);
  await snap('pt-4-wave.png');

  await key('p'); // pause
  await sleep(250);
  const pausedA = await snap('pt-5-paused-a.png');
  await sleep(1500);
  const pausedB = await snap('pt-6-paused-b.png');
  console.log('pause holds the frame still: ' + pausedA.equals(pausedB));

  await key('p'); // resume
  await key('f'); // double speed for a moment
  await sleep(1200);
  await snap('pt-7-resumed.png');

  console.log('console errors: ' + errors.length + (errors.length ? ' — ' + errors.join(' | ') : ''));
  console.log('outside requests: ' + outside.length + (outside.length ? ' — ' + outside.join(' | ') : ''));
  if (errors.length || outside.length) process.exitCode = 1;
}

await main();
