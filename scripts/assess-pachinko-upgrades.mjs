import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { CONFIG } = await import('../js/pachinko/config.js');
const { UPGRADES, computeModifiers } = await import('../js/pachinko/upgrades.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const samples = Number(process.env.SAMPLES || 60);
const output = process.env.ASSESS_OUT || 'artifacts/pachinko-review/upgrade-assessment.json';
const cache = new Map();

function sample(stacks, batchSize = 10) {
  const key = JSON.stringify([[...stacks].sort(), batchSize]);
  if (cache.has(key)) return cache.get(key);
  const modifiers = computeModifiers(stacks);
  const sim = new Simulation({ config: CONFIG, boardModifiers: modifiers });
  const rows = [];
  for (let i = 1; i <= samples; i++) {
    assert.equal(sim.startBatch(batchSize, { seed: i * 101, modifiers, applyEconomy: false }).ok, true);
    for (let step = 0; sim.isBusy() && step < 6000; step++) sim.step();
    assert.equal(sim.isBusy(), false);
    assert.equal(sim.lastReport.validationOk, true);
    const report = sim.lastReport;
    rows.push({ net: report.net / batchSize, refund: report.supplyRefund, jackpot: CONFIG.board.jackpotSlotIds.reduce((n, id) => n + report.slotCounts[id], 0) / report.spawned, win: report.slotCounts.reduce((n, count, j) => n + (report.slotValues[j] > 0 ? count : 0), 0) / report.spawned, slots: report.slotCounts });
  }
  const mean = (field) => rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
  const sustainableSupply = CONFIG.run.dailySupplyBase + modifiers.dailySupplyBonus;
  const launchCapacity = CONFIG.run.throwsPerDay * (CONFIG.run.singleLaunchBase + modifiers.singleLaunchBonus);
  // Returns are capped per day and only useful when launch capacity can spend them.
  const refunds = Math.min(CONFIG.run.recycleDailyCap ?? 20, mean('refund') * CONFIG.run.throwsPerDay);
  const dailyBalls = Math.min(sustainableSupply + refunds, launchCapacity);
  const result = { batchSize, netPerBall: mean('net'), jackpotRate: mean('jackpot'), winRate: mean('win'), dailyRefund: refunds, dailyBalls, dailyNet: dailyBalls * mean('net'), rows };
  cache.set(key, result); return result;
}

const base = sample(new Map());
const cards = UPGRADES.filter(card => !card.consumable).map((card) => {
  const prerequisite = new Map((card.requires || []).map((r) => [r.id, r.stacks]));
  const before = sample(prerequisite), after = sample(new Map([...prerequisite, [card.id, 1]]));
  const paired = after.rows.map((row, i) => row.net - before.rows[i].net);
  const meanDelta = paired.reduce((sum, n) => sum + n, 0) / paired.length;
  const standardError = Math.sqrt(paired.reduce((sum, n) => sum + (n - meanDelta) ** 2, 0) / (paired.length - 1) / paired.length);
  const dailyDelta = after.dailyNet - before.dailyNet;
  return { id: card.id, name: card.name, pool: card.pool, price: card.price, prerequisites: [...prerequisite], deltaPerBall: meanDelta, standardError, dailyDelta, paybackDays: card.price && dailyDelta > 0 ? card.price / dailyDelta : null, dailyBalls: after.dailyBalls, dailyRefund: after.dailyRefund, jackpotRate: after.jackpotRate, winRate: after.winRate };
});

const scenarios = [
  ['supply_pair', new Map([['mass_production', 1], ['expand_hopper', 1]])],
  ['recycle_with_capacity', new Map([['mass_production', 2], ['recycle_bin', 1]])],
  ['peg_core', new Map([['brass_pegs', 1], ['precision_pegs', 1], ['chain_impact', 1]])],
  ['marble_core', new Map([['golden_marble', 1], ['polished_marble', 1], ['infinite_breeding', 1]])],
  ['slot_core', new Map([['gold_slots', 1], ['slot_expansion', 1], ['aimed_launch', 1]])]
].map(([name, stacks]) => { const { rows, ...result } = sample(stacks); return { name, stacks: Object.fromEntries(stacks), ...result }; });

const foundation = [['mass_production', 4], ['expand_hopper', 4], ['nitori_supply', 2]];
const endgame = [
  ['peg', [['brass_pegs', 4], ['precision_pegs', 3], ['chain_impact', 3], ['resonance', 2], ['overload', 1]]],
  ['marble', [['golden_marble', 4], ['polished_marble', 3], ['marble_compound', 1], ['infinite_breeding', 1], ['jackpot_lens', 1]]],
  ['slot', [['gold_slots', 4], ['slot_expansion', 2], ['aimed_launch', 1], ['golden_slots_prime', 1], ['jackpot_lens', 1]]]
].map(([name, cards]) => { const stacks = new Map([...foundation, ...cards]); const { rows, ...result } = sample(stacks, 30); return { name, stacks: Object.fromEntries(stacks), ...result }; });
const { rows, ...baseline } = base;
const slotCounts = base.rows.reduce((totals, row) => totals.map((n, i) => n + row.slots[i]), Array(9).fill(0));
const result = { samples, ballsPerCard: samples * 10, baseline, slotCounts, cards, scenarios, endgame, caveats: ['Paired physical batches: 10 launched balls for single cards; 30 for equal-capacity endgame builds. Probability denominators include split balls; netPerBall is per launched ball.', 'dailyNet is a steady-state throughput estimate, not a full-run win-rate prediction.', 'Quantity/recycling cards need compatible launch capacity; prerequisites included, other cards absent.'] };
fs.mkdirSync('artifacts/pachinko-review', { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, samples, baseline, cards: cards.map(c => ({ name: c.name, dailyDelta: +c.dailyDelta.toFixed(1), paybackDays: c.paybackDays && +c.paybackDays.toFixed(2) })), scenarios, endgame }, null, 2));
