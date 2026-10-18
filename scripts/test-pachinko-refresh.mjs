import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { Body } = globalThis.Matter;
const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState, RUN_PHASES } = await import('../js/pachinko/run-state.js');
const { draftUpgrades, computeModifiers } = await import('../js/pachinko/upgrades.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const { Wallet, createBatch, createMarbleRecord, settleMarbleRecord } = await import('../js/pachinko/ledger.js');

const run = new RunState(CONFIG, { cash: 1000000 });
assert.equal(run.refreshShop().reason, 'phase');
run.phase = RUN_PHASES.NORMAL_SHOP; run.shopCards = draftUpgrades(run, 'normal', 3, run.rng);
const cash = run.cash, original = run.shopCards.map(card => card.id);
assert.equal(run.refreshShop().ok, true);
assert.equal(run.refreshesRemaining, 1);
assert.ok(run.shopCards.every(card => !original.includes(card.id)));
assert.equal(run.cash, cash);
run.skipNormal(); run.phase = RUN_PHASES.NORMAL_SHOP; run.shopCards = draftUpgrades(run, 'normal', 3, run.rng);
assert.equal(run.refreshesRemaining, 1, 'another throw does not reset daily refreshes');
run.startAdvancedShop(); const advanced = run.shopCards.map(card => card.id);
assert.equal(run.refreshShop().ok, true);
assert.ok(run.shopCards.some(card => !advanced.includes(card.id)));
assert.equal(run.refreshesRemaining, 0, 'advanced and normal share a daily budget');
const unchanged = JSON.stringify(run.shopCards);
assert.equal(run.refreshShop().reason, 'limit'); assert.equal(JSON.stringify(run.shopCards), unchanged);
run.phase = RUN_PHASES.RENT; run.payRent(); assert.equal(run.refreshesRemaining, 2);
run.day = 10; run.phase = RUN_PHASES.RENT; run.payRent(); run.startEndless();
assert.equal(run.day, 11); assert.equal(run.refreshesRemaining, 2);
const limitedConfig = structuredClone(CONFIG); limitedConfig.run.buildSlots = 0;
const limited = new RunState(limitedConfig, { cash: 1000 }); limited.phase = RUN_PHASES.NORMAL_SHOP;
limited.shopCards = draftUpgrades(limited, 'normal', 3, limited.rng);
assert.equal(limited.refreshShop().reason, 'noAlternatives'); assert.equal(limited.refreshesRemaining, 2);

let previousSpeed = 0;
for (let stage = 1; stage <= 3; stage++) {
  const mods = computeModifiers(new Map([['rail_rubber', stage]]));
  const sim = new Simulation({ config: CONFIG, boardModifiers: mods });
  sim.startBatch(1, { modifiers: mods, applyEconomy: false, seed: stage }); sim.step();
  const ball = sim.activeBatch.marbles[0], rail = sim.board.guides.find(g => g.body.plugin.pachinko.kind === 'side-return').body.plugin.pachinko;
  sim.onRailContact(ball, rail); sim.processRailImpulses();
  assert.ok(ball.body.velocity.y < -3); assert.ok(ball.body.velocity.x > 5);
  const speed = Math.hypot(ball.body.velocity.x, ball.body.velocity.y);
  assert.ok(speed > previousSpeed && speed <= CONFIG.physics.maxFieldSpeed); previousSpeed = speed;
  for (let i = 1; i <= 8; i++) { sim.simTime += 800; sim.onRailContact(ball, rail); sim.processRailImpulses(); }
  assert.equal(ball.elasticKicks, 6);
  assert.equal(ball.railReturns || 0, 0, 'elastic kicks do not pretend to be spring returns');
  sim.reset();
}
const wallet = new Wallet(1000), energyMods = { railEnergyValue: 2 };
const sim = new Simulation({ config: CONFIG, wallet, boardModifiers: energyMods });
sim.startBatch(1, { modifiers: energyMods, seed: 4, applyEconomy: true }); sim.step();
const ball = sim.activeBatch.marbles[0], rail = sim.board.guides.find(g => g.body.plugin.pachinko.kind === 'side-return').body.plugin.pachinko;
sim.onRailContact(ball, rail); sim.simTime += 800; sim.onRailContact(ball, rail);
assert.equal(ball.railEnergy, 4);
Body.setPosition(ball.body, { x: 300, y: 665 }); Body.setVelocity(ball.body, { x: 0, y: 0 });
for (let i = 0; i < 100 && sim.isBusy(); i++) sim.step();
assert.equal(sim.lastReport.railEnergyIncome, 4);
assert.equal(ball.railEnergyPayout, 4); assert.equal(ball.slotPayout, 5);
assert.equal(sim.lastReport.slotIncome, 5); assert.equal(wallet.balance, 1004, 'energy is paid once as part of slot income');
sim.step(); assert.equal(wallet.balance, 1004);
assert.equal(sim.lastReport.validationOk, true);
const batch = createBatch({ id: 9, count: 2, costPerMarble: 1, slotValues: CONFIG.board.slotValues });
const child = createMarbleRecord(batch, 0, 0, { bonus: true, valueFactor: .5 }); child.railEnergy = 4;
settleMarbleRecord(batch, child, 4, 1, 'sensor', { x: 300, y: 670 }); assert.equal(child.railEnergyPayout, 2);
const drain = createMarbleRecord(batch, 1, 0); drain.railEnergy = 8;
settleMarbleRecord(batch, drain, 2, 2, 'sensor', { x: 200, y: 670 }); assert.equal(drain.railEnergyPayout, 0);
assert.equal(batch.railEnergyIncome, 2);
for (const cards of [
  [['rail_rubber',3],['rail_energy',3]],
  [['rail_rubber',3],['rail_length',3],['rail_energy',3]]
]) {
  const mods = computeModifiers(new Map(cards));
  const stress = new Simulation({ config: CONFIG, boardModifiers: mods });
  stress.startBatch(100, { modifiers: mods, applyEconomy: false, seed: 20261018 });
  for (let i = 0; i < 6000 && stress.isBusy(); i++) stress.step();
  assert.equal(stress.isBusy(), false);
  assert.equal(stress.lastReport.validationOk, true, JSON.stringify(stress.lastReport.validation.filter(check => !check.ok)));
  assert.equal(stress.getWorldMarbleCount(), 0);
}
console.log('REFRESH/POWER TESTS PASSED: daily shared rerolls, reset/endless/no-alternative guards, tiered strong impulses, bounded independent budgets and exact energy wallet accounting');
