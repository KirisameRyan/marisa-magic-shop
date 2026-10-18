import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState, RUN_PHASES } = await import('../js/pachinko/run-state.js');
const { UPGRADES, applyUpgrade, getUpgrade, computeModifiers } = await import('../js/pachinko/upgrades.js');
const { createBoard } = await import('../js/pachinko/board.js');
const { createBatch, createMarbleRecord, registerPegHit } = await import('../js/pachinko/ledger.js');
const { Simulation } = await import('../js/pachinko/simulation.js');

const run = new RunState(CONFIG, { cash: 1000000 });
['brass_pegs','precision_pegs','chain_impact','golden_marble','polished_marble','gold_slots','mass_production','expand_hopper'].forEach(id => applyUpgrade(run, getUpgrade(id)));
for (let day = 1; day < 10; day++) {
  run.day = day;
  assert.equal(run.startAdvancedShop().next, 'advanced');
  assert.equal(run.shopCards.length, 3, 'every pre-final day must have three offers even with 8 ordinary cards');
  assert.equal(run.takeAdvanced(run.shopCards[0].id).ok, true);
  assert.equal(run.phase, RUN_PHASES.RENT);
}
run.day = 10; assert.equal(run.startAdvancedShop().next, 'rent');
run.day = 5;
run.stacks = new Map(UPGRADES.filter(c => !c.fallback && !c.consumable && !c.excludes).map(c => [c.id, Math.min(4, c.maxStacks)]));
run.modifiers = computeModifiers(run.stacks);
assert.equal(run.startAdvancedShop().next, 'advanced');
assert.equal(run.shopCards.length, 3);
const cashBefore = run.cash;
run.shopCards = [getUpgrade('research_grant'), getUpgrade('reserve_crate'), getUpgrade('endless_polish')];
assert.equal(run.takeAdvanced('research_grant').ok, true);
assert.equal(run.cash - cashBefore, 80);
assert.equal(run.stacks.has('research_grant'), false, 'consumables do not fill equipment slots');

const modifiers = computeModifiers(new Map([['star_pegs', 2], ['crystal_pegs', 1], ['special_core', 1]]));
const board = createBoard(CONFIG, modifiers);
const special = board.pegs.filter(p => p.special);
assert.equal(special.length, 12);
for (const p of special) assert.ok(special.some(q => q.y === p.y && q.x + p.x === 600), 'conversion is mirrored');
for (const rail of board.guides.filter(g => g.body.plugin.pachinko.kind === 'side-return')) {
  for (const peg of board.pegs) {
    const dx = rail.x2 - rail.x1, dy = rail.y2 - rail.y1;
    const t = Math.max(0, Math.min(1, ((peg.x - rail.x1) * dx + (peg.y - rail.y1) * dy) / (dx * dx + dy * dy)));
    assert.ok(Math.hypot(peg.x - rail.x1 - t * dx, peg.y - rail.y1 - t * dy) > peg.radius + rail.body.plugin.pachinko.thickness / 2 + CONFIG.physics.marble.radius * 2, 'rails leave a full ball-width passage around pins');
  }
}
const batch = createBatch({ id: 1, count: 1, costPerMarble: 1, slotValues: CONFIG.board.slotValues, modifiers: { specialPegBonus: 1 } });
const ball = createMarbleRecord(batch, 0, 0);
assert.equal(registerPegHit(batch, ball, special[0], 0, 200), true);
assert.equal(ball.pegCoins, 2);
assert.equal(registerPegHit(batch, ball, special[0], 200, 200), false);
assert.equal(registerPegHit(batch, ball, special[0], 400, 200), true);
assert.equal(ball.pegCoins, 4, 'same special pin pays again after cooldown');
for (let i = 2; i <= 25; i++) registerPegHit(batch, ball, special[0], i * 400, 200);
assert.equal(ball.pegCoins, 40, 'repeat-hit earnings are bounded to 20 payouts');
const sim = new Simulation({ config: CONFIG, boardModifiers: modifiers });
sim.startBatch(1, { modifiers, applyEconomy: false, seed: 1 }); sim.step();
let event;
sim.on('pegHit', e => { event = e; });
sim.handleMarbleContact({ record: sim.activeBatch.marbles[0] }, special[0]);
assert.equal(event.value, 2, 'feedback emits actual credited coins, including upgrades');
console.log('SPECIAL TESTS PASSED: 9 daily advanced drafts, full deck, fallback rewards, mirrored conversion, repeat payouts, cooldown/cap, clear rails, actual feedback values');
