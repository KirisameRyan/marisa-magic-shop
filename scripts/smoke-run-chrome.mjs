import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const serverPort = Number(process.env.PACHINKO_RUN_PORT || 8096);
const debugPort = Number(process.env.PACHINKO_RUN_DEBUG_PORT || 9336);

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

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pachinko-run-smoke-'));
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
    await client.send('Page.enable');
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const ready = await client.send('Runtime.evaluate', {
        expression: 'Boolean(window.PachinkoApp && window.PachinkoApp.ui)',
        returnByValue: true
      });
      if (ready.result.value) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const result = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const app = window.PachinkoApp;
        const ui = app.ui;
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const open = (id) => !document.getElementById(id).classList.contains('hide');
        const firstEnabledCard = () => {
          const cards = [...document.querySelectorAll('#shopCards [data-upgrade-id]')];
          return cards.find((card) => !card.disabled) || null;
        };
        const log = [];
        try {
          ui.startRunMode();
          await sleep(250);
          const initial = {
            mode: ui.mode,
            day: ui.run.day,
            cash: ui.run.cash,
            rent: ui.run.rent,
            supply: ui.run.supplyRemaining,
            supplyMax: ui.run.dailySupply,
            throwsLeft: ui.run.throwsLeft,
            singleLaunch: ui.run.singleLaunch,
            startHidden: document.getElementById('startOverlay').classList.contains('hide'),
            runStrip: getComputedStyle(document.getElementById('runStrip')).display,
            bench: getComputedStyle(document.querySelector('.bench-panel')).display,
            buildPanel: getComputedStyle(document.querySelector('.build-panel')).display,
            launchText: document.getElementById('btnLaunch').textContent
          };

          const resolveModals = async () => {
            let guard = 0;
            while (guard < 12) {
              guard += 1;
              const phase = ui.run.phase;
              if (phase === 'ready' || phase === 'won' || phase === 'lost') return;
              if (phase === 'normalShop') {
                await sleep(120);
                const card = firstEnabledCard();
                if (card) ui.chooseShopCard(card.dataset.upgradeId);
                else ui.skipShop();
                await sleep(200);
                continue;
              }
              if (phase === 'supplyEmpty') {
                await sleep(120);
                ui.endDayEarly();
                await sleep(200);
                continue;
              }
              if (phase === 'advancedShop') {
                await sleep(120);
                const card = firstEnabledCard();
                if (!card) throw new Error('高级升级阶段没有可选卡');
                ui.chooseShopCard(card.dataset.upgradeId);
                await sleep(200);
                continue;
              }
              if (phase === 'rent') {
                await sleep(120);
                ui.payRent();
                await sleep(200);
                continue;
              }
              await sleep(100);
            }
            throw new Error('日终流程循环未结束');
          };

          const startDay = ui.run.day;
          for (let index = 0; index < 5; index += 1) {
            if (ui.run.day !== startDay || ui.run.phase !== 'ready') break;
            ui.setCount(ui.run.defaultThrow);
            ui.launch();
            const started = Date.now();
            while (app.sim.isBusy() && Date.now() - started < 30000) await sleep(100);
            if (app.sim.isBusy()) throw new Error('批次未结束');
            await sleep(700);
            const phase = ui.run.phase;
            await resolveModals();
            log.push({
              phase,
              nextPhase: ui.run.phase,
              day: ui.run.day,
              cash: ui.run.cash,
              supply: ui.run.supplyRemaining,
              throwsLeft: ui.run.throwsLeft,
              shopOpen: open('shopOverlay'),
              dayEndOpen: open('dayEndOverlay'),
              rentOpen: open('rentOverlay')
            });
            if (ui.run.day !== startDay) break;
          }
          await resolveModals();

          return {
            initial,
            log,
            final: {
              mode: ui.mode,
              day: ui.run.day,
              phase: ui.run.phase,
              cash: ui.run.cash,
              rent: ui.run.rent,
              supply: ui.run.supplyRemaining,
              supplyMax: ui.run.dailySupply,
              throwsLeft: ui.run.throwsLeft,
              singleLaunch: ui.run.singleLaunch,
              buildCount: ui.run.getBuildList().length,
              startHidden: document.getElementById('startOverlay').classList.contains('hide'),
              shopOpen: open('shopOverlay'),
              rentOpen: open('rentOverlay'),
              resultOpen: open('runResultOverlay'),
              fatalHidden: document.getElementById('fatalError').classList.contains('hide')
            }
          };
        } catch (error) {
          return {
            error: error.stack || error.message,
            log,
            snapshot: ui.run ? ui.run.getSnapshot() : null,
            overlays: {
              shop: open('shopOverlay'),
              dayEnd: open('dayEndOverlay'),
              rent: open('rentOverlay'),
              result: open('runResultOverlay')
            }
          };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    const data = result.result.value;
    const failures = [];
    if (data.error) failures.push(`页面流程错误：${data.error}`);
    if (data.initial) {
      if (data.initial.mode !== 'run') failures.push('未进入营业模式');
      if (!data.initial.startHidden) failures.push('开始遮罩未关闭');
      if (data.initial.runStrip !== 'flex') failures.push('营业 HUD 未显示');
      if (data.initial.bench !== 'none') failures.push('营业模式仍显示性能基准');
      if (data.initial.launchText !== '发射 10 颗') failures.push('初始发射按钮文案异常');
    }
    if (data.log && (data.log.length < 1 || data.log.length > 5)) {
      failures.push(`投掷次数异常：${data.log ? data.log.length : 0}`);
    }
    if (data.final) {
      if (data.final.day !== 2) failures.push(`没有进入第 2 天：${data.final.day}`);
      if (data.final.phase !== 'ready') failures.push(`第 2 天阶段异常：${data.final.phase}`);
      if (data.final.throwsLeft !== 5) failures.push('第 2 天投掷次数未重置');
      if (!data.final.fatalHidden) failures.push('页面出现致命错误');
    }
    if (client.errors.length) failures.push(`页面错误：${client.errors.join(' | ')}`);

    console.log(JSON.stringify({ testedAt: new Date().toISOString(), result: data, failures }, null, 2));
    if (failures.length) process.exitCode = 1;
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
