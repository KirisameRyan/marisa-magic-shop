import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function killChrome(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000 });
      return;
    } catch (error) {
    }
  }
  try {
    proc.kill('SIGKILL');
  } catch (error) {
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const serverPort = Number(process.env.PACHINKO_SMOKE_PORT || 8098);
const debugPort = Number(process.env.PACHINKO_SMOKE_DEBUG_PORT || 9334);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${serverPort}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/marisa_pachinko.html';
    const filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(serverPort, '127.0.0.1', () => resolve(server)));
}

function waitForUrl(url, attempts = 120) {
  return new Promise((resolve, reject) => {
    let left = attempts;
    const poll = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          resolve(await response.text());
          return;
        }
      } catch (error) {
      }
      left -= 1;
      if (left <= 0) {
        reject(new Error(`等待 ${url} 超时`));
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        const text = message.params.entry.text;
        if (!text.includes('ERR_CONNECTION_CLOSED')) this.errors.push(text);
      }
    });
  }

  ready() {
    return new Promise((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close() {
    try {
      this.socket.close();
    } catch (error) {
    }
  }
}

async function evaluate(client, expression, awaitPromise = false) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result ? response.result.value : undefined;
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pachinko-smoke-'));
  const server = await startServer();
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1280,1000',
    '--remote-allow-origins=*',
    `http://127.0.0.1:${serverPort}/marisa_pachinko.html`
  ], { stdio: 'ignore' });

  let client = null;
  try {
    await waitForUrl(`http://127.0.0.1:${debugPort}/json/version`);
    const pages = JSON.parse(await waitForUrl(`http://127.0.0.1:${debugPort}/json/list`));
    const page = pages.find((item) => item.type === 'page');
    if (!page) throw new Error('没有找到 Chrome 页面');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.ready();
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(client, 'Boolean(window.PachinkoApp && window.PachinkoApp.ui)')) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    let result;
    try {
      result = await evaluate(client, `(async () => {
      const app = window.PachinkoApp;
      if (!app) throw new Error('PachinkoApp missing');
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitForReport = (id) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('批次等待超时 ' + JSON.stringify({ snapshot: app.sim.getSnapshot(), lastReport: app.sim.lastReport ? app.sim.lastReport.id : null, paused: app.runtime.paused, active: app.sim.activeBatch ? app.sim.activeBatch.active : null, status: document.getElementById('hudStatus').textContent }))), 120000);
        const check = () => {
          if (!app.sim.isBusy() && app.sim.lastReport && app.sim.lastReport.id === id) {
            clearTimeout(timer);
            resolve(app.sim.lastReport);
            return;
          }
          setTimeout(check, 80);
        };
        check();
      });

      app.ui.hideStart();
      app.ui.setCount(10);
      app.ui.launch();
      if (!app.sim.activeBatch) throw new Error('第一批没有启动');
      const firstId = app.sim.activeBatch.id;
      const first = await waitForReport(firstId);
      await sleep(80);

      const checks = {
        first: {
          count: first.count,
          settled: first.settled,
          lost: first.lost,
          validationOk: first.validationOk,
          residualBodies: first.residualBodies,
          worldMarbles: app.sim.getWorldMarbleCount(),
          ballBallContacts: first.ballBallContacts,
          walletMatches: first.walletEnd === app.wallet.balance,
          reportVisible: !document.getElementById('reportBody').classList.contains('hide'),
          rowCount: document.querySelectorAll('#marbleTableBody tr').length,
          historyCount: document.querySelectorAll('#historyList [data-report-id]').length,
          verifyText: document.getElementById('repVerify').textContent
        }
      };

      app.ui.setCount(100);
      app.ui.launch();
      if (!app.sim.activeBatch) throw new Error('第二批没有启动');
      const secondId = app.sim.activeBatch.id;
      await sleep(900);
      const beforePause = app.sim.simTime;
      app.ui.togglePause();
      await sleep(600);
      const afterPause = app.sim.simTime;
      app.ui.togglePause();
      const second = await waitForReport(secondId);
      await sleep(80);

      checks.pause = {
        before: beforePause,
        after: afterPause,
        held: Math.abs(afterPause - beforePause) < 0.001,
        pausedFlag: app.runtime.paused === false
      };
      checks.second = {
        count: second.count,
        settled: second.settled,
        lost: second.lost,
        validationOk: second.validationOk,
        peakActive: app.perf.last ? app.perf.last.peakActive : null,
        rowCount: document.querySelectorAll('#marbleTableBody tr').length,
        historyCount: document.querySelectorAll('#historyList [data-report-id]').length
      };

      app.ui.resetLab();
      await sleep(50);
      checks.reset = {
        balance: app.wallet.balance,
        lastReport: app.sim.lastReport,
        historyCount: document.querySelectorAll('#historyList [data-report-id]').length,
        reportEmptyVisible: !document.getElementById('reportEmpty').classList.contains('hide'),
        launchDisabled: document.getElementById('btnLaunch').disabled
      };
      checks.fatalHidden = document.getElementById('fatalError').classList.contains('hide');
      return checks;
    })()`, true);
    } catch (error) {
      console.error('page errors:', client.errors);
      throw error;
    }

    const output = {
      testedAt: new Date().toISOString(),
      result,
      errors: client.errors
    };
    console.log(JSON.stringify(output, null, 2));
    if (!result.first.validationOk) process.exitCode = 1;
    if (!result.second.validationOk) process.exitCode = 1;
    if (result.first.lost !== 0 || result.second.lost !== 0) process.exitCode = 1;
    if (result.first.rowCount !== 10) process.exitCode = 1;
    if (result.second.rowCount !== 100) process.exitCode = 1;
    if (result.second.peakActive < 1 || result.second.peakActive > 30) process.exitCode = 1;
    if (!result.pause.held) process.exitCode = 1;
    if (!result.fatalHidden) process.exitCode = 1;
    if (result.reset.lastReport !== null || result.reset.historyCount !== 0) process.exitCode = 1;
    if (client.errors.length) process.exitCode = 1;
  } finally {
    if (client) client.close();
    killChrome(chrome);
    server.close();
  }
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
