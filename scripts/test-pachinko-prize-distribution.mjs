import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { CONFIG } = await import('../js/pachinko/config.js');
const { Simulation } = await import('../js/pachinko/simulation.js');

function sample(modifiers = {}) {
  const config = structuredClone(CONFIG);
  const sim = new Simulation({ config, boardModifiers: modifiers });
  const result = { balls: 0, jackpot: 0, winning: 0, drain: 0, zeroTotal: 0, distribution: Array(9).fill(0) };
  for (let seed = 1; seed <= 100; seed++) {
    assert.equal(sim.startBatch(10, { seed: seed * 101, applyEconomy: false }).ok, true);
    for (let step = 0; sim.isBusy() && step < 6000; step++) sim.step();
    assert.equal(sim.isBusy(), false);
    assert.equal(sim.lastReport.validationOk, true);
    result.zeroTotal += sim.lastReport.marbles.filter(ball => ball.totalPayout === 0).length;
    sim.lastReport.slotCounts.forEach((count, i) => {
      result.balls += count; result.distribution[i] += count;
      if (config.board.jackpotSlotIds.includes(i)) result.jackpot += count;
      if (config.board.slotValues[i] > 0) result.winning += count;
      else result.drain += count;
    });
  }
  return { ...result, jackpotRate: result.jackpot / result.balls, drainRate: result.drain / result.balls };
}

const baseline = sample();
const expandedJackpots = sample({ slotExpansion: 8 });
const expandedMajorPrizes = sample({ winningExpansion: 12 });
assert.ok(expandedJackpots.jackpot > baseline.jackpot, 'widening both edge entrances should improve their sampled incidence');
assert.ok(baseline.distribution.slice(3, 6).reduce((a, b) => a + b) > baseline.jackpot, 'center small prizes should be more common than edge jackpots');
assert.ok(baseline.zeroTotal > 0, 'some balls must receive no cash at all');
assert.ok(baseline.drain > 0, 'some physical outcomes must be non-winning');
assert.ok(expandedMajorPrizes.winning > baseline.winning, 'prize guide should reduce drain incidence in the sample');
const result = { baseline, expandedJackpots, expandedMajorPrizes };
fs.mkdirSync('artifacts/pachinko-review', { recursive: true });
fs.writeFileSync('artifacts/pachinko-review/guarded-prize-distribution.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
