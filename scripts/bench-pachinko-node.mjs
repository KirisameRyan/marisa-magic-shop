import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.Matter = require('../js/vendor/matter.min.js');

const { CONFIG } = await import('../js/pachinko/config.js');
const { Simulation } = await import('../js/pachinko/simulation.js');

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * p));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function runCase(sim, size, seed) {
  const start = sim.startBatch(size, {
    seed,
    benchmark: true,
    applyEconomy: false
  });
  if (!start.ok) throw new Error(`无法启动 ${size} 颗批次：${start.reason}`);
  const stepTimes = [];
  let maxActive = 0;
  let steps = 0;
  while (sim.isBusy() && steps < 4000) {
    const t0 = performance.now();
    sim.step();
    stepTimes.push(performance.now() - t0);
    maxActive = Math.max(maxActive, sim.getActiveCount());
    steps += 1;
  }
  if (sim.isBusy()) throw new Error(`${size} 颗批次未完成`);
  const report = sim.lastReport;
  const sorted = stepTimes.slice().sort((a, b) => a - b);
  const total = stepTimes.reduce((sum, value) => sum + value, 0);
  return {
    count: size,
    seed,
    steps,
    simulationTimeMs: Number(report.durationMs.toFixed(1)),
    maxActive,
    avgStepMs: Number((total / stepTimes.length).toFixed(4)),
    p95StepMs: Number(percentile(sorted, 0.95).toFixed(4)),
    maxStepMs: Number(sorted[sorted.length - 1].toFixed(4)),
    totalStepMs: Number(total.toFixed(1)),
    totalContacts: report.totalContacts,
    ballBallContacts: report.ballBallContacts,
    settled: report.settled,
    lost: report.lost,
    validationOk: report.validationOk,
    badChecks: report.validation.filter((item) => !item.ok)
  };
}

const sim = new Simulation({ config: CONFIG, wallet: null });
runCase(sim, 20, 1);
const sizes = CONFIG.benchmark.sizes;
const seedBase = CONFIG.benchmark.seedBase;
const results = [];
for (const size of sizes) {
  results.push(runCase(sim, size, (seedBase + size * 997) >>> 0));
}
const output = {
  testedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    cpu: os.cpus()[0]?.model,
    cpuCount: os.cpus().length
  },
  results
};
const text = JSON.stringify(output, null, 2);
console.log(text);
if (process.env.PACHINKO_OUT) fs.writeFileSync(process.env.PACHINKO_OUT, text);
if (results.some((item) => !item.validationOk)) process.exitCode = 1;
