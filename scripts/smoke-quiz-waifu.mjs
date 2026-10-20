import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'quiz-waifu-smoke');
fs.mkdirSync(out, { recursive: true });

const server = spawn('python', ['scripts/serve.py', '8099'], { cwd: root, stdio: 'ignore', windowsHide: true });
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9351',
  `--user-data-dir=${path.join(out, 'chrome-profile')}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--window-size=1440,1100',
  '--remote-allow-origins=*',
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
let next = 1;
const pending = new Map();
const errors = [];

async function send(method, params = {}) {
  const id = next++;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  ws.send(JSON.stringify({ id, method, params }));
  return promise;
}

async function run(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await run(expression)) return true;
    } catch {}
    await sleep(150);
  }
  return false;
}

try {
  let pages = null;
  for (let i = 0; i < 100; i++) {
    try {
      pages = await (await fetch('http://127.0.0.1:9351/json/list')).json();
      if ((await fetch('http://127.0.0.1:8099/')).ok) break;
    } catch {}
    await sleep(100);
  }
  if (!pages) throw new Error('Chrome unavailable');

  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const pendingCall = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) pendingCall?.reject(new Error(message.error.message));
      else pendingCall?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8099/quiz-waifu-3.html' });

  if (!await waitFor('typeof WAIFU_DB !== "undefined" && WAIFU_DB.length > 0')) {
    throw new Error('WAIFU_DB did not load');
  }

  const info = await run(`(() => {
    const db = window.WAIFU_DB;
    const withHair = db.find(c => c.tags && c.tags.hair_color && c.tags.hair_color.length);
    const withBody = db.find(c => c.tags && (c.tags.body_type || c.tags.skin));
    const withEye = db.find(c => c.tags && c.tags.eye_color);
    return {
      length: db.length,
      sample: withHair ? withHair.name : null,
      hairIds: withHair ? getTagIds(withHair, 'hair') : [],
      bodyIds: withBody ? getTagIds(withBody, 'body') : [],
      eyeIds: withEye ? getTagIds(withEye, 'eye') : [],
      hasButton: !!document.querySelector('.btn-main')
    };
  })()`);

  await run('document.querySelector(".btn-main").click()');
  if (!await waitFor('!!document.querySelector(".q-text")')) {
    throw new Error('First question did not render');
  }

  for (let i = 0; i < 20; i++) {
    const hasQuestion = await run('!!document.querySelector(".q-text")');
    if (!hasQuestion) break;
    await run('document.querySelector(".opt-btn").click()');
    await sleep(120);
  }

  if (!await waitFor('!!document.querySelector(".result-top1")', 25000)) {
    throw new Error('Result did not render');
  }

  const result = await run(`({
    name: document.querySelector('.top1-name')?.textContent || '',
    source: document.querySelector('.top1-source')?.textContent || '',
    match: document.querySelector('.top1-match')?.textContent || '',
    rest: document.querySelectorAll('.top2to5-item').length
  })`);

  if (errors.length) throw new Error(errors.join('\n'));

  console.log(JSON.stringify({ info, result }, null, 2));
} finally {
  try { await send('Browser.close'); } catch {}
  ws?.close();
  for (const child of [chrome, server]) {
    if (child?.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}
