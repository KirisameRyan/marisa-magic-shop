import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts', 'quiz-waifu-smoke', 'heartprint');
fs.mkdirSync(out, { recursive: true });

const server = spawn('python', ['scripts/serve.py', '8100'], { cwd: root, stdio: 'ignore', windowsHide: true });
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9352',
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
      pages = await (await fetch('http://127.0.0.1:9352/json/list')).json();
      if ((await fetch('http://127.0.0.1:8100/')).ok) break;
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
  await send('Page.navigate', { url: 'http://127.0.0.1:8100/quiz-heartprint.html' });

  if (!await waitFor('typeof HEARTPRINT_DATA !== "undefined" && HEARTPRINT_DATA.characters.length > 0')) {
    throw new Error('HEARTPRINT_DATA did not load');
  }

  const dataInfo = await run(`({
    count: HEARTPRINT_DATA.characters.length,
    female: HEARTPRINT_DATA.characters.filter(c => c.pool === 'female').length,
    male: HEARTPRINT_DATA.characters.filter(c => c.pool === 'male').length,
    hasMha: HEARTPRINT_DATA.characters.some(c => /Boku no Hero Academia|My Hero Academia|我的英雄学院|僕のヒーローアカデミア/i.test(c.source)),
    hasStart: !!document.getElementById('start')
  })`);

  await run('document.getElementById("start").click()');
  if (!await waitFor('!!document.querySelector(".character-card")')) throw new Error('Quiz did not render');

  const defaultMode = await run(`({
    characterPressed: document.getElementById('mode-character').getAttribute('aria-pressed'),
    visualPressed: document.getElementById('mode-visual').getAttribute('aria-pressed'),
    checked: Array.from(document.querySelectorAll('[data-known]')).map(x => x.checked),
    chooseEnabled: Array.from(document.querySelectorAll('[data-choose]')).map(x => !x.disabled)
  })`);

  await run('document.querySelector("[data-known]").click()');
  await sleep(150);
  const afterUncheck = await run(`({
    characterPressed: document.getElementById('mode-character').getAttribute('aria-pressed'),
    visualPressed: document.getElementById('mode-visual').getAttribute('aria-pressed'),
    characterDisabled: document.getElementById('mode-character').disabled
  })`);

  await run('document.querySelector("[data-known]").click()');
  await sleep(150);
  const afterRecheck = await run(`({
    characterPressed: document.getElementById('mode-character').getAttribute('aria-pressed'),
    visualPressed: document.getElementById('mode-visual').getAttribute('aria-pressed')
  })`);

  let rounds = 0;
  for (let i = 0; i < 60; i++) {
    if (await run('!!document.querySelector(".group-card")')) break;
    const card = await run('!!document.querySelector(".character-card")');
    if (!card) break;
    await run('document.querySelector("[data-choose]").click()');
    rounds++;
    await sleep(90);
  }

  if (!await waitFor('!!document.querySelector(".group-card")', 20000)) {
    throw new Error('Result did not render');
  }

  const result = await run(`({
    rounds: document.querySelector('.stamp strong')?.textContent || '',
    groupCards: document.querySelectorAll('.group-card').length,
    groupHeaders: document.querySelectorAll('#trait-rows tr.group-row').length,
    groupLabels: Array.from(document.querySelectorAll('.group-label')).map(x => x.textContent),
    hasTable: !!document.querySelector('#trait-rows'),
    hasMha: HEARTPRINT_DATA.characters.some(c => /Boku no Hero Academia|My Hero Academia|我的英雄学院|僕のヒーローアカデミア/i.test(c.source))
  })`);

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ dataInfo, defaultMode, afterUncheck, afterRecheck, rounds, result }, null, 2));
} finally {
  try { await send('Browser.close'); } catch {}
  ws?.close();
  for (const child of [chrome, server]) {
    if (child?.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}
