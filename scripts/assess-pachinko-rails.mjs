import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { CONFIG } = await import('../js/pachinko/config.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const { computeModifiers } = await import('../js/pachinko/upgrades.js');
const variants = [
  ['baseline', []],
  ['extended', [['rail_length',3]]], ['elastic', [['rail_rubber',3]]],
  ['rail_build', [['rail_length',3],['rail_rubber',3],['rail_energy',2],['brass_pegs',3]]],
  ['slot_core', [['gold_slots',3],['outer_gild',3],['inner_alchemy',3]]]
];
const samples = Number(process.env.RAIL_SAMPLES || 60);
const results = [];
for (const [name, cards] of variants) {
  const mods = computeModifiers(new Map(cards));
  const sim = new Simulation({ config: CONFIG, boardModifiers: mods });
  const result = { name, cards, balls: 0, net: 0, pegHits: 0, pegIncome: 0, slotIncome: 0, elasticKicks: 0, outerPrizes: 0, jackpots: 0, maxDuration: 0 };
  for (let seed = 1; seed <= samples; seed++) {
    assert.equal(sim.startBatch(10, { modifiers: mods, seed: seed * 101, applyEconomy: false }).ok, true);
    for (let step = 0; sim.isBusy() && step < 6000; step++) sim.step();
    assert.equal(sim.isBusy(), false); const report = sim.lastReport;
    assert.equal(report.validationOk, true, JSON.stringify({ name, seed, failed: report.validation.filter(check => !check.ok), balls: report.marbles.filter(ball => ball.lostReason) }));
    result.balls += report.spawned; result.net += report.net;
    result.pegIncome += report.pegIncome; result.slotIncome += report.slotIncome;
    result.maxDuration = Math.max(result.maxDuration, report.durationMs);
    result.pegHits += report.marbles.reduce((sum, ball) => sum + ball.pegHits, 0);
    result.elasticKicks += report.marbles.reduce((sum, ball) => sum + (ball.elasticKicks || 0), 0);
    result.outerPrizes += [0,1,7,8].reduce((sum, id) => sum + report.slotCounts[id], 0);
    result.jackpots += [0,8].reduce((sum, id) => sum + report.slotCounts[id], 0);
  }
  result.netPerBall = result.net / (samples * 10);
  result.hitsPerBall = result.pegHits / result.balls;
  result.outerRate = result.outerPrizes / result.balls; result.jackpotRate = result.jackpots / result.balls;
  results.push(result);
}
fs.mkdirSync('artifacts/pachinko-review', { recursive: true });
fs.writeFileSync('artifacts/pachinko-review/rail-simplified-assessment.json', JSON.stringify({ samples, results }, null, 2));
console.log(JSON.stringify(results.map(({ name, netPerBall, hitsPerBall, elasticKicks, outerRate, jackpotRate, maxDuration }) => ({ name, netPerBall, hitsPerBall, elasticKicks, outerRate, jackpotRate, maxDuration })), null, 2));
