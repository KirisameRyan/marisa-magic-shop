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

    const evalJS = async (expression) => {
      const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const artifactDir = path.join(root, 'artifacts', 'pachinko-review');
    fs.mkdirSync(artifactDir, { recursive: true });
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const title = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'arcade-title.png'), Buffer.from(title.data, 'base64'));
    await evalJS(`(() => {
      document.getElementById('btnStartRun').click();
      if (document.getElementById('helpOverlay').classList.contains('hide')) throw new Error('missing onboarding');
      if (window.PachinkoApp.ui.run) throw new Error('run started before guide');
    })()`);
    const tutorial = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'arcade-guide.png'), Buffer.from(tutorial.data, 'base64'));
    await evalJS(`document.getElementById('btnCloseHelp').click()`);
    const results = [];
    for (const [width, height] of [[1440, 1000], [390, 844], [360, 740], [768, 1024]]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const layout = await evalJS(`(() => {
        const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; };
        return { overflow: document.documentElement.scrollWidth > innerWidth, canvas:rect('#pachinkoCanvas'), bar:rect('#mobileLaunchBar'), cards:document.querySelectorAll('.synergy').length, reportsFolded:!document.querySelector('.report-panel').open };
      })()`);
      if (layout.overflow || layout.cards !== 0 || !layout.reportsFolded || (width <= 980 && layout.canvas.y + layout.canvas.height > layout.bar.y)) throw new Error(JSON.stringify({ width, layout }));
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artifactDir, `pachinko-${width}.png`), Buffer.from(shot.data, 'base64'));
      results.push({ width, height, ...layout });
    }
    // Buy through the real shop: labels, board data and the next payout must agree.
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evalJS(`(async () => {
      const { draftUpgrades } = await import('/js/pachinko/upgrades.js');
      const { ui } = window.PachinkoApp;
      ui.run.wallet.credit(1000, null, 'refresh-test');
      ui.run.phase = 'normalShop'; ui.run.shopCards = draftUpgrades(ui.run, 'normal', 3, ui.run.rng); ui.openNormalShop();
      const previous = ui.run.shopCards.map(card => card.id), before = ui.run.cash;
      document.getElementById('btnShopRefresh').click();
      if (ui.run.refreshesRemaining !== 1 || ui.run.cash !== before || ui.run.shopCards.some(card => previous.includes(card.id))) throw new Error('free ordinary refresh failed');
      if (!document.getElementById('btnShopRefresh').textContent.includes('1/2')) throw new Error('refresh counter missing');
      if (document.documentElement.scrollWidth > innerWidth) throw new Error('refresh toolbar mobile overflow');
    })()`);
    await new Promise(resolve => setTimeout(resolve, 350));
    const refreshShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'daily-refresh.png'), Buffer.from(refreshShot.data, 'base64'));
    await evalJS(`(() => {
      const { ui } = window.PachinkoApp;
      ui.run.startAdvancedShop(); ui.openAdvancedShop(); document.getElementById('btnShopRefresh').click();
      if (ui.run.refreshesRemaining !== 0 || !document.getElementById('btnShopRefresh').disabled) throw new Error('advanced refresh did not share daily quota');
      document.querySelector('#shopCards button[data-upgrade-id]:not(:disabled)').click(); document.getElementById('btnPayRent').click();
      if (ui.run.day !== 2 || ui.run.refreshesRemaining !== 2) throw new Error('next day did not restore refreshes');
      ui.startRunMode();
    })()`);
    await evalJS(`(async () => {
      const { getUpgrade } = await import('/js/pachinko/upgrades.js');
      const { ui, sim } = window.PachinkoApp;
      ui.run.wallet.credit(1000, null, 'flat-prize-test');
      ui.run.shopCards = [getUpgrade('gold_slots')]; ui.run.phase = 'normalShop'; ui.openNormalShop();
      document.querySelector('[data-upgrade-id="gold_slots"]').click();
      const values = [28,11,0,5,4,5,0,11,28];
      if (JSON.stringify(sim.board.slots.map(s => s.value)) !== JSON.stringify(values)) throw new Error('printed prizes did not update after purchase');
      if (ui.renderer.layout.slots[4].value !== 4) throw new Error('renderer still uses old prizes');
      sim.startBatch(1, { modifiers: ui.run.modifiers, seed: 1, applyEconomy: false });
      if (JSON.stringify(sim.activeBatch.slotValues) !== JSON.stringify(values)) throw new Error('ledger differs from printed prizes');
      sim.reset();
      ui.updateHud(true);
    })()`);
    await new Promise(resolve => setTimeout(resolve, 300));
    const upgradedShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'flat-prize-upgrade.png'), Buffer.from(upgradedShot.data, 'base64'));
    await evalJS('window.PachinkoApp.ui.startRunMode()');
    await evalJS(`(async () => {
      const { applyUpgrade, getUpgrade } = await import('/js/pachinko/upgrades.js');
      const { ui, sim, renderer } = window.PachinkoApp;
      ui.run.wallet.credit(1000, null, 'special-feedback-test');
      applyUpgrade(ui.run, getUpgrade('star_pegs')); applyUpgrade(ui.run, getUpgrade('star_pegs'));
      applyUpgrade(ui.run, getUpgrade('special_core'));
      ui.applyBoardModifiers(); ui.renderBuild(); ui.updateHud(true);
      if (renderer.layout.pegs.filter(p => p.special).length !== 8) throw new Error('special pin render failed');
      sim.startBatch(2, { modifiers: ui.run.modifiers, applyEconomy: false, seed: 1 }); sim.step();
      const pin = sim.board.pegs.find(p => p.special);
      const ball = sim.activeBatch.marbles[0];
      Matter.Body.setPosition(ball.body, { x: pin.x, y: pin.y - pin.radius - 7.1 });
      Matter.Body.setVelocity(ball.body, { x: 0, y: 2 });
      for (let i = 0; i < 10 && !renderer.floats.some(f => f.kind === 'peg'); i++) sim.step();
      if (!renderer.floats.some(f => f.kind === 'peg' && f.text === '+2 币')) throw new Error('actual special pin income text missing');
      renderer.draw(sim, performance.now());
      if (!renderer.canvas.style.transform) throw new Error('income shake missing');
      Matter.Body.setPosition(ball.body, { x: 300, y: 660 });
      Matter.Body.setVelocity(ball.body, { x: 0, y: 2 });
      for (let i = 0; i < 5 && !renderer.floats.some(f => f.kind === 'slot'); i++) sim.step();
      if (!renderer.floats.some(f => f.kind === 'slot' && f.value === ball.slotPayout && f.value > 0)) throw new Error('actual slot income feedback missing');
      renderer.draw(sim, performance.now());
    })()`);
    const specialShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'special-pin-feedback.png'), Buffer.from(specialShot.data, 'base64'));
    await evalJS('window.PachinkoApp.sim.reset(); window.PachinkoApp.ui.startRunMode()');
    await evalJS(`(async () => {
      const { applyUpgrade, getUpgrade } = await import('/js/pachinko/upgrades.js');
      const { ui } = window.PachinkoApp;
      ui.run.wallet.credit(10000, null, 'replacement-test');
      ['brass_pegs','precision_pegs','chain_impact','golden_marble','polished_marble','gold_slots','mass_production','expand_hopper'].forEach(id => applyUpgrade(ui.run, getUpgrade(id)));
      applyUpgrade(ui.run, getUpgrade('marble_compound'));
      ui.run.phase = 'normalShop'; ui.run.shopCards = [getUpgrade('rail_length')]; ui.openNormalShop();
      window.__replacementCash = ui.run.cash;
      document.querySelector('[data-upgrade-id="rail_length"]').click();
      if (!document.querySelector('[data-replace-upgrade="polished_marble"]').disabled) throw new Error('dependent old card can be removed in replacement UI');
      if (ui.run.cash !== window.__replacementCash) throw new Error('replacement picker charged before choice');
      if (document.documentElement.scrollWidth > innerWidth) throw new Error('replacement picker mobile overflow');
    })()`);
    const replacementShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'upgrade-replacement.png'), Buffer.from(replacementShot.data, 'base64'));
    await evalJS(`(async () => {
      const { ui } = window.PachinkoApp;
      const { getUpgrade } = await import('/js/pachinko/upgrades.js');
      const beforeBuild = JSON.stringify([...ui.run.stacks]);
      document.getElementById('btnShopRefresh').click();
      if (ui.pendingUpgradeId || JSON.stringify([...ui.run.stacks]) !== beforeBuild || ui.run.cash !== window.__replacementCash || document.querySelector('[data-replace-upgrade]')) throw new Error('refresh left a stale replacement target or charged/deleted old card');
      ui.run.shopCards = [getUpgrade('rail_length')]; ui.openNormalShop(); document.querySelector('[data-upgrade-id="rail_length"]').click();
      const price = ui.run.getUpgradePrice(ui.run.shopCards[0]);
      document.querySelector('[data-replace-upgrade="gold_slots"]').click();
      if (ui.run.stacks.has('gold_slots') || ui.run.getUpgradeStacks('rail_length') !== 1 || ui.run.cash !== window.__replacementCash - price || ui.run.phase !== 'ready') throw new Error('real replacement button failed');
      ui.startRunMode();
    })()`);
    await evalJS(`(async () => {
      const { applyUpgrade, getUpgrade } = await import('/js/pachinko/upgrades.js');
      const { ui, sim, renderer } = window.PachinkoApp;
      ui.run.wallet.credit(10000, null, 'rail-feedback-test');
      for (let i = 0; i < 4; i++) applyUpgrade(ui.run, getUpgrade('gold_slots'));
      ui.run.phase = 'normalShop'; ui.run.shopCards = [getUpgrade('gold_slots')]; ui.openNormalShop();
      document.querySelector('[data-upgrade-id="gold_slots"]').click();
      if (ui.run.getUpgradeStacks('gold_slots') !== 5 || sim.board.slots[4].value !== 16) throw new Error('rank beyond former cap failed to update board');
      ui.startRunMode(); ui.run.wallet.credit(10000, null, 'rail-feedback-test');
      for (const [id, count] of [['rail_length',3],['rail_rubber',2],['rail_energy',2],['gold_slots',3]]) {
        for (let i = 0; i < count; i++) if (!applyUpgrade(ui.run, getUpgrade(id)).ok) throw new Error('cannot build rail fixture ' + id);
      }
      ui.applyBoardModifiers(); ui.renderBuild(); ui.updateHud(true);
      sim.startBatch(2, { modifiers: ui.run.modifiers, applyEconomy: false, seed: 1 }); sim.step();
      const ball = sim.activeBatch.marbles[0];
      Matter.Body.setPosition(ball.body, { x: 118, y: 480 }); Matter.Body.setVelocity(ball.body, { x: 0, y: 4 });
      for (let i = 0; i < 40 && ball.body && !ball.elasticKicks; i++) sim.step();
      if (!ball.elasticKicks || !renderer.floats.some(f => f.kind === 'rail')) throw new Error('physical rubber kick has no feedback');
      renderer.draw(sim, performance.now());
    })()`);
    const railShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'rail-build-feedback.png'), Buffer.from(railShot.data, 'base64'));
    await evalJS('window.PachinkoApp.sim.reset(); window.PachinkoApp.ui.startRunMode()');
    await evalJS(`(async () => {
      const { applyUpgrade, getUpgrade } = await import('/js/pachinko/upgrades.js');
      const { ui, sim, renderer } = window.PachinkoApp;
      ui.run.wallet.credit(1000, null, 'strong-elastic-test');
      for (let i = 0; i < 3; i++) applyUpgrade(ui.run, getUpgrade('rail_rubber'));
      applyUpgrade(ui.run, getUpgrade('rail_energy')); ui.applyBoardModifiers(); ui.renderBuild(); ui.updateHud(true);
      sim.startBatch(2, { modifiers: ui.run.modifiers, applyEconomy: false, seed: 1 }); sim.step();
      const ball = sim.activeBatch.marbles[0];
      Matter.Body.setPosition(ball.body, { x: 118, y: 495 }); Matter.Body.setVelocity(ball.body, { x: 0, y: 4 });
      for (let i = 0; i < 40 && ball.body && !ball.elasticKicks; i++) sim.step();
      if (!ball.elasticKicks || ball.body.velocity.y >= -5 || !renderer.floats.some(f => f.text.includes('强弹'))) throw new Error('elastic upgrade did not apply visible strong force');
      for (let i = 0; i < 3; i++) sim.step(); renderer.draw(sim, performance.now());
    })()`);
    const elasticShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'elastic-power.png'), Buffer.from(elasticShot.data, 'base64'));
    await evalJS(`(async () => {
      const { applyUpgrade, getUpgrade } = await import('/js/pachinko/upgrades.js');
      const { ui, sim } = window.PachinkoApp;
      sim.reset(); ui.startRunMode(); ui.run.wallet.credit(1000, null, 'energy-payout-test');
      applyUpgrade(ui.run, getUpgrade('rail_energy')); ui.applyBoardModifiers(); ui.setCount(1); ui.launch(); sim.step();
      const ball = sim.activeBatch.marbles[0];
      Matter.Body.setPosition(ball.body, { x: 118, y: 495 }); Matter.Body.setVelocity(ball.body, { x: 0, y: 4 });
      for (let i = 0; i < 80 && ball.body && !ball.railEnergy; i++) sim.step();
      if (!ball.railEnergy) throw new Error('physical rail contact did not accumulate energy');
      Matter.Body.setPosition(ball.body, { x: 300, y: 665 }); Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
      while (sim.isBusy()) sim.step();
      if (ui.run.phase !== 'normalShop' || !document.querySelector('.energy-settlement') || sim.lastReport.railEnergyIncome !== ball.railEnergyPayout || ball.railEnergyPayout <= 0) throw new Error('energy payout breakdown missing');
      if (sim.lastReport.walletEnd - sim.lastReport.walletStart !== sim.lastReport.net) throw new Error('energy wallet credited incorrectly');
    })()`);
    await new Promise(resolve => setTimeout(resolve, 350));
    const energyShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'energy-settlement.png'), Buffer.from(energyShot.data, 'base64'));
    await evalJS('window.PachinkoApp.ui.startRunMode()');
    // Exercise actual shop buttons with a satisfied prerequisite.
    const shop = await evalJS(`(async () => {
      const { applyUpgrade, getUpgrade } = await import('/js/pachinko/upgrades.js');
      const ui = window.PachinkoApp.ui;
      applyUpgrade(ui.run, getUpgrade('chain_impact'));
      ui.run.shopCards = [getUpgrade('resonance')];
      ui.run.phase = 'normalShop';
      ui.run.wallet.balance = 1000;
      ui.openNormalShop();
      const disabled = document.querySelector('[data-upgrade-id="resonance"]').disabled;
      document.querySelector('[data-upgrade-id="resonance"]').click();
      return { disabled, bought: ui.run.getUpgradeStacks('resonance') };
    })()`);
    await evalJS(`(async () => {
      const ui = window.PachinkoApp.ui;
      ui.run.phase = 'ready'; ui.run.supplyRemaining = 50; ui.run.throwsLeft = 5; ui.setCount(10); ui.launch();
      ui.togglePause();
      const simTime = window.PachinkoApp.sim.simTime;
      await new Promise(resolve => setTimeout(resolve, 200));
      if (window.PachinkoApp.sim.simTime !== simTime || !ui.runtime.paused) throw new Error('pause did not stop physics');
      if (document.querySelector('.side-panel .report-panel')) throw new Error('records still on play screen');
      document.getElementById('btnResume').click();
      if (ui.runtime.paused) throw new Error('resume failed');
      while (window.PachinkoApp.sim.isBusy()) window.PachinkoApp.sim.step();
      const overlay = document.getElementById('shopOverlay');
      if (overlay.classList.contains('hide') || ui.run.phase !== 'normalShop') throw new Error('automatic shop did not open');
      overlay.classList.add('hide'); ui.updateControls();
      const button = document.getElementById('btnLaunch');
      if (button.disabled) throw new Error('shop recovery disabled'); button.click();
      if (overlay.classList.contains('hide')) throw new Error('shop recovery failed');
      if (document.getElementById('settlementSummary').classList.contains('hide') || !document.getElementById('settlementSummary').textContent.includes('本次净收益')) throw new Error('merged payout missing');
      if (document.querySelectorAll('#rentSchedule .rent-day').length !== 10) throw new Error('rent roadmap missing');
    })()`);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await new Promise(resolve => setTimeout(resolve, 2300));
    const shopShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'pixel-shop.png'), Buffer.from(shopShot.data, 'base64'));
    if (shop.disabled || shop.bought !== 1 || client.errors.length) throw new Error(JSON.stringify({ shop, errors: client.errors }));
    await evalJS(`(() => { window.PachinkoApp.ui.togglePause(); })()`);
    const pauseShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'arcade-pause.png'), Buffer.from(pauseShot.data, 'base64'));
    const sound = await client.send('Runtime.evaluate', { expression: `(async () => {
      const sound = window.PachinkoApp.sound; sound.unlock();
      if (sound.context) await sound.context.resume();
      sound.play('launch');
      const running = sound.context?.state;
      const muted = sound.toggle(); const restored = sound.toggle();
      return { running, muted, restored };
    })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (sound.result.value.running !== 'running' || sound.result.value.muted !== false || sound.result.value.restored !== true) throw new Error('sound lifecycle failed');
    await evalJS(`(() => {
      const ui = window.PachinkoApp.ui;
      ui.closePause(); ui.skipShop(); ui.setCount(1); ui.launch(); ui.togglePause();
      if (!window.PachinkoApp.sim.isBusy()) throw new Error('restart test requires active batch');
      const button = document.getElementById('btnReset');
      if (button.disabled) throw new Error('restart disabled while paused');
      button.click(); button.click();
      if (window.PachinkoApp.sim.isBusy() || ui.run.day !== 1 || ui.run.cash !== window.PachinkoApp.config.run.startCash || ui.runtime.paused) throw new Error('restart did not reset run');
    })()`);

    const rent = await evalJS(`(async () => {
      const { getUpgrade, computeModifiers } = await import('/js/pachinko/upgrades.js');
      const ui = window.PachinkoApp.ui;
      ui.startRunMode(); ui.run.wallet.credit(1000000, null, 'rent-flow-test');
      const days = [];
      for (let day = 1; day <= 10; day++) {
        for (let shot = 0; shot < 5; shot++) {
          ui.setCount(1); document.getElementById('btnLaunch').click();
          while (window.PachinkoApp.sim.isBusy()) window.PachinkoApp.sim.step();
          if (ui.run.phase !== 'normalShop') throw new Error('missing normal draft on day ' + day);
          document.getElementById('shopSkip').click();
        }
        if (ui.run.phase === 'advancedShop') {
          const card = document.querySelector('#shopCards button:not(:disabled)');
          if (!card) throw new Error('no usable advanced card'); card.click();
        }
        const rentOverlay = document.getElementById('rentOverlay');
        if (ui.run.phase !== 'rent' || rentOverlay.classList.contains('hide')) throw new Error('rent dialog did not open on day ' + day);
        // Reopening must be possible without advancing state or charging money.
        const before = ui.run.cash, due = ui.run.rent;
        rentOverlay.classList.add('hide'); ui.updateControls();
        const launch = document.getElementById('btnLaunch');
        if (launch.disabled) throw new Error('rent recovery disabled'); launch.click();
        if (rentOverlay.classList.contains('hide')) throw new Error('rent recovery failed');
        const pay = document.getElementById('btnPayRent'); pay.click(); pay.click();
        if (ui.run.cash !== before - due) throw new Error('rent charged twice or not charged');
        if (day < 10 && (ui.run.phase !== 'ready' || ui.run.day !== day + 1)) throw new Error('next day did not start');
        days.push(day);
      }
      if (ui.run.phase !== 'won') throw new Error('final rent did not win');
      if (document.getElementById('btnEndless').classList.contains('hide')) throw new Error('missing endless entry after tenth rent');
      const savedCash = ui.run.cash, savedBuild = JSON.stringify([...ui.run.stacks]);
      document.getElementById('btnEndless').click(); document.getElementById('btnEndless').click();
      if (!ui.run.endless || ui.run.day !== 11 || ui.run.phase !== 'ready' || ui.run.cash !== savedCash || JSON.stringify([...ui.run.stacks]) !== savedBuild) throw new Error('endless entry reset build/cash or advanced twice');
      if (document.getElementById('runDays').textContent !== '∞' || !document.querySelector('#rentSchedule .current')) throw new Error('endless HUD or roadmap failed');
      if (document.documentElement.scrollWidth > innerWidth) throw new Error('endless mobile overflow');
      window.__endlessPreserved = true;
      // Keep this state for the screenshot, then continue actual daily flow below.
      window.__savedEndlessDays = days;
      return { daysPaid: days.length, endlessEntered: true };
    })()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const endlessShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactDir, 'endless-mode.png'), Buffer.from(endlessShot.data, 'base64'));
    const extended = await evalJS(`(async () => {
      const { getUpgrade, computeModifiers } = await import('/js/pachinko/upgrades.js');
      const ui = window.PachinkoApp.ui;
      for (let day = 11; day <= 13; day++) {
        for (let shot = 0; shot < 5; shot++) {
          ui.setCount(1); document.getElementById('btnLaunch').click();
          while (window.PachinkoApp.sim.isBusy()) window.PachinkoApp.sim.step();
          document.getElementById('shopSkip').click();
        }
        if (ui.run.phase !== 'advancedShop' || ui.run.shopCards.length !== 3) throw new Error('endless daily advanced draft stopped');
        document.querySelector('#shopCards button:not(:disabled)').click();
        if (ui.run.phase !== 'rent') throw new Error('endless rent did not open');
        document.getElementById('btnPayRent').click();
        if (ui.run.day !== day + 1 || ui.run.phase !== 'ready') throw new Error('endless rent stopped after day ten');
      }
      const preservedDay = ui.run.day;
      ui.run.day = 25; ui.updateHud(true);
      if (!/[万亿]/.test(document.getElementById('runRent').textContent) || document.documentElement.scrollWidth > innerWidth) throw new Error('large endless rents broke mobile HUD');
      ui.run.day = preservedDay; ui.updateHud(true);
      ui.run.wallet.charge(ui.run.cash, null, 'endless-loss-test'); ui.run.phase = 'rent'; ui.openRent();
      document.getElementById('btnPayRent').click();
      if (ui.run.phase !== 'lost' || !document.getElementById('resultTitle').textContent.includes('无尽') || !document.getElementById('btnEndless').classList.contains('hide')) throw new Error('endless loss result invalid');
      // A full ordinary deck must still get three usable advanced choices.
      ui.startRunMode(); ui.run.wallet.credit(1000000, null, 'empty-draft-test');
      ui.run.stacks = new Map(['brass_pegs','precision_pegs','chain_impact','golden_marble','polished_marble','gold_slots','mass_production','expand_hopper'].map(id => [id, Math.min(4, getUpgrade(id).maxStacks)]));
      ui.run.modifiers = computeModifiers(ui.run.stacks);
      ui.run.phase = 'normalShop'; ui.run.throwsLeft = 0; ui.run.shopCards = [];
      ui.skipShop();
      if (ui.run.phase !== 'advancedShop' || ui.run.shopCards.length !== 3) throw new Error('full ordinary deck lost daily advanced rewards');
      document.querySelector('#shopCards button:not(:disabled)').click();
      if (ui.run.phase !== 'rent' || document.getElementById('rentOverlay').classList.contains('hide')) throw new Error('empty advanced draft stranded rent');
      document.getElementById('rentOverlay').classList.add('hide');
      ui.tick(performance.now() + 1000);
      if (document.getElementById('rentOverlay').classList.contains('hide')) throw new Error('rent state reconciliation failed');
      document.getElementById('btnPayRent').click();
      if (ui.run.day !== 2) throw new Error('empty-draft rent did not advance');
      ui.run.wallet.charge(ui.run.cash, null, 'bankruptcy-test'); ui.run.phase = 'rent'; ui.openRent();
      document.getElementById('btnPayRent').click();
      if (ui.run.phase !== 'lost' || document.getElementById('runResultOverlay').classList.contains('hide')) throw new Error('insufficient rent did not reach loss');
      return { endlessDaysPaid: 3, fullDeckAdvanced: true, recovered: true, insufficientFunds: true };
    })()`);
    console.log(JSON.stringify({ results, shop, rent, extended, sound: sound.result.value, errors: client.errors }, null, 2));

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
