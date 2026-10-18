import { BENCHMARK_SIZES, runBenchmark } from './benchmark.js';
import { Wallet } from './ledger.js';
import { RunState, RUN_PHASES } from './run-state.js';
import {
  effectSummary,
  rarityLabel,
  requirementsMet,
  requirementSummary,
  upgradeTags,
  upgradeContext,
  normalBuildCount, replacementOptions
} from './upgrades.js';
import {
  clamp,
  escapeHtml,
  formatFps,
  formatInteger,
  formatHudCoins,
  formatMs
} from './utils.js';

const ELEMENT_IDS = [
  'settlementSummary', 'rentSchedule', 'rentTitle', 'pauseOverlay', 'btnResume', 'btnSound', 'pauseTitle', 'startOverlay', 'btnStartRun', 'btnStartLab', 'helpOverlay', 'btnHelp', 'btnCloseHelp', 'toast',
  'hudBalanceLabel', 'hudBalance', 'hudBatch', 'hudActive', 'hudSettled', 'hudBallHits', 'hudFps',
  'hudStatus', 'runStrip', 'runDay', 'runDays', 'runRent', 'runThrows', 'runThrowsMax',
  'rentProgress', 'rentGap', 'runSupply', 'runSupplyMax', 'runSingle', 'runPending',
  'badgeBodies', 'badgeSeed', 'canvasShell', 'stageChip', 'btnMode',
  'marbleRange', 'marbleInput', 'costPreview', 'btnLaunch', 'btnPause', 'btnEffects',
  'btnDebug', 'btnReset', 'mobileLaunchBar', 'mobileCount', 'mobileCost', 'mobileLaunch', 'mobileLess', 'mobileMore',
  'controlNote', 'controlHint', 'buildSummary', 'buildList',
  'lmFed', 'lmTotal', 'lmQueued', 'lmField', 'lmSettled', 'lmCap',
  'reportEmpty', 'reportBody', 'repCount', 'repSettled', 'repCost', 'repPeg', 'repSlot',
  'repNet', 'repBalanceLine', 'repDuration', 'repCollisions', 'repBallHits', 'repSuppressed',
  'repDuplicate', 'repResidual', 'repPhysics', 'repRender', 'repSeed', 'repVerify',
  'repVerifyList', 'slotDist', 'marbleDetails', 'marbleSummary', 'marbleTableBody', 'btnCsv',
  'historyList', 'btnClearHistory',
  'benchStatus', 'benchTableBody', 'btnBench', 'btnBenchCsv', 'btnBenchJson',
  'shopOverlay', 'shopKicker', 'shopTitle', 'shopSub', 'shopCards', 'shopCash', 'shopSkip',
  'shopHint', 'dayEndOverlay', 'dayEndTitle', 'dayEndText', 'btnDayEnd', 'rentOverlay',
  'rentText', 'rentDue', 'rentCash', 'rentAfter', 'btnPayRent', 'runResultOverlay',
  'btnEndless',
  'btnShopRefresh',
  'rentModeLabel',
  'resultKicker', 'resultTitle', 'resultText', 'resultStats', 'btnRestartRun', 'btnBackLab'
];

