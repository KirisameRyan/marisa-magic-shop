import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { Body } = globalThis.Matter;
const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState, RUN_PHASES } = await import('../js/pachinko/run-state.js');
const { applyUpgrade, getUpgrade, computeModifiers, draftUpgrades, normalBuildCount, replacementOptions } = await import('../js/pachinko/upgrades.js');
const { createBoard, resolveSlotValues } = await import('../js/pachinko/board.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const { registerPegHit, settleMarbleRecord } = await import('../js/pachinko/ledger.js');
const { createBatch, createMarbleRecord } = await import('../js/pachinko/ledger.js');

const run = new RunState(CONFIG, { cash: 1000000 });
const ids = ['brass_pegs','precision_pegs','chain_impact','golden_marble','polished_marble','gold_slots','mass_production','expand_hopper'];
ids.forEach(id => assert.equal(applyUpgrade(run, getUpgrade(id)).ok, true));
run.day = 6;
for (let i = 0; i < 12; i++) assert.equal(applyUpgrade(run, getUpgrade('gold_slots')).ok, true);
assert.equal(run.getUpgradeStacks('gold_slots'), 13);
assert.equal(resolveSlotValues(CONFIG, run.modifiers)[4], 1 + 39);
const offers = draftUpgrades(run, 'normal', 3, run.rng);
assert.equal(offers.length, 3); assert.ok(offers.some(card => run.stacks.has(card.id)));
const replacement = getUpgrade('rail_length');
assert.equal(replacementOptions(run, replacement).includes('polished_marble'), true);
applyUpgrade(run, getUpgrade('marble_compound'));
assert.equal(replacementOptions(run, replacement).includes('polished_marble'), false, 'must preserve advanced dependencies');
run.phase = RUN_PHASES.NORMAL_SHOP; run.shopCards = [replacement];
const oldState = JSON.stringify([...run.stacks]), oldCash = run.cash;
assert.equal(run.buyNormal(replacement.id).reason, 'replacement');
assert.equal(JSON.stringify([...run.stacks]), oldState); assert.equal(run.cash, oldCash);
assert.equal(run.buyNormal(replacement.id, 'polished_marble').reason, 'dependency');
assert.equal(run.cash, oldCash);
const price = run.getUpgradePrice(replacement);
assert.equal(run.buyNormal(replacement.id, 'gold_slots').ok, true);
assert.equal(run.stacks.has('gold_slots'), false); assert.equal(run.cash, oldCash - price);
assert.equal(normalBuildCount(run), 8);
run.phase = RUN_PHASES.NORMAL_SHOP; run.shopCards = [getUpgrade('rail_rubber')];
run.wallet.charge(run.cash, null, 'empty-wallet'); const snapshot = JSON.stringify([...run.stacks]);
assert.equal(run.buyNormal('rail_rubber', 'rail_length').reason, 'funds');
assert.equal(JSON.stringify([...run.stacks]), snapshot, 'failed purchase must not delete old card');
const zeroSlots = structuredClone(CONFIG); zeroSlots.run.buildSlots = 0;
const services = new RunState(zeroSlots, { cash: 1000 });
const fallback = draftUpgrades(services, 'normal', 3, services.rng);
assert.equal(fallback.length, 3); assert.ok(fallback.every(card => card.slotless));
assert.equal(applyUpgrade(services, fallback[0]).ok, true); assert.equal(normalBuildCount(services), 0);

for (let stage = 0; stage <= 3; stage++) {
  const board = createBoard(CONFIG, { railLength: stage, railElasticity: stage });
  for (const rail of board.guides.filter(g => g.body.plugin.pachinko.kind === 'side-return')) {
    assert.equal(rail.body.restitution, stage > 0 ? .55 + stage * .1 : .2, 'static rail retains its upgraded restitution');
    for (const pin of board.pegs) {
      const dx = rail.x2 - rail.x1, dy = rail.y2 - rail.y1;
      const t = Math.max(0, Math.min(1, ((pin.x - rail.x1) * dx + (pin.y - rail.y1) * dy) / (dx * dx + dy * dy)));
      assert.ok(Math.hypot(pin.x - rail.x1 - t * dx, pin.y - rail.y1 - t * dy) > pin.radius + rail.body.plugin.pachinko.thickness / 2 + CONFIG.physics.marble.radius * 2,
        `stage ${stage}: full ball-width clearance around every pin`);
    }
  }
}
const mods = computeModifiers(new Map([['rail_rubber',3],['rail_energy',1],['brass_pegs',1]]));
const sim = new Simulation({ config: CONFIG, boardModifiers: mods });
sim.startBatch(1, { modifiers: mods, applyEconomy: false, seed: 1 }); sim.step();
const ball = sim.activeBatch.marbles[0], marked = sim.board.pegs.find(p => p.marked);
registerPegHit(sim.activeBatch, ball, marked, sim.simTime, 200);
const initialIncome = ball.pegCoins;
registerPegHit(sim.activeBatch, ball, marked, sim.simTime + 400, 200);
assert.equal(ball.pegCoins, initialIncome, 'ordinary reward is once per epoch');
const rail = sim.board.guides.find(g => g.body.plugin.pachinko.kind === 'side-return').body.plugin.pachinko;
ball.specialPaidHits = 20;
sim.simTime += 800; sim.onRailContact(ball, rail); sim.processRailImpulses();
assert.ok(ball.body.velocity.y < -5, 'rubber applies a strong upward velocity without teleporting');
assert.equal(ball.elasticKicks, 1);
assert.equal(ball.specialPaidHits, 20, 'rubber preserves the special-pin payout limit');
sim.onRailContact(ball, rail); assert.equal(ball.elasticKicks, 1, 'simultaneous contacts do not spend multiple kicks');
registerPegHit(sim.activeBatch, ball, marked, sim.simTime, 200);
assert.equal(ball.pegCoins, initialIncome, 'rubber does not reset already paid pins');
sim.simTime += 800; sim.onRailContact(ball, rail); sim.processRailImpulses();
assert.equal(ball.elasticKicks, 2);
for (let i = 0; i < 10; i++) { sim.simTime += 800; sim.onRailContact(ball, rail); sim.processRailImpulses(); }
assert.equal(ball.elasticKicks, 6, 'powered kicks have a per-ball limit');
assert.equal(ball.railEnergyHits, 6, 'passive energy has a per-ball limit');
const energy = ball.railEnergy;
settleMarbleRecord(sim.activeBatch, ball, 4, sim.simTime, 'sensor', ball.body.position);
assert.equal(ball.slotPayout, 1 + energy, 'stored energy is redeemed only in a winning slot');

// Actual rigid-body collision at a rail must trigger a kick and still finish.
const physical = new Simulation({ config: CONFIG, boardModifiers: mods });
physical.startBatch(1, { modifiers: mods, applyEconomy: false, seed: 2 }); physical.step();
const rb = physical.activeBatch.marbles[0];
Body.setPosition(rb.body, { x: 118, y: 495 }); Body.setVelocity(rb.body, { x: 0, y: 4 });
for (let i = 0; i < 80 && rb.body && !rb.elasticKicks; i++) physical.step();
assert.ok(rb.elasticKicks > 0, 'real collision invokes powered rubber kick');
for (let i = 0; i < 6000 && physical.isBusy(); i++) physical.step();
assert.equal(physical.isBusy(), false); assert.equal(physical.lastReport.validationOk, true);
assert.equal(physical.getWorldMarbleCount(), 0);
for (const id of ['rail_inward','rail_outward','rail_spring','rail_echo']) assert.equal(getUpgrade(id), null, 'removed rail cards are absent');
const expired = new Simulation({ config: CONFIG, boardModifiers: mods });
expired.startBatch(1, { modifiers: mods, applyEconomy: false, seed: 3 }); expired.step();
const lateBall = expired.activeBatch.marbles[0]; expired.simTime = lateBall.spawnAt + 16000;
expired.onRailContact(lateBall, rail); expired.processRailImpulses();
assert.equal(lateBall.elasticKicks || 0, 0, 'old balls cannot keep receiving powered impulses');
expired.reset();
const cashoutBatch = createBatch({ id: 99, count: 2, costPerMarble: 1, modifiers: { pegCashout: 2 }, slotValues: CONFIG.board.slotValues });
const earning = createMarbleRecord(cashoutBatch, 0, 0); earning.pegCoins = 17;
settleMarbleRecord(cashoutBatch, earning, 4, 10, 'sensor', { x: 300, y: 670 });
assert.equal(earning.slotPayout, 7, 'cashout adds 2 per 5 actual earned peg coins');
const drain = createMarbleRecord(cashoutBatch, 1, 0); drain.pegCoins = 17; drain.railEnergy = 12;
settleMarbleRecord(cashoutBatch, drain, 2, 20, 'sensor', { x: 200, y: 670 });
assert.equal(drain.slotPayout, 0, 'neither cashout nor energy pays in a drain');
console.log('RAIL/GROWTH TESTS PASSED: unlimited ranks, replacement/dependencies, services, larger edge rails and all-stage pin clearance, strong kicks, payout limits, removed cards, energy and cleanup');
