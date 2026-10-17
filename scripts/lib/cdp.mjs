// Минимальный клиент Chrome DevTools Protocol без зависимостей (Node 22+: встроенный WebSocket).
// Запускает локальный Chrome/Edge в headless-режиме во временном профиле.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333 + Math.floor(Math.random() * 500) } = {}) {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('Chrome не найден: укажите CHROME_PATH');
  const profile = await mkdtemp(join(tmpdir(), 'yv-cdp-'));
  const proc = spawn(exe, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank',
  ], { stdio: 'ignore' });

  let pageWs = null;
  for (let i = 0; i < 100 && !pageWs; i++) {
    await sleep(100);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      pageWs = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {
      /* Chrome ещё стартует */
    }
  }
  if (!pageWs) {
    proc.kill();
    throw new Error('Chrome не ответил по DevTools');
  }
  const page = await Page.connect(pageWs);
  return {
    page,
    async close() {
      page.ws.close();
      proc.kill();
      await sleep(300);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

export class Page {
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const page = new Page(ws);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return page;
  }

  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.console = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
          this.console.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          this.console.push(`exception: ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
        }
        (this.listeners.get(msg.method) || []).forEach((cb) => cb(msg.params));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method) {
    return new Promise((resolve) => {
      const cb = (params) => {
        this.listeners.set(method, (this.listeners.get(method) || []).filter((f) => f !== cb));
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) || []), cb]);
    });
  }

  async viewport(width, height, { mobile = false, scale = 1 } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  }

  async media(features) {
    await this.send('Emulation.setEmulatedMedia', { features });
  }

  async goto(url) {
    const loaded = this.once('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await loaded;
    await sleep(400);
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  async mouse(x, y, type = 'mouseMoved', extra = {}) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async key(key, { code = key, keyCode = 0, shift = false } = {}) {
    const modifiers = shift ? 8 : 0;
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  }

  async type(text) {
    await this.send('Input.insertText', { text });
  }

  async screenshot(path, { fullPage = false, clip } = {}) {
    const params = { format: 'png', captureBeyondViewport: fullPage };
    if (fullPage) {
      const m = await this.send('Page.getLayoutMetrics');
      params.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 };
    } else if (clip) {
      params.clip = { scale: 1, ...clip };
    }
    const { data } = await this.send('Page.captureScreenshot', params);
    await writeFile(path, Buffer.from(data, 'base64'));
    return path;
  }
}

export { sleep };
