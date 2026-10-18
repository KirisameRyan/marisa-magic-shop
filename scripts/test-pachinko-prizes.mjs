import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { Body } = globalThis.Matter;
const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState } = await import('../js/pachinko/run-state.js');
const { applyUpgrade, getUpgrade } = await import('../js/pachinko/upgrades.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const { settleMarbleRecord } = await import('../js/pachinko/ledger.js');

const run = new RunState(CONFIG, { cash: 100000 });
assert.equal(applyUpgrade(run, getUpgrade('gold_slots')).ok, true);
const sim = new Simulation({ config: CONFIG, boardModifiers: run.getBoardModifiers() });
assert.deepEqual(sim.board.slots.map(s => s.value), [28, 11, 0, 5, 4, 5, 0, 11, 28]);
sim.startBatch(1, { modifiers: run.modifiers, applyEconomy: false, seed: 1 }); sim.step();
const ball = sim.activeBatch.marbles[0];
settleMarbleRecord(sim.activeBatch, ball, 0, sim.simTime, 'sensor', ball.body.position);
assert.equal(ball.slotPayout, 28, 'printed amount is actually paid, without applying the bonus twice');
sim.reset();
assert.equal(applyUpgrade(run, getUpgrade('gold_slots')).ok, true);
sim.rebuildBoard(run.getBoardModifiers());
assert.equal(sim.board.slots[4].value, 7, 'ranks accumulate');
assert.equal(run.removeUpgrade('gold_slots'), true);
sim.rebuildBoard(run.getBoardModifiers());
assert.deepEqual(sim.board.slots.map(s => s.value), CONFIG.board.slotValues, 'dismantling restores base prizes');

for (const side of ['left', 'right']) {
  sim.reset(); sim.startBatch(1, { applyEconomy: false, seed: 1 }); sim.step();
  const escaped = sim.activeBatch.marbles[0];
  Body.setPosition(escaped.body, { x: side === 'left' ? 101 : 499, y: 660 });
  Body.setVelocity(escaped.body, { x: 0, y: 5 });
  sim.step();
  assert.equal(escaped.slotPayout, 0);
  assert.equal(escaped.slotId, null, 'outside overlap must never count as jackpot');
  assert.equal(sim.lastReport.lost, 1, 'escaped ball must be removed rather than snapped into a prize');
}

sim.reset(); sim.startBatch(1, { applyEconomy: false, seed: 1 }); sim.step();
const guided = sim.activeBatch.marbles[0];
Body.setPosition(guided.body, { x: 120, y: 485 });
Body.setVelocity(guided.body, { x: 0, y: 5 });
let enteredPins = false;
for (let i = 0; i < 100 && guided.body; i++) {
  sim.step();
  if (guided.body?.position.x > 155 && guided.body.position.y < CONFIG.board.slotTop) enteredPins = true;
}
assert.equal(enteredPins, true, 'side rail must physically send a wall-hugging ball back into the pin field');
console.log('PRIZE TESTS PASSED: visible flat prizes, exact payout, ranks, dismantle, escaped balls, physical side return');
