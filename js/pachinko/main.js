import { ArcadeSound } from './sound.js';
import { CONFIG } from './config.js';
import { Wallet } from './ledger.js';
import { Simulation } from './simulation.js';
import { PixelRenderer as Renderer } from './pixel-renderer.js';
import { PerfMonitor } from './perf.js';
import { UI } from './ui.js?v=balance-5';
import { BENCHMARK_SIZES, runBenchmark } from './benchmark.js';

function boot() {
  const canvas = document.getElementById('pachinkoCanvas');
  const fatalError = document.getElementById('fatalError');
  if (!canvas) throw new Error('找不到弹珠台画布');
  if (!globalThis.Matter) throw new Error('Matter.js 未加载');

  const wallet = new Wallet(CONFIG.economy.trialCoins);
  const sim = new Simulation({ config: CONFIG, wallet });
  const renderer = new Renderer(canvas, sim.board, CONFIG);
  const perf = new PerfMonitor();
  const runtime = { paused: false };
  const sound = new ArcadeSound();
  document.addEventListener('pointerdown', () => sound.unlock(), { passive: true });
  const ui = new UI({ sim, renderer, perf, wallet, config: CONFIG, runtime, sound });

  sim.on('launchFeed', () => renderer.flashGate());
  sim.on('pegHit', (event) => {
    sound.play('hit', event.index);
    renderer.flashPeg(event.index);
    renderer.addPegFx(event.x, event.y, event.value, event.rare, event.special);
  });
  sim.on('bumperHit', (event) => {
    renderer.flashBumper(event.index);
  });
  sim.on('railHit', (event) => renderer.addRailFx(event));
  sim.on('marbleSettled', (event) => {
    if (event.value > 0) sound.play(sim.board.slots[event.record.slotId]?.jackpot ? 'jackpot' : 'settle');
    renderer.addSettleFx(event.x, event.y, event.value, event.record.slotId, event.record.railEnergyPayout);
  });
  sim.on('marbleLost', (event) => {
    renderer.addLostFx(event.x, event.y, event.reason);
  });

  const app = {
    config: CONFIG,
    sim,
    renderer,
    perf,
    wallet,
    ui,
    runtime,
    sound,
    runBenchmark: async () => {
      ui.hideStart();
      return runBenchmark({
        sim,
        perf,
        sizes: BENCHMARK_SIZES,
        seedBase: CONFIG.benchmark.seedBase,
        gapMs: CONFIG.benchmark.gapMs
      });
    },
    debug: {
      snapshot: () => sim.getSnapshot(),
      verify: () => (sim.lastReport ? sim.lastReport.validation : []),
      start: (count, options) => sim.startBatch(count, options),
      lastReport: () => sim.lastReport
    }
  };
  window.PachinkoApp = app;

  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastFrameAt = performance.now();
      accumulator = 0;
      perf.resetFrameClock();
    }
  });

  let lastFrameAt = performance.now();
  let accumulator = 0;
  let previousPaused = runtime.paused;
  const fixedDt = CONFIG.physics.fixedDt;
  const maxSubSteps = CONFIG.physics.maxSubSteps;

  function frame(now) {
    if (runtime.paused !== previousPaused) {
      previousPaused = runtime.paused;
      lastFrameAt = now;
      accumulator = 0;
    }

    let delta = now - lastFrameAt;
    lastFrameAt = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    if (delta > 100) delta = 100;

    try {
      const wasBusy = sim.isBusy();
      const activeBefore = sim.getActiveCount();
      let physicsMs = 0;
      let steps = 0;

      if (!runtime.paused && wasBusy) {
        accumulator += delta;
        while (accumulator >= fixedDt && steps < maxSubSteps) {
          const start = performance.now();
          sim.step();
          physicsMs += performance.now() - start;
          accumulator -= fixedDt;
          steps += 1;
          if (!sim.isBusy()) break;
        }
        if (steps >= maxSubSteps) accumulator = 0;
      } else {
        accumulator = 0;
      }

      const isBusy = sim.isBusy();
      const activeDuring = Math.max(activeBefore, sim.getActiveCount());
      const renderStart = performance.now();
      renderer.draw(sim, now, { paused: runtime.paused });
      const renderMs = performance.now() - renderStart;

      perf.tick(now, {
        wasBusy,
        isBusy,
        active: activeDuring,
        physicsMs,
        renderMs,
        steps,
        paused: runtime.paused,
        batchId: sim.lastReport ? sim.lastReport.id : null
      });
      ui.tick(now);
    } catch (error) {
      console.error(error);
    } finally {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);

  if (fatalError) fatalError.classList.add('hide');
}

try {
  boot();
} catch (error) {
  console.error(error);
  const box = document.getElementById('fatalError');
  if (box) {
    box.textContent = `启动失败：${error.message}`;
    box.classList.remove('hide');
  }
}