function signed(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 ? `+${formatInteger(number)}` : formatInteger(number);
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadText(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function statusLabel(record) {
  if (record.state === 'RECYCLED') return '已落槽';
  if (record.state === 'DESTROYED') {
    if (record.lostReason === 'timeout') return '超时回收';
    if (record.lostReason === 'stuck') return '卡球回收';
    return '越界回收';
  }
  if (record.state === 'SETTLING') return '结算中';
  return '运动中';
}

function statusClass(record) {
  if (record.state === 'RECYCLED') return 'ok';
  if (record.state === 'DESTROYED') return 'warn';
  return 'run';
}

export class UI {
  constructor({ sim, renderer, perf, wallet, config, runtime, sound }) {
    this.sim = sim;
    this.renderer = renderer;
    this.perf = perf;
    this.labWallet = wallet;
    this.wallet = wallet;
    this.config = config;
    this.runtime = runtime;
    this.mode = 'lab';
    this.run = null;
    this.runCounter = 0;
    this.sound = sound;
    this.onboarding = false;
    document.body.classList.add('title-screen');
    this.el = {};
    this.count = 10;
    this.selectedReport = null;
    this.history = [];
    this.benchResults = [];
    this.benchRunning = false;
    this.startVisible = true;
    this.lastHudAt = 0;
    this.resetArmed = false;
    this.resetTimer = null;
    this.toastTimer = null;
    this.shopTimer = null;
    this.quickChips = Array.from(document.querySelectorAll('[data-count]'));

    for (const id of ELEMENT_IDS) {
      this.el[id] = document.getElementById(id);
    }

    this.bind();
    this.el.btnSound.textContent = this.sound?.enabled === false ? '音效：关' : '音效：开';
    this.el.btnSound.setAttribute('aria-pressed', String(this.sound?.enabled !== false));
    this.setCount(10);
    this.renderReport(null);
    this.renderHistory();
    this.renderBuild();
    this.updateHud(true);
    this.updateControls();
    this.sim.on('batchComplete', (report) => this.handleBatchComplete(report));
    this.applyDebugFromQuery();
    this.maybeAutoBench();
  }

  bind() {
    this.el.mobileLess.addEventListener('click', () => this.setCount(this.count - 1));
    this.el.mobileMore.addEventListener('click', () => this.setCount(this.count + 1));
    this.el.buildList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-upgrade]');
      if (!button || !this.run) return;
      if (!this.run.removeUpgrade(button.dataset.removeUpgrade)) {
        this.toast('仅发射前可拆卸；请先拆卸依赖这张卡的高级卡');
        return;
      }
      this.applyBoardModifiers();
      this.renderBuild();
      this.updateControls();
      this.updateHud(true);
      this.toast('已拆卸整张卡（不返还金币）');
    });
    this.el.btnStartRun.addEventListener('click', () => this.beginGame());
    this.el.btnResume.addEventListener('click', () => this.closePause());
    this.el.btnSound.addEventListener('click', () => {
      const enabled = this.sound?.toggle();
      this.el.btnSound.textContent = enabled ? '音效：开' : '音效：关';
      this.el.btnSound.setAttribute('aria-pressed', String(!!enabled));
    });
    this.el.btnStartLab.addEventListener('click', () => this.startLabMode(false));
    this.el.btnMode.addEventListener('click', () => this.toggleMode());
    this.el.btnHelp.addEventListener('click', () => this.openHelp());
    this.el.btnCloseHelp.addEventListener('click', () => this.closeHelp());
    this.el.helpOverlay.addEventListener('click', (event) => {
      if (event.target === this.el.helpOverlay && !this.onboarding) this.closeHelp();
    });

    this.el.marbleRange.addEventListener('input', () => {
      this.setCount(this.el.marbleRange.value);
    });
    this.el.marbleInput.addEventListener('input', () => {
      const value = clamp(Math.round(Number(this.el.marbleInput.value) || 1), 1, this.config.limits.maxMarbles);
      this.setCount(value, false);
    });
    this.el.marbleInput.addEventListener('blur', () => {
      this.el.marbleInput.value = this.count;
    });

    for (const chip of this.quickChips) {
      chip.addEventListener('click', () => {
        this.setCount(Number(chip.dataset.count));
      });
    }

    this.el.btnLaunch.addEventListener('click', () => this.launch());
    this.el.mobileLaunch.addEventListener('click', () => this.launch());
    this.el.btnPause.addEventListener('click', () => this.togglePause());
    this.el.btnEffects.addEventListener('click', () => this.toggleEffects());
    this.el.btnDebug.addEventListener('click', () => this.toggleDebug());
    this.el.btnReset.addEventListener('click', () => this.toggleReset());
    this.el.btnCsv.addEventListener('click', () => this.exportMarbleCsv());
    this.el.btnClearHistory.addEventListener('click', () => this.clearHistory());

    this.el.historyList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-report-id]');
      if (!row) return;
      const id = Number(row.dataset.reportId);
      const report = this.history.find((item) => item.id === id);
      if (!report) return;
      this.selectedReport = report;
      this.renderReport(report);
      this.renderHistory();
      this.updateControls();
    });

    this.el.btnBench.addEventListener('click', () => this.startBenchmark());
    this.el.btnBenchCsv.addEventListener('click', () => this.exportBenchCsv());
    this.el.btnBenchJson.addEventListener('click', () => this.exportBenchJson());

    this.el.shopCards.addEventListener('click', (event) => {
      if (event.target.closest('[data-cancel-replace]')) { this.pendingUpgradeId = null; this.openNormalShop(); return; }
      const replacement = event.target.closest('[data-replace-upgrade]');
      if (replacement && !replacement.disabled && this.pendingUpgradeId) { this.chooseShopCard(this.pendingUpgradeId, replacement.dataset.replaceUpgrade); return; }
      const card = event.target.closest('[data-upgrade-id]');
      if (!card || card.disabled) return;
      this.chooseShopCard(card.dataset.upgradeId);
    });
    this.el.shopSkip.addEventListener('click', () => this.skipShop());
    this.el.btnShopRefresh.addEventListener('click', () => this.refreshShop());
    this.el.btnDayEnd.addEventListener('click', () => this.endDayEarly());
    this.el.btnPayRent.addEventListener('click', () => this.payRent());
    this.el.btnRestartRun.addEventListener('click', () => this.startRunMode());
    this.el.btnEndless.addEventListener('click', () => this.continueEndless());
    this.el.btnBackLab.addEventListener('click', () => this.startLabMode(false));

    document.addEventListener('keydown', (event) => this.handleKeydown(event));
  }

  applyDebugFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      this.renderer.setDebug(true);
      this.el.btnDebug.classList.add('on');
    }
  }

  maybeAutoBench() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('bench') === '1') {
      this.hideStart();
      setTimeout(() => this.startBenchmark(), 700);
    }
  }

  handleKeydown(event) {
    const target = event.target;
    if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
    if (event.key === 'Escape') {
      if (!this.el.helpOverlay.classList.contains('hide')) this.closeHelp();
      else if (!this.startVisible) this.togglePause();
      return;
    }
    if (event.code === 'Space') {
      if (!this.el.pauseOverlay.classList.contains('hide')) { event.preventDefault(); return; }
      if (!this.el.helpOverlay.classList.contains('hide')) {
        event.preventDefault();
        this.closeHelp();
        return;
      }
      if (this.startVisible) {
        event.preventDefault();
        this.beginGame();
        return;
      }
      if (!this.el.shopOverlay.classList.contains('hide')
        || !this.el.dayEndOverlay.classList.contains('hide')
        || !this.el.rentOverlay.classList.contains('hide')
        || !this.el.runResultOverlay.classList.contains('hide')) {
        return;
      }
      event.preventDefault();
      this.launch();
      return;
    }
    if (event.key === 'p' || event.key === 'P') this.togglePause();
    if (event.key === 'h' || event.key === 'H') this.openHelp();
    if (event.key === 'e' || event.key === 'E') this.toggleEffects();
    if (event.key === 'd' || event.key === 'D') this.toggleDebug();
  }

  hideStart(showHint = false) {
    if (!this.startVisible) return;
    this.startVisible = false;
    this.el.startOverlay.classList.add('hide');
    if (showHint) this.toast('先选弹珠数量，再按发射');
  }

  getMaxCount() {
    if (this.mode === 'run' && this.run) return Math.max(0, this.run.maxThrow);
    return this.config.limits.maxMarbles;
  }

  closeAllRunOverlays() {
    this.el.shopOverlay.classList.add('hide');
    this.el.dayEndOverlay.classList.add('hide');
    this.el.rentOverlay.classList.add('hide');
    this.el.runResultOverlay.classList.add('hide');
  }

  resetSharedView() {
    this.perf.reset();
    this.renderer.clearEffects();
    this.runtime.paused = false;
    this.history.length = 0;
    this.selectedReport = null;
    this.benchResults.length = 0;
    this.el.benchTableBody.innerHTML = '';
    this.el.benchStatus.textContent = '尚未运行';
    this.renderReport(null);
    this.renderHistory();
    this.renderBuild();
    this.el.canvasShell.classList.remove('running');
    this.closeAllRunOverlays();
  }

  startRunMode() {
    if (this.sim.isBusy() || this.benchRunning) return;
    this.closePause();
    document.body.classList.remove('title-screen');
    this.hideStart();
    this.mode = 'run';
    this.runCounter += 1;
    const seed = (Date.now() ^ (this.runCounter * 2654435761)) >>> 0;
    this.run = new RunState(this.config, { seed });
    this.el.rentSchedule.dataset.day = '';
    this.wallet = this.run.wallet;
    this.sim.wallet = this.run.wallet;
    this.sim.reset();
    this.sim.rebuildBoard(this.run.getBoardModifiers());
    this.renderer.setBoard(this.sim.board);
    this.resetSharedView();
    document.body.classList.add('mode-run');
    this.el.hudBalanceLabel.textContent = '现有现金';
    this.el.controlNote.textContent = '每日弹珠仓共享';
    this.el.controlHint.textContent = '每天 5 次投掷 · 单次默认发射数量 · 弹珠仓用完后可结束今日投掷';
    this.el.stageChip.textContent = '10 天营业';
    this.el.btnMode.textContent = '回到试验台';
    this.setCount(this.run.defaultThrow || 1);
    this.updateHud(true);
    this.updateControls();
    this.toast(`第 1 天开始 · 弹珠仓 ${this.run.dailySupply} 颗 · 租金 ${this.run.rent}`);
  }

  startLabMode(showStart = false) {
    if (this.sim.isBusy() || this.benchRunning) return;
    this.closePause();
    document.body.classList.remove('title-screen');
    this.hideStart();
    this.mode = 'lab';
    this.run = null;
    this.labWallet.reset();
    this.wallet = this.labWallet;
    this.sim.wallet = this.labWallet;
    this.sim.reset();
    this.sim.rebuildBoard({});
    this.renderer.setBoard(this.sim.board);
    this.resetSharedView();
    document.body.classList.remove('mode-run');
    this.el.hudBalanceLabel.textContent = '试验余额';
    this.el.controlNote.textContent = '每颗 1 试验币';
    this.el.controlHint.textContent = '空格发射 · P 暂停 · 每颗 1 试验币；中央顶部供球，100 颗为流水压力档。';
    this.el.stageChip.textContent = '物理试验台';
    this.el.btnMode.textContent = '开始营业';
    this.setCount(10);
    this.updateHud(true);
    this.updateControls();
    if (showStart) this.el.startOverlay.classList.remove('hide');
    this.toast('已进入自由试验台');
  }

  toggleMode() {
    if (this.sim.isBusy() || this.benchRunning) {
      this.toast('当前批次还在运行');
      return;
    }
    if (this.mode === 'lab') {
      this.startRunMode();
      return;
    }
    const inProgress = this.run
      && this.run.phase !== RUN_PHASES.WON
      && this.run.phase !== RUN_PHASES.LOST;
    if (inProgress && !window.confirm('切换模式会结束当前营业进度，继续？')) return;
    this.startLabMode();
  }

  beginGame() {
    this.sound?.unlock(); this.sound?.play('select');
    this.onboarding = true;
    this.el.startOverlay.classList.add('hide');
    this.el.btnCloseHelp.textContent = '明白了，开始营业 ▶';
    this.openHelp();
  }

  openHelp() {
    this.helpPaused = this.sim.isBusy() && !this.runtime.paused;
    if (this.helpPaused) this.runtime.paused = true;
    this.el.helpOverlay.classList.remove('hide');
  }

  closeHelp() {
    this.el.helpOverlay.classList.add('hide');
    if (this.onboarding) {
      this.onboarding = false; this.el.btnCloseHelp.textContent = '关闭'; this.startRunMode();
    } else if (this.helpPaused) { this.runtime.paused = false; this.helpPaused = false; }
  }

  toast(message) {
    if (!message) return;
    this.el.toast.textContent = message;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.classList.remove('show');
    }, 2200);
  }

  setCount(value, syncInput = true) {
    const max = Math.max(1, this.getMaxCount());
    const count = clamp(Math.round(Number(value) || 1), 1, max);
    this.count = count;
    this.el.marbleRange.max = String(max);
    this.el.marbleInput.max = String(max);
    this.el.marbleRange.value = String(count);
    if (syncInput) this.el.marbleInput.value = String(count);
    this.el.costPreview.textContent = this.mode === 'run' && this.run
      ? `本次 ${formatInteger(count)} 颗 · 成本 ${formatInteger(count * this.config.economy.marbleCost)} 币 · 仓余 ${formatInteger(this.run.supplyRemaining)}`
      : `本批成本 ${formatInteger(count * this.config.economy.marbleCost)} 币`;
    for (const chip of this.quickChips) {
      const chipCount = Number(chip.dataset.count);
      chip.classList.toggle('on', chipCount === count);
      chip.disabled = chipCount > max;
    }
    this.updateControls();
  }

  updateControls() {
    const busy = this.sim.isBusy();
    this.el.mobileLess.disabled = this.runtime.paused || busy;
    this.el.mobileMore.disabled = this.runtime.paused || busy;
    const runMode = this.mode === 'run' && this.run;
    const runReady = !runMode || this.run.phase === RUN_PHASES.READY;
    const locked = busy || this.benchRunning || !runReady || this.runtime.paused;
    const max = Math.max(0, this.getMaxCount());
    const cost = this.count * this.config.economy.marbleCost;
    const funds = this.wallet.balance >= cost;
    const canLaunch = !runMode || (this.run.canThrow() && funds);
    const canEnd = !!runMode && !busy && this.run.canEndDayEarly();
    const choosing = runMode && [RUN_PHASES.NORMAL_SHOP, RUN_PHASES.ADVANCED_SHOP, RUN_PHASES.RENT, RUN_PHASES.SUPPLY_EMPTY].includes(this.run.phase) && !busy;
    this.el.btnLaunch.disabled = !choosing && (locked || (!canLaunch && !canEnd));
    this.el.mobileLaunch.disabled = this.el.btnLaunch.disabled;
    let launchText;
    if (this.benchRunning) launchText = '基准运行中';
    else if (busy) launchText = '物理运行中';
    else if (runMode && this.run.phase === RUN_PHASES.NORMAL_SHOP) launchText = '选择普通升级';
    else if (runMode && this.run.phase === RUN_PHASES.ADVANCED_SHOP) launchText = '高级升级中';
    else if (runMode && this.run.phase === RUN_PHASES.SUPPLY_EMPTY) launchText = '今日弹珠已用尽';
    else if (runMode && this.run.phase === RUN_PHASES.RENT) launchText = '结算今日租金';
    else if (runMode && (this.run.phase === RUN_PHASES.WON || this.run.phase === RUN_PHASES.LOST)) launchText = '本局已结束';
    else if (canEnd) launchText = '结束今日投掷';
    else if (!funds) launchText = '金币不足';
    else launchText = `发射 ${this.count} 颗`;
    this.el.btnLaunch.textContent = launchText;
    this.el.mobileLaunch.textContent = this.benchRunning
      ? '基准中'
      : busy
        ? '运行中'
        : runMode && this.run.phase !== RUN_PHASES.READY
          ? (this.run.phase === RUN_PHASES.RENT ? '结算租金' : choosing ? '继续结算' : '结算中')
          : canEnd
            ? '结束今日'
            : !funds
              ? '余额不足'
              : '发射';
    this.el.mobileCount.textContent = String(this.count);
    this.el.mobileCost.textContent = runMode
      ? `成本 ${formatInteger(cost)} 币 · 仓余 ${formatInteger(this.run.supplyRemaining)}`
      : funds
        ? `成本 ${formatInteger(cost)} 币`
        : `成本 ${formatInteger(cost)} 币 · 余额不足`;
    this.el.marbleRange.disabled = locked;
    this.el.marbleInput.disabled = locked;
    for (const chip of this.quickChips) chip.disabled = locked || Number(chip.dataset.count) > max;
    this.el.btnPause.disabled = this.startVisible || this.benchRunning;
    this.el.btnPause.textContent = 'Ⅱ 暂停';
    this.el.btnPause.classList.toggle('on', this.runtime.paused);
    this.el.btnReset.disabled = this.benchRunning || (this.el.pauseOverlay.classList.contains('hide') && locked);
    if (!this.resetArmed) this.el.btnReset.textContent = runMode ? '重开营业' : '重置';
    this.el.btnBench.disabled = locked || !!runMode;
    this.el.btnCsv.disabled = !this.selectedReport;
    this.el.btnClearHistory.disabled = this.history.length === 0 || locked;
    this.el.btnBenchCsv.disabled = this.benchResults.length === 0 || this.benchRunning;
    this.el.btnBenchJson.disabled = this.benchResults.length === 0 || this.benchRunning;
    this.el.btnStartLab.disabled = busy || this.benchRunning;
    this.el.btnMode.disabled = busy || this.benchRunning || (!!runMode && ![RUN_PHASES.READY, RUN_PHASES.WON, RUN_PHASES.LOST].includes(this.run.phase));
    this.el.costPreview.textContent = runMode
      ? `本次 ${formatInteger(this.count)} 颗 · 成本 ${formatInteger(cost)} 币 · 仓余 ${formatInteger(this.run.supplyRemaining)}`
      : funds
        ? `本批成本 ${formatInteger(cost)} 币`
        : `本批成本 ${formatInteger(cost)} 币 · 余额不足`;
    if (runMode) {
      this.el.controlNote.textContent = `每颗 1 币 · 仓余 ${formatInteger(this.run.supplyRemaining)}`;
    }
  }

  launch() {
    if (this.runtime.paused || !this.el.helpOverlay.classList.contains('hide')) return;
    if (this.run?.phase === RUN_PHASES.RENT) { this.openRent(); return; }
    if (this.run?.phase === RUN_PHASES.SUPPLY_EMPTY) { this.showDayEnd(); return; }
    if (this.run?.phase === RUN_PHASES.NORMAL_SHOP) { this.openNormalShop(); return; }
    if (this.run?.phase === RUN_PHASES.ADVANCED_SHOP) { this.openAdvancedShop(); return; }
    if (this.benchRunning) return;
    if (this.sim.isBusy()) {
      this.toast('当前批次还在运行');
      return;
    }
    this.hideStart();
    this.el.marbleInput.value = String(this.count);
    this.runtime.paused = false;

    if (this.mode === 'run' && this.run) {
      if (this.run.phase !== RUN_PHASES.READY) {
        this.toast('当前阶段不能投掷');
        return;
      }
      if (!this.run.canThrow()) {
        if (this.run.canEndDayEarly()) {
          this.showDayEnd();
        } else {
          this.toast('弹珠仓或现金不足');
        }
        this.updateControls();
        return;
      }
      const count = clamp(this.count, 1, this.run.maxThrow);
      this.count = count;
      if (this.run.boardDirty) {
        const rebuilt = this.sim.rebuildBoard(this.run.getBoardModifiers());
        if (rebuilt.ok) {
          this.renderer.setBoard(this.sim.board);
          this.run.boardDirty = false;
        }
      }
      const result = this.sim.startBatch(count, {
        applyEconomy: true,
        modifiers: this.run.modifiers,
        seed: this.run.nextBatchSeed()
      });
      if (!result.ok) {
        if (result.reason === 'funds') this.toast('现金不足');
        else this.toast('无法启动批次');
        this.updateControls();
        return;
      }
      this.sound?.play('launch');
      this.run.onThrowStarted(count, result.batch);
      this.selectedReport = null;
      this.renderReport(null);
      this.renderHistory();
      this.el.canvasShell.classList.add('running');
      this.updateHud(true);
      this.updateControls();
      this.toast(`第 ${this.run.day} 天 · 投掷 ${count} 颗`);
      return;
    }

    const cost = this.count * this.config.economy.marbleCost;
    if (this.wallet.balance < cost) {
      this.toast('试验金币不足，先重置试验台');
      return;
    }
    const result = this.sim.startBatch(this.count);
    if (!result.ok) {
      if (result.reason === 'funds') this.toast('试验金币不足');
      else if (result.reason === 'limit') this.toast(`正常发射上限 ${this.config.limits.maxMarbles} 颗`);
      else this.toast('无法启动批次');
      this.updateControls();
      return;
    }
    this.selectedReport = null;
    this.renderReport(null);
    this.renderHistory();
    this.el.canvasShell.classList.add('running');
    this.updateHud(true);
    this.updateControls();
  }

  togglePause() {
    if (this.startVisible || this.benchRunning || !this.el.helpOverlay.classList.contains('hide')) return;
    if (!this.el.pauseOverlay.classList.contains('hide')) { this.closePause(); return; }
    this.runtime.paused = true;
    this.el.pauseOverlay.classList.remove('hide');
    this.el.pauseTitle.focus({ preventScroll: true });
    this.updateControls(); this.updateHud(true);
  }

  closePause() {
    this.el.pauseOverlay.classList.add('hide');
    this.runtime.paused = false;
    // Do not invoke controls before construction has completed.
    if (this.el.btnLaunch) { this.updateControls(); this.updateHud(true); }
  }

  toggleEffects() {
    this.renderer.setReducedEffects(!this.renderer.reducedEffects);
    this.el.btnEffects.classList.toggle('on', this.renderer.reducedEffects);
    this.toast(this.renderer.reducedEffects ? '已减少视觉特效，物理不变' : '特效已开启');
  }

  toggleDebug() {
    this.renderer.setDebug(!this.renderer.debug);
    this.el.btnDebug.classList.toggle('on', this.renderer.debug);
  }

  toggleReset() {
    if ((this.sim.isBusy() && !this.runtime.paused) || this.benchRunning) return;
    const resetLabel = this.mode === 'run' ? '重开营业' : '重置';
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.el.btnReset.textContent = '确认重开';
      this.el.btnReset.classList.add('armed');
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        this.resetArmed = false;
        this.el.btnReset.textContent = resetLabel;
        this.el.btnReset.classList.remove('armed');
      }, 2600);
      return;
    }
    clearTimeout(this.resetTimer);
    this.resetArmed = false;
    this.el.btnReset.textContent = resetLabel;
    this.el.btnReset.classList.remove('armed');
    if (this.runtime.paused) this.sim.reset();
    this.closePause();
    if (this.mode === 'run') this.startRunMode();
    else this.resetLab();
  }

  resetLab() {
    this.wallet.reset();
    this.sim.reset();
    this.perf.reset();
    this.renderer.clearEffects();
    this.runtime.paused = false;
    this.history.length = 0;
    this.selectedReport = null;
    this.benchResults.length = 0;
    this.el.benchTableBody.innerHTML = '';
    this.el.benchStatus.textContent = '尚未运行';
    this.renderReport(null);
    this.renderHistory();
    this.el.canvasShell.classList.remove('running');
    this.updateHud(true);
    this.updateControls();
    this.toast('试验台已重置');
  }

  renderBuild() {
    if (!this.el.buildList) return;
    if (!this.run) {
      this.el.buildList.innerHTML = '<div class="empty-state">还没有升级。</div>';
      this.el.buildSummary.textContent = '0 项';
      return;
    }
    const list = this.run.getBuildList();
    let totalStacks = 0;
    this.el.buildList.innerHTML = list.map((item) => {
      totalStacks += item.stacks;
      const capped = Number.isFinite(item.definition.maxStacks) && item.stacks >= item.definition.maxStacks;
      const resourceCap = item.definition.effect.type === 'singleLaunch' && this.run.singleLaunch >= this.config.limits.maxMarbles ? ' · 发射量已达上限' : item.definition.effect.type === 'dailySupply' && this.run.nextDailySupply >= this.config.limits.maxMarbles * this.config.run.throwsPerDay ? ' · 供给已达可用上限' : '';
      return `<div class="build-row"><span title="${escapeHtml(item.definition.description)}">${escapeHtml(item.definition.name)}${resourceCap || (capped ? ' · 已达上限' : item.definition.slotless ? ' · 服务' : '')}</span><b>×${item.stacks}</b><button class="mini-btn" data-remove-upgrade="${item.definition.id}" ${this.run.phase !== RUN_PHASES.READY ? 'disabled' : ''} title="拆卸整张卡，不退款">拆卸</button></div>`;
    }).join('');
    this.el.buildList.innerHTML = this.run.modifiers.synergies.filter((item) => item.count > 0).map((item) => `<div class="synergy ${item.active ? 'active' : ''}"><b>${item.name} ${item.count}/${item.threshold}</b><span>${item.description}</span></div>`).join('') + this.el.buildList.innerHTML;
    if (!list.length) this.el.buildList.innerHTML = '<div class="empty-state">尚未装配卡牌</div>';
    const normalCount = normalBuildCount(this.run);
    const advancedCount = list.filter(item => item.definition.pool === 'advanced').length;
    const services = list.filter(item => item.definition.slotless).length;
    this.el.buildSummary.textContent = `普通 ${normalCount}/${this.config.run.buildSlots} · 高级 ${advancedCount}${services ? ` · 服务 ${services}` : ''} · ${totalStacks} 层`;
  }

  applyBoardModifiers() {
    if (!this.run || !this.run.boardDirty) return;
    if (this.sim.isBusy()) return;
    const result = this.sim.rebuildBoard(this.run.getBoardModifiers());
    if (result.ok) {
      this.renderer.setBoard(this.sim.board);
      this.run.boardDirty = false;
    }
  }

  openNormalShop() {
    if (!this.run) return;
    const run = this.run;
    if (run.phase !== RUN_PHASES.NORMAL_SHOP) return;
    this.el.toast.classList.remove('show');
    this.el.shopKicker.textContent = `第 ${run.day} 天 · 投掷结算`;
    this.el.shopTitle.textContent = '投掷结算 · 选择升级';
    const report = run.lastReport;
    this.el.settlementSummary.classList.toggle('hide', !report);
    if (report) {
      const winners = report.slotCounts.reduce((sum, count, i) => sum + (report.slotValues[i] > 0 ? count : 0), 0);
      this.el.settlementSummary.innerHTML = `<div class="settlement-hero"><span>本次净收益</span><strong class="${report.net >= 0 ? 'positive' : 'negative'}">${signed(report.net)}<small> 币</small></strong><em>已入账</em></div><div class="settlement-breakdown"><span>奖励钉 <b>+${formatInteger(report.pegIncome)}</b></span><span>中奖槽 <b>+${formatInteger(report.slotIncome)}</b></span><span>发射成本 <b>−${formatInteger(report.cost)}</b></span></div><p>中奖 ${winners} 颗 · 落空 ${report.settled - winners} 颗 · 次日回收 +${report.supplyRefund || 0} 颗</p>`;
    }
    this.el.shopSub.textContent = '普通构筑 8 格，数值卡可持续升阶。满位可选择新卡替换旧卡，旧卡全部层数移除、不退款。';
    if (report?.reserveSupply > 0) this.el.settlementSummary.insertAdjacentHTML('beforeend', `<p>循环装填：次日额外储备 +${report.reserveSupply} 颗，已计入补给。</p>`);
    if (report?.railEnergyIncome > 0) this.el.settlementSummary.insertAdjacentHTML('beforeend', `<p class="energy-settlement">动能兑现 <b>+${formatInteger(report.railEnergyIncome)} 币</b> · 已包含在上方中奖槽收益中。</p>`);
    this.el.shopSkip.classList.remove('hide');
    this.el.shopSkip.disabled = false;
    this.el.shopCash.textContent = formatInteger(run.cash);
    this.el.shopHint.textContent = `租金缺口 ${formatInteger(Math.max(0, run.rent - run.cash))} · 普通卡位 ${normalBuildCount(run)}/8 · 现金 ${formatInteger(run.cash)} · 本投默认 ${run.defaultThrow} 颗 · 弹珠仓剩余 ${run.supplyRemaining} 颗`;
    this.sound?.play('shop');
    this.renderShopCards(run.shopCards, false);
    this.el.shopOverlay.classList.remove('hide');
    this.el.shopOverlay.scrollTop = 0;
    this.el.shopTitle.focus({ preventScroll: true });
  }

  openAdvancedShop() {
    if (!this.run) return;
    const run = this.run;
    if (!run.shopCards.length) {
      run.phase = RUN_PHASES.RENT;
      this.openRent();
      return;
    }
    this.el.shopKicker.textContent = `第 ${run.day} 天 · 日终`;
    this.el.shopTitle.textContent = '高级升级';
    this.el.settlementSummary.classList.add('hide');
    this.el.shopSub.textContent = '免费选择一个高级升级。选完后支付今天的租金。';
    this.el.shopSkip.classList.add('hide');
    this.el.shopCash.textContent = formatInteger(run.cash);
    const interest = run.log.find(item => item.kind === 'interest' && item.day === run.day)?.value || 0;
    this.el.shopHint.textContent = `每日高级升级免费，不占普通卡位；选择后结算租金。${interest ? ` 今日利息已到账 +${interest} 币。` : ''}`;
    this.renderShopCards(run.shopCards, true);
    this.el.shopOverlay.classList.remove('hide');
    this.el.shopOverlay.scrollTop = 0;
    this.el.shopTitle.focus({ preventScroll: true });
  }

  renderShopCards(cards, free) {
    if (!this.run) return;
    const run = this.run;
    this.pendingUpgradeId = null;
    this.el.btnShopRefresh.textContent = `刷新 ${run.refreshesRemaining}/${this.config.run.refreshesPerDay ?? 2}`;
    this.el.btnShopRefresh.disabled = run.refreshesRemaining <= 0;
    if (!cards.length) {
      this.el.shopCards.innerHTML = '<div class="empty-state">没有可用的升级，直接跳过。</div>';
      return;
    }
    this.el.shopCards.innerHTML = cards.map((definition) => {
      const stacks = run.getUpgradeStacks(definition.id);
      const price = free ? 0 : run.getUpgradePrice(definition);
      const locked = requirementsMet(run, definition) ? '' : requirementSummary(definition);
      const disabled = (!free && run.cash < price) || !!locked;
      const context = upgradeContext(run, definition);
      const swap = !free && !definition.slotless && !stacks && normalBuildCount(run) >= this.config.run.buildSlots;
      const tags = upgradeTags(definition).map((tag) => `<span class="pc-tag">${escapeHtml(tag)}</span>`).join('');
      return `<button class="pick-card rarity-${definition.rarity}" type="button" data-upgrade-id="${definition.id}" ${disabled ? 'disabled' : ''}>
        <span class="pc-item-icon" aria-hidden="true" data-family="${definition.tags.includes('quantity') ? 'quantity' : definition.tags[0]}"></span><span class="pc-rarity">${escapeHtml(rarityLabel(definition))}</span>
        <span class="pc-name">${escapeHtml(definition.name)}</span>
        <span class="pc-tags">${tags}</span>
        <span class="pc-desc">${escapeHtml(definition.description)}</span>
        ${context ? `<span class="pc-context">${escapeHtml(context)}</span>` : ''}
        ${swap ? '<span class="pc-context">新构筑：购买时选择替换一张普通卡，不额外占位。</span>' : ''}
        ${definition.slotless ? '<span class="pc-context">工坊服务，不占构筑位置。</span>' : ''}
        <span class="pc-effect">${escapeHtml(effectSummary(definition, stacks))}</span>
        ${locked ? `<span class="pc-requirement">${escapeHtml(locked)}</span>` : ''}
        <span class="pc-meta">
          <span class="pc-stacks">当前 ${stacks}/${Number.isFinite(definition.maxStacks) ? definition.maxStacks : '∞'}</span>
          <span class="pc-price ${free ? 'free' : ''}">${free ? '免费' : `${formatInteger(price)} 币`}</span>
        </span>
      </button>`;
    }).join('');
  }

  renderReplacementChoices(id) {
    const definition = this.run.shopCards.find(card => card.id === id);
    if (!definition) return;
    this.pendingUpgradeId = id;
    this.el.toast.classList.remove('show');
    const allowed = replacementOptions(this.run, definition);
    this.el.shopTitle.textContent = `替换构筑 · ${definition.name}`;
    this.el.shopSub.textContent = `新卡 ${definition.name} ×1，需支付 ${formatInteger(this.run.getUpgradePrice(definition))} 币。选择要移除的卡：旧卡全部层数和效果消失，不退款；被其他卡依赖的卡不能替换。`;
    this.el.shopCards.innerHTML = '<button type="button" class="ghost-btn" data-cancel-replace style="grid-column:1/-1">← 返回升级选择</button>' + this.run.getBuildList().filter(item => item.definition.pool === 'normal' && !item.definition.slotless).map(item => `<button type="button" class="pick-card" data-replace-upgrade="${item.definition.id}" ${allowed.includes(item.definition.id) ? '' : 'disabled'}><span class="pc-name">${escapeHtml(item.definition.name)} ×${item.stacks}</span><span class="pc-desc">${escapeHtml(item.definition.description)}</span><span class="pc-context">${allowed.includes(item.definition.id) ? '移除全部层数，装入新卡并支付上述价格' : '不可替换：依赖或互斥规则不满足'}</span></button>`).join('');
    this.el.shopOverlay.scrollTop = 0;
  }

  refreshShop() {
    const result = this.run?.refreshShop();
    if (!result?.ok) {
      this.el.shopHint.textContent = result?.reason === 'noAlternatives' ? '当前没有其他可用升级，本次不消耗刷新机会。' : '今日刷新机会已用尽，次日恢复两次。';
      return;
    }
    if (this.run.phase === RUN_PHASES.ADVANCED_SHOP) this.openAdvancedShop(); else this.openNormalShop();
    this.el.shopHint.textContent += ` · 已更新 ${result.changed} 个选项；普通/高级共用每日两次。`;
    this.sound?.play('select');
  }

  chooseShopCard(id, replaceId = null) {
    if (!this.run) return;
    const run = this.run;
    if (run.phase === RUN_PHASES.NORMAL_SHOP) {
      const result = run.buyNormal(id, replaceId);
      if (!result.ok) {
        if (result.reason === 'replacement') { this.renderReplacementChoices(id); return; }
        this.toast(result.reason === 'funds' ? '现金不足' : '无法购买这个升级');
        this.renderShopCards(run.shopCards, false);
        this.el.shopCash.textContent = formatInteger(run.cash);
        return;
      }
      this.el.shopOverlay.classList.add('hide');
      this.renderBuild();
      this.afterShopFlow(result);
      return;
    }
    if (run.phase === RUN_PHASES.ADVANCED_SHOP) {
      const result = run.takeAdvanced(id);
      if (!result.ok) {
        this.toast('无法选择这个高级升级');
        return;
      }
      this.el.shopOverlay.classList.add('hide');
      this.renderBuild();
      this.applyBoardModifiers();
      this.openRent();
    }
  }

  skipShop() {
    if (!this.run || this.run.phase !== RUN_PHASES.NORMAL_SHOP) return;
    const result = this.run.skipNormal();
    this.el.shopOverlay.classList.add('hide');
    this.afterShopFlow(result);
  }

  afterShopFlow(result) {
    if (!result || !result.ok) return;
    this.sound?.play('select');
    this.applyBoardModifiers();
    this.renderBuild();
    this.updateHud(true);
    this.updateControls();
    if (result.next === 'throw') {
      this.setCount(this.run.defaultThrow || 1);
      this.toast(`继续投掷 · 弹珠仓剩余 ${this.run.supplyRemaining} 颗`);
      return;
    }
    if (result.next === 'supplyEmpty') {
      this.showDayEnd();
      return;
    }
    if (result.next === 'advanced') {
      this.openAdvancedShop();
      return;
    }
    if (result.next === 'rent') {
      this.openRent();
    }
  }

  showDayEnd() {
    if (!this.run) return;
    const run = this.run;
    const reason = run.endReason === 'cash' ? '现金不足' : '今日弹珠仓已经用尽';
    this.el.dayEndTitle.textContent = reason;
    this.el.dayEndText.textContent = `当前第 ${run.day} 天，已用 ${run.throwsLeft} 次投掷中的 ${this.config.run.throwsPerDay - run.throwsLeft} 次，剩余投掷次数会作废。`;
    this.el.dayEndOverlay.classList.remove('hide');
    this.el.dayEndOverlay.dataset.reason = run.endReason || 'supply';
  }

  endDayEarly() {
    if (!this.run) return;
    const result = this.run.endDayEarly();
    this.el.dayEndOverlay.classList.add('hide');
    if (!result.ok) {
      this.toast('当前不能结束今日投掷');
      return;
    }
    this.openAdvancedShop();
  }

  openRent() {
    if (!this.run) return;
    const run = this.run;
    if (run.phase !== RUN_PHASES.RENT) return;
    this.el.shopOverlay.classList.add('hide');
    this.el.dayEndOverlay.classList.add('hide');
    this.el.rentTitle.textContent = `第 ${run.day} 天 · 租金结算`;
    this.el.rentText.textContent = `${run.endless ? '无尽挑战 · ' : ''}第 ${run.day} 天租金到期。支付后进入${run.isFinalDay ? '通关结算，可选择无尽挑战' : '下一天'}。${run.modifiers.rentDiscount ? '租约减免已计入应付金额。' : ''}`;
    this.el.rentDue.textContent = formatHudCoins(run.rent);
    this.el.rentCash.textContent = formatHudCoins(run.cash);
    this.el.rentAfter.textContent = formatHudCoins(run.cash - run.rent);
    this.el.rentDue.title = `${formatInteger(run.rent)} 币`;
    this.el.btnPayRent.classList.toggle('danger', run.cash < run.rent);
    this.el.btnPayRent.textContent = run.cash >= run.rent ? `支付 ${formatInteger(run.rent)} 币，${run.isFinalDay ? '完成通关' : '进入下一天'}` : '资金不足，结束营业';
    this.el.btnPayRent.disabled = false;
    this.el.rentOverlay.classList.remove('hide');
    this.el.rentOverlay.scrollTop = 0;
    this.el.rentTitle.focus({ preventScroll: true });
    this.updateControls();
  }

  payRent() {
    if (!this.run || this.run.phase !== RUN_PHASES.RENT) return;
    const result = this.run.payRent();
    this.el.rentOverlay.classList.add('hide');
    if (!result.ok) {
      this.showRunResult('lost');
      return;
    }
    if (result.won) {
      this.showRunResult('won');
      return;
    }
    this.sound?.play('rent');
    this.applyBoardModifiers();
    this.setCount(this.run.defaultThrow || 1);
    this.renderBuild();
    this.updateHud(true);
    this.updateControls();
    this.toast(`第 ${this.run.day} 天开始 · 弹珠仓 ${this.run.dailySupply} 颗 · 租金 ${this.run.rent}`);
  }

  continueEndless() {
    if (!this.run?.startEndless().ok) return;
    this.closeAllRunOverlays();
    this.runtime.paused = false;
    this.renderer.clearEffects();
    this.applyBoardModifiers(); this.renderBuild();
    this.setCount(this.run.defaultThrow); this.updateHud(true); this.updateControls();
    this.toast(`无尽挑战开始 · 第 ${this.run.day} 天租金 ${formatInteger(this.run.rent)} 币`);
  }

  showRunResult(kind) {
    if (!this.run) return;
    const run = this.run;
    const won = kind === 'won';
    this.closeAllRunOverlays();
    this.el.btnEndless.classList.toggle('hide', !won || run.endless);
    this.el.resultKicker.textContent = won ? '10 天营业达成' : run.endless ? '无尽挑战结束 · 十天通关已达成' : '营业结束';
    this.el.resultTitle.textContent = won ? '通关' : run.endless ? `无尽第 ${run.day - this.config.run.days} 天止步` : '破产';
    this.el.resultText.textContent = won
      ? '十天租金已付清！可保留现金和全部构筑进入无尽。第 11 天基础租金 24,750，之后倍率每天继续上升。'
      : `现金 ${formatInteger(run.cash)}，应付租金 ${formatInteger(run.rent)}，差额 ${formatInteger(Math.max(0, run.rent - run.cash))}。`;
    const build = run.getBuildList();
    this.el.resultStats.innerHTML = `
      <div class="summary-item"><span>到达天数</span><b>${run.day} / ${run.endless ? '∞' : this.config.run.days}</b></div>
      <div class="summary-item"><span>现金</span><b class="${won ? 'positive' : 'negative'}">${formatHudCoins(run.cash)}</b></div>
      <div class="summary-item"><span>构筑</span><b>${build.length} 项</b></div>
      <div class="summary-item"><span>单次发射</span><b>${run.singleLaunch} 颗</b></div>
      <div class="summary-item"><span>每日供给</span><b>${run.dailySupply} 颗</b></div>
      <div class="summary-item"><span>投掷次数</span><b>${this.config.run.throwsPerDay - run.throwsLeft} / ${this.config.run.throwsPerDay}</b></div>
    `;
    this.sound?.play(won ? 'won' : 'lost');
    this.el.runResultOverlay.classList.remove('hide');
  }

  handleBatchComplete(report) {
    if (report.benchmark) {
      this.updateHud(true);
      this.updateControls();
      return;
    }
    this.selectedReport = report;
    this.history.unshift(report);
    if (this.history.length > this.config.limits.maxHistory) {
      this.history.length = this.config.limits.maxHistory;
    }
    if (!report.perf) {
      setTimeout(() => {
        if (this.perf.last && this.perf.last.batchId === report.id) {
          report.perf = this.perf.last;
          if (this.selectedReport === report) this.renderReport(report);
        }
      }, 60);
    }
    this.renderReport(report);
    this.renderHistory();
    this.el.canvasShell.classList.remove('running');
    const lostText = report.lost > 0 ? `，${report.lost} 颗超时/卡球回收` : '';
    const bonusText = report.bonusSpawned > 0 ? `，增殖 ${report.bonusSpawned} 颗` : '';
    if (this.mode !== 'run') this.toast(`第 ${report.id} 批：${signed(report.net)} 币，${report.settled}/${report.spawned} 落槽${bonusText}${lostText}`);

    if (this.mode === 'run' && this.run) {
      this.run.onBatchComplete(report);
      this.renderBuild();
      this.updateHud(true);
      this.updateControls();
      clearTimeout(this.shopTimer);
      this.openNormalShop();
      return;
    }

    this.updateHud(true);
    this.updateControls();
  }

  tryAttachPerf(report) {
    if (!report || report.perf) return false;
    if (this.perf.last && this.perf.last.batchId === report.id) {
      report.perf = this.perf.last;
      if (this.selectedReport === report) this.renderReport(report);
      return true;
    }
    return false;
  }

  tick(now) {
    if (now - this.lastHudAt < this.config.ui.hudIntervalMs) return;
    this.lastHudAt = now;
    if (this.selectedReport) this.tryAttachPerf(this.selectedReport);
    this.updateHud(false);
    this.updateControls();
    // Reconcile the required rent dialog with run state, including empty advanced drafts.
    // It must never leave the player on a disabled "paying rent" screen.
    if (this.run?.phase === RUN_PHASES.RENT && !this.runtime.paused
      && this.el.helpOverlay.classList.contains('hide') && this.el.rentOverlay.classList.contains('hide')) this.openRent();
  }

  renderRentSchedule() {
    if (!this.run) return;
    const run = this.run;
    const key = `${run.endless}-${run.day}-${run.modifiers.rentDiscount}`;
    this.el.rentModeLabel.textContent = run.endless ? '无尽租金 · 倍率持续攀升' : '10 天租金目标 · 中期加速';
    if (this.el.rentSchedule.dataset.day === key) return;
    this.el.rentSchedule.dataset.day = key;
    const days = run.endless ? Array.from({ length: 7 }, (_, i) => run.day - 2 + i) : this.config.run.rents.map((_, i) => i + 1);
    this.el.rentSchedule.innerHTML = days.map(day => {
      const base = run.baseRentForDay(day), rent = base - Math.min(run.modifiers.rentDiscount || 0, Math.floor(base * .2));
      return `<div class="rent-day ${day === run.day ? 'current' : day < run.day ? 'paid' : ''}" ${day === run.day ? 'aria-current="step"' : ''} title="${formatInteger(rent)} 币"><span>第 ${day} 天${day > 10 ? ' ∞' : ''}</span><b>${formatHudCoins(rent)}</b></div>`;
    }).join('');
    const current = this.el.rentSchedule.querySelector('.current');
    this.el.rentSchedule.scrollLeft = Math.max(0, current.offsetLeft - this.el.rentSchedule.offsetLeft - this.el.rentSchedule.clientWidth / 3);
  }

  updateHud(force) {
    const current = this.sim.activeBatch;
    const display = current || this.selectedReport;
    const snapshot = this.sim.getSnapshot();
    const run = this.mode === 'run' ? this.run : null;
    this.el.hudBalance.textContent = formatHudCoins(this.wallet.balance);
    this.el.hudBalance.title = `${formatInteger(this.wallet.balance)} 币`;
    this.el.hudBatch.textContent = display ? `#${display.id}` : '--';
    this.el.hudActive.textContent = current ? current.active : 0;
    this.el.hudSettled.textContent = display ? display.settled : 0;
    this.el.hudBallHits.textContent = display ? formatInteger(display.ballBallContacts) : '0';
    this.el.hudFps.textContent = formatFps(this.perf.liveFps);
    this.el.badgeBodies.innerHTML = `弹珠刚体 <b>${snapshot.worldMarbles}</b>`;
    this.el.badgeSeed.textContent = display ? `种子 ${display.seed}` : '种子 --';
    this.el.canvasShell.classList.toggle('running', !!current && !this.runtime.paused);

    if (run) {
      this.renderRentSchedule();
      this.el.runDay.textContent = String(run.day);
      this.el.runDays.textContent = run.endless ? '∞' : String(this.config.run.days);
      this.el.runRent.textContent = formatHudCoins(run.rent);
      this.el.runRent.title = `${formatInteger(run.rent)} 币`;
      this.el.rentProgress.max = run.rent;
      this.el.rentProgress.value = Math.min(run.cash, run.rent);
      this.el.rentGap.textContent = run.cash >= run.rent ? `租金已备齐 · 可用余钱 ${formatHudCoins(run.cash - run.rent)}` : `距租金还差 ${formatHudCoins(run.rent - run.cash)} 币`;
      this.el.runThrows.textContent = String(run.throwsLeft);
      this.el.runThrowsMax.textContent = String(this.config.run.throwsPerDay);
      this.el.runSupply.textContent = String(run.supplyRemaining);
      this.el.runSupplyMax.textContent = String(run.dailySupply);
      this.el.runSingle.textContent = String(run.singleLaunch);
      const feed = snapshot.feed || {
        total: 0,
        queued: 0,
        fed: 0,
        fieldActive: 0,
        activeCap: 0
      };
      this.el.lmFed.textContent = String(feed.fed);
      this.el.lmTotal.textContent = String(feed.total);
      this.el.lmQueued.textContent = String(feed.queued);
      this.el.lmField.textContent = String(feed.fieldActive);
      this.el.lmSettled.textContent = String(current ? current.settled : (this.selectedReport ? this.selectedReport.settled : 0));
      this.el.lmCap.textContent = String(feed.activeCap || this.config.launch.activeCap);
      this.el.runPending.textContent = `+${formatInteger(run.pendingSupply)}`;
      if (this.benchRunning) {
        this.el.hudStatus.textContent = `基准 ${this.benchResults.length}/${BENCHMARK_SIZES.length}`;
      } else if (current) {
        this.el.hudStatus.textContent = this.runtime.paused ? '已暂停' : '物理运行中';
      } else if (run.phase === RUN_PHASES.NORMAL_SHOP) {
        this.el.hudStatus.textContent = '选择普通升级';
      } else if (run.phase === RUN_PHASES.SUPPLY_EMPTY) {
        this.el.hudStatus.textContent = '弹珠仓已用尽';
      } else if (run.phase === RUN_PHASES.ADVANCED_SHOP) {
        this.el.hudStatus.textContent = '高级升级';
      } else if (run.phase === RUN_PHASES.RENT) {
        this.el.hudStatus.textContent = '支付租金';
      } else if (run.phase === RUN_PHASES.WON) {
        this.el.hudStatus.textContent = '通关';
      } else if (run.phase === RUN_PHASES.LOST) {
        this.el.hudStatus.textContent = '破产';
      } else {
        this.el.hudStatus.textContent = `${run.endless ? '无尽 · ' : ''}第 ${run.day} 天 · 待投掷`;
      }
      return;
    }

    if (this.benchRunning) {
      this.el.hudStatus.textContent = `基准 ${this.benchResults.length}/${BENCHMARK_SIZES.length}`;
    } else if (current) {
      this.el.hudStatus.textContent = this.runtime.paused ? '已暂停' : '物理运行中';
    } else if (this.selectedReport) {
      this.el.hudStatus.textContent = '批次完成';
    } else {
      this.el.hudStatus.textContent = '待发射';
    }
  }

  renderReport(report) {
    if (!report) {
      this.el.reportEmpty.classList.remove('hide');
      this.el.reportBody.classList.add('hide');
      this.selectedReport = null;
      this.el.btnCsv.disabled = true;
      return;
    }
    this.el.reportEmpty.classList.add('hide');
    this.el.reportBody.classList.remove('hide');
    this.selectedReport = report;
    const launchCount = report.launchSpawned ?? report.count;
    const bonusCount = report.bonusSpawned ?? 0;
    this.el.repCount.textContent = bonusCount > 0
      ? `${formatInteger(launchCount)} + ${formatInteger(bonusCount)} 增殖`
      : formatInteger(launchCount);
    this.el.repCount.title = bonusCount > 0
      ? `发射 ${launchCount} 颗，增殖 ${bonusCount} 颗真实刚体`
      : `发射 ${launchCount} 颗`;
    this.el.repSettled.textContent = `${formatInteger(report.settled)} / ${formatInteger(report.lost)}`;
    this.el.repCost.textContent = `-${formatInteger(report.cost)}`;
    this.el.repPeg.textContent = signed(report.pegIncome);
    this.el.repPeg.title = `${report.pegAwards} 次有效命中 / ${report.pegContacts} 次接触`;
    this.el.repSlot.textContent = signed(report.slotIncome);
    this.el.repSlot.title = `其中动能兑现 +${report.railEnergyIncome || 0} 币（已包含）`;
    this.el.repNet.textContent = signed(report.net);
    this.el.repNet.className = report.net > 0 ? 'positive' : report.net < 0 ? 'negative' : '';
    if (report.applyEconomy && report.walletStart !== null && report.walletEnd !== null) {
      this.el.repBalanceLine.textContent = `余额 ${formatInteger(report.walletStart)} → ${formatInteger(report.walletEnd)} · 成本发射时扣除，收益批次结束一次性入账`;
    } else {
      this.el.repBalanceLine.textContent = '基准批次：只统计，不记账';
    }
    this.el.repDuration.textContent = formatMs(report.durationMs);
    this.el.repCollisions.textContent = formatInteger(report.totalContacts);
    this.el.repBallHits.textContent = formatInteger(report.ballBallContacts);
    this.el.repSuppressed.textContent = formatInteger(report.pegSuppressed);
    this.el.repDuplicate.textContent = formatInteger(report.duplicateSettleAttempts);
    this.el.repResidual.textContent = report.residualBodies === null ? '--' : formatInteger(report.residualBodies);
    this.el.repPhysics.textContent = report.perf ? report.perf.physicsMsPerStep.toFixed(2) : '--';
    this.el.repRender.textContent = report.perf ? report.perf.avgRenderMs.toFixed(2) : '--';
    this.el.repSeed.textContent = String(report.seed);
    this.el.repVerify.textContent = report.validationOk ? 'PASS' : 'CHECK';
    this.el.repVerify.className = report.validationOk ? 'verify-state ok' : 'verify-state fail';
    this.el.repVerifyList.innerHTML = report.validation.map((item) => (
      `<span class="check ${item.ok ? 'ok' : 'fail'}" title="${escapeHtml(item.detail)}">${escapeHtml(item.label)} · ${escapeHtml(item.detail)}</span>`
    )).join('');
    this.renderSlotDistribution(report);
    this.renderMarbleTable(report);
    this.el.btnCsv.disabled = false;
  }

  renderSlotDistribution(report) {
    const counts = report.slotCounts;
    const max = Math.max(1, ...counts);
    const values = report.slotValues;
    const names = this.config.board.slotNames;
    const html = counts.map((count, index) => {
      const height = 10 + Math.round((count / max) * 48);
      return `<div class="slot-cell ${this.config.board.jackpotSlotIds.includes(index) ? 'center' : ''}" title="${escapeHtml(names[index])} +${values[index]} 币">
        <div class="slot-bar" style="height:${height}px"></div>
        <b>${count}</b>
        <span>${escapeHtml(names[index])}</span>
        <em>+${values[index]}</em>
      </div>`;
    }).join('');
    this.el.slotDist.innerHTML = html;
  }

  renderMarbleTable(report) {
    const rows = [];
    for (let index = 0; index < report.marbles.length; index += 1) {
      const record = report.marbles[index];
      const slotName = record.slotId !== null ? (this.config.board.slotNames[record.slotId] || `槽位 ${record.slotId + 1}`) : '-';
      const duration = record.endedAt !== null ? record.endedAt - record.spawnAt : report.durationMs;
      const hitTitle = record.hitSeq.length
        ? `撞针序列：${record.hitSeq.join(' → ')}`
        : '没有有效撞针命中';
      rows.push(`<tr>
        <td>${record.index + 1}</td>
        <td title="${escapeHtml(hitTitle)}">${record.pegHits}/${record.pegContacts}</td>
        <td>${record.ballContacts}</td>
        <td>${record.wallContacts}</td>
        <td>${escapeHtml(slotName)}</td>
        <td>${signed(record.totalPayout)}</td>
        <td>${formatMs(duration)}</td>
        <td><span class="row-state ${statusClass(record)}">${statusLabel(record)}</span></td>
      </tr>`);
    }
    this.el.marbleTableBody.innerHTML = rows.join('');
    const bonusCount = report.bonusSpawned ?? 0;
    this.el.marbleSummary.textContent = `${report.marbles.length} 颗${bonusCount ? `（增殖 ${bonusCount}）` : ''} · ${report.settled} 落槽 · ${report.lost} 回收`;
  }

  renderHistory() {
    if (!this.history.length) {
      this.el.historyList.innerHTML = '<div class="empty-state">还没有批次。</div>';
      this.el.btnClearHistory.disabled = true;
      return;
    }
    this.el.historyList.innerHTML = this.history.map((report) => {
      const active = this.selectedReport && this.selectedReport.id === report.id ? 'on' : '';
      const netClass = report.net > 0 ? 'positive' : report.net < 0 ? 'negative' : '';
      return `<button class="history-row ${active}" data-report-id="${report.id}">
        <span class="history-id">#${report.id}</span>
        <span>${report.count} 颗</span>
        <span class="history-net ${netClass}">${signed(report.net)}</span>
        <span class="history-check ${report.validationOk ? 'ok' : 'fail'}">${report.validationOk ? 'PASS' : 'CHECK'}</span>
      </button>`;
    }).join('');
    this.el.btnClearHistory.disabled = false;
  }

  clearHistory() {
    if (this.sim.isBusy() || this.benchRunning) return;
    this.history.length = 0;
    this.selectedReport = null;
    this.renderReport(null);
    this.renderHistory();
    this.toast('批次历史已清空');
  }

  exportMarbleCsv() {
    const report = this.selectedReport;
    if (!report) return;
    const lines = [
      ['batch_id', 'marble_id', 'seed', 'index', 'state', 'is_bonus', 'spawn_ms', 'ended_ms', 'duration_ms', 'peg_contacts', 'peg_hits', 'peg_suppressed', 'peg_coins', 'ball_contacts', 'wall_contacts', 'slot_id', 'slot_name', 'slot_payout', 'slot_multiplier', 'base_value', 'growth_value', 'value_factor', 'total_payout', 'settle_method', 'lost_reason', 'nudges', 'hit_sequence'].join(',')
    ];
    for (const record of report.marbles) {
      const slotName = record.slotId !== null ? this.config.board.slotNames[record.slotId] : '';
      const duration = record.endedAt !== null ? record.endedAt - record.spawnAt : report.durationMs;
      lines.push([
        report.id,
        record.id,
        report.seed,
        record.index + 1,
        record.state,
        record.isBonus ? 1 : 0,
        record.spawnAt.toFixed(2),
        record.endedAt === null ? '' : record.endedAt.toFixed(2),
        duration.toFixed(2),
        record.pegContacts,
        record.pegHits,
        record.pegSuppressed,
        record.pegCoins,
        record.ballContacts,
        record.wallContacts,
        record.slotId ?? '',
        slotName,
        record.slotPayout,
        record.slotMultiplier,
        record.baseValue,
        record.growthValue,
        record.valueFactor,
        record.totalPayout,
        record.settleMethod || '',
        record.lostReason || '',
        record.nudges,
        record.hitSeq.join('|')
      ].map(csvCell).join(','));
    }
    downloadText(`pachinko-batch-${report.id}.csv`, `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
  }

  async startBenchmark() {
    if (this.mode !== 'lab') {
      this.toast('性能基准只在自由试验台模式运行');
      return;
    }
    if (this.benchRunning || this.sim.isBusy()) return;
    this.hideStart();
    this.benchRunning = true;
    this.benchResults.length = 0;
    this.el.benchTableBody.innerHTML = '';
    this.el.benchStatus.textContent = '准备运行 20 / 50 / 100 / 150 / 200 颗...';
    this.updateControls();
    try {
      await runBenchmark({
        sim: this.sim,
        perf: this.perf,
        sizes: BENCHMARK_SIZES,
        seedBase: this.config.benchmark.seedBase,
        gapMs: this.config.benchmark.gapMs,
        onProgress: (summary, index, total) => {
          this.benchResults.push(summary);
          this.appendBenchRow(summary);
          this.el.benchStatus.textContent = `已完成 ${index + 1}/${total} · ${summary.count} 颗`;
        }
      });
      const failed = this.benchResults.filter((item) => !item.validationOk).length;
      this.el.benchStatus.textContent = failed
        ? `完成 · ${failed} 个档位需要检查`
        : '完成 · 全部档位校验通过';
      this.toast(failed ? `基准完成，${failed} 个档位需要检查` : '基准完成，点击导出 CSV 保存数据');
    } catch (error) {
      console.error(error);
      this.el.benchStatus.textContent = `失败：${error.message}`;
      this.toast(`基准失败：${error.message}`);
    } finally {
      this.benchRunning = false;
      this.updateControls();
      this.updateHud(true);
    }
  }

  appendBenchRow(summary) {
    const perf = summary.perf;
    const row = document.createElement('tr');
    row.className = summary.validationOk ? '' : 'bad';
    row.innerHTML = `
      <td>${summary.count}</td>
      <td>${summary.peakActive}</td>
      <td>${perf.avgFps.toFixed(1)}</td>
      <td>${perf.p95FrameMs.toFixed(1)}</td>
      <td>${perf.physicsMsPerStep.toFixed(2)}</td>
      <td>${formatMs(summary.durationMs)}</td>
      <td>${summary.ballBallContacts}</td>
      <td><span class="row-state ${summary.validationOk ? 'ok' : 'warn'}">${summary.validationOk ? 'PASS' : 'CHECK'}</span></td>
    `;
    this.el.benchTableBody.appendChild(row);
  }

  exportBenchCsv() {
    if (!this.benchResults.length) return;
    const lines = [
      ['marbles', 'peak_active', 'avg_fps', 'min_fps', 'p95_frame_ms', 'max_frame_ms', 'peak_avg_fps', 'avg_physics_ms', 'avg_render_ms', 'physics_ms_per_step', 'display_hz', 'clear_time_ms', 'settled', 'lost', 'total_contacts', 'ball_ball_contacts', 'validation_ok'].join(',')
    ];
    for (const item of this.benchResults) {
      const perf = item.perf;
      lines.push([
        item.count,
        perf.peakActive,
        perf.avgFps.toFixed(3),
        perf.minFps.toFixed(3),
        perf.p95FrameMs.toFixed(3),
        perf.maxFrameMs.toFixed(3),
        perf.peakAvgFps.toFixed(3),
        perf.avgPhysicsMs.toFixed(3),
        perf.avgRenderMs.toFixed(3),
        perf.physicsMsPerStep.toFixed(3),
        perf.displayHz.toFixed(2),
        item.durationMs.toFixed(2),
        item.settled,
        item.lost,
        item.totalContacts,
        item.ballBallContacts,
        item.validationOk
      ].map(csvCell).join(','));
    }
    downloadText('pachinko-benchmark.csv', `\uFEFF${lines.join('\n')}`, 'text/csv;charset=utf-8');
  }

  exportBenchJson() {
    if (!this.benchResults.length) return;
    downloadText('pachinko-benchmark.json', JSON.stringify(this.benchResults, null, 2), 'application/json;charset=utf-8');
  }
}
