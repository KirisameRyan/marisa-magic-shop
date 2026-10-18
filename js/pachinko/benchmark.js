export const BENCHMARK_SIZES = [20, 50, 100, 150, 200];

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForBatch(sim, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('基准批次等待超时'));
    }, timeoutMs);
    const check = () => {
      if (!sim.isBusy()) {
        clearTimeout(timer);
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function summarize(report) {
  const perf = report.perf || {};
  return {
    count: report.count,
    id: report.id,
    seed: report.seed,
    peakActive: perf.peakActive || 0,
    peakField: report.peakFieldActive || 0,
    settled: report.settled,
    lost: report.lost,
    durationMs: report.durationMs,
    totalContacts: report.totalContacts,
    ballBallContacts: report.ballBallContacts,
    pegContacts: report.pegContacts,
    pegAwards: report.pegAwards,
    pegIncome: report.pegIncome,
    slotIncome: report.slotIncome,
    net: report.net,
    nudges: report.nudges,
    sensorSettles: report.sensorSettles,
    fallbackSettles: report.fallbackSettles,
    validationOk: report.validationOk,
    validation: report.validation,
    lostDetails: report.marbles
      .filter((record) => record.state === 'DESTROYED')
      .map((record) => ({
        id: record.id,
        reason: record.lostReason,
        nudges: record.nudges,
        spawnX: record.spawnX,
        spawnY: record.spawnY,
        slotContacts: record.slotContacts
      })),
    perf: {
      frames: perf.frames || 0,
      avgFps: perf.avgFps || 0,
      minFps: perf.minFps || 0,
      p95FrameMs: perf.p95FrameMs || 0,
      maxFrameMs: perf.maxFrameMs || 0,
      peakAvgFps: perf.peakAvgFps || 0,
      peakActive: perf.peakActive || 0,
      durationMs: perf.durationMs || 0,
      avgPhysicsMs: perf.avgPhysicsMs || 0,
      avgRenderMs: perf.avgRenderMs || 0,
      physicsMsPerStep: perf.physicsMsPerStep || 0,
      displayHz: perf.displayHz || 0
    }
  };
}

export async function runBenchmark({
  sim,
  perf,
  sizes = BENCHMARK_SIZES,
  seedBase = 20261017,
  gapMs = 350,
  timeoutMs = 120000,
  warmup = true,
  onProgress = null
} = {}) {
  if (!sim || !perf) throw new Error('缺少模拟器或性能监视器');
  if (sim.isBusy()) throw new Error('先等待当前批次结束');

  if (warmup) {
    perf.reset();
    const warm = sim.startBatch(10, {
      benchmark: true,
      applyEconomy: false,
      seed: (seedBase ^ 0x9e3779b9) >>> 0
    });
    if (!warm.ok) throw new Error(`无法启动预热批次：${warm.reason}`);
    await waitForBatch(sim, timeoutMs);
    await nextFrame();
    await sleep(gapMs);
  }

  const results = [];
  for (let index = 0; index < sizes.length; index += 1) {
    const size = sizes[index];
    perf.reset();
    const seed = (seedBase + size * 997) >>> 0;
    const start = sim.startBatch(size, {
      benchmark: true,
      applyEconomy: false,
      seed
    });
    if (!start.ok) throw new Error(`无法启动 ${size} 颗基准批次：${start.reason}`);
    await waitForBatch(sim, timeoutMs);
    await nextFrame();
    const report = sim.lastReport;
    if (!report || report.count !== size) {
      throw new Error(`${size} 颗批次未正常完成`);
    }
    report.perf = perf.last;
    const summary = summarize(report);
    results.push(summary);
    if (onProgress) onProgress(summary, index, sizes.length);
    if (index < sizes.length - 1) await sleep(gapMs);
  }
  return results;
}
