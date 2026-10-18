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
const serverPort = Number(process.env.PACHINKO_PORT || 8099);
const debugPort = Number(process.env.PACHINKO_DEBUG_PORT || 9333);
const timeoutMs = Number(process.env.PACHINKO_TIMEOUT_MS || 600000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

function startServer() {
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${serverPort}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/marisa_pachinko.html';
      const filePath = path.resolve(root, `.${pathname}`);
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end('forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  return new Promise((resolve) => {
    server.listen(serverPort, '127.0.0.1', () => resolve(server));
  });
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
    this.events = [];
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method) this.events.push(message);
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
    returnByValue: true,
    allowUnsafeEvalBlockedByCSP: true
  });
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails.exception?.description || response.exceptionDetails.text;
    throw new Error(detail);
  }
  return response.result ? response.result.value : undefined;
}

async function waitForApp(client) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(client, 'Boolean(window.PachinkoApp && window.PachinkoApp.sim)');
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('PachinkoApp 未在页面中初始化');
}

async function main() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`找不到 Chrome：${chromePath}`);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pachinko-chrome-'));
  const server = await startServer();
  const pageUrl = `http://127.0.0.1:${serverPort}/marisa_pachinko.html`;
  const headed = process.env.PACHINKO_HEADED === '1';
  const chromeArgs = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1280,1000',
    '--remote-allow-origins=*'
  ];
  if (!headed) chromeArgs.unshift('--headless=new');
  const chrome = spawn(chromePath, [...chromeArgs, pageUrl], { stdio: 'ignore' });

  let client = null;
  const consoleMessages = [];
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
    await waitForApp(client);
    const environment = await evaluate(client, `({
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: devicePixelRatio,
      viewport: [innerWidth, innerHeight]
    })`);
    await evaluate(client, `document.getElementById('startOverlay')?.classList.add('hide')`);

    const run = evaluate(client, `(async () => {
      const app = window.PachinkoApp;
      if (!app) throw new Error('PachinkoApp missing');
      return await app.runBenchmark();
    })()`, true);

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`浏览器基准超过 ${timeoutMs}ms`)), timeoutMs);
    });
    const results = await Promise.race([run, timeout]);

    for (const event of client.events) {
      if (event.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push({
          type: event.params.type,
          text: event.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')
        });
      }
      if (event.method === 'Runtime.exceptionThrown') {
        consoleMessages.push({
          type: 'exception',
          text: event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text
        });
      }
      if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
        consoleMessages.push({ type: 'log-error', text: event.params.entry.text });
      }
    }

    if (results.some((item) => !item.validationOk)) process.exitCode = 1;
    const output = {
      testedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        cpu: os.cpus()[0]?.model,
        cpuCount: os.cpus().length,
        totalMemoryGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(1)),
        chrome: environment.userAgent,
        headed,
        hardwareConcurrency: environment.hardwareConcurrency,
        devicePixelRatio: environment.devicePixelRatio,
        viewport: environment.viewport
      },
      results,
      console: consoleMessages.filter((item) => (
        (item.type === 'error' || item.type === 'exception' || item.type === 'log-error')
        && !String(item.text).includes('ERR_CONNECTION_CLOSED')
      ))
    };
    const outputText = JSON.stringify(output, null, 2);
    console.log(outputText);
    if (process.env.PACHINKO_OUT) fs.writeFileSync(process.env.PACHINKO_OUT, outputText);
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
