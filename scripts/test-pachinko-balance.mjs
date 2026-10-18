import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState, RUN_PHASES } = await import('../js/pachinko/run-state.js');
const { computeModifiers, getUpgrade, applyUpgrade, upgradeContext, draftUpgrades } = await import('../js/pachinko/upgrades.js');
const { createBatch, createMarbleRecord, settleMarbleRecord } = await import('../js/pachinko/ledger.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const { resolveSlotValues } = await import('../js/pachinko/board.js');

function settleSequence(modifiers, slots) {
  const batch = createBatch({ id: 1, count: slots.length, costPerMarble: 1, slotValues: resolveSlotValues(CONFIG, modifiers), jackpotSlotIds: CONFIG.board.jackpotSlotIds, modifiers });
  return slots.map((slot, i) => {
    const ball = createMarbleRecord(batch, i, 0);
    settleMarbleRecord(batch, ball, slot, i * 100, 'sensor', { x: 0, y: 0 });
    return ball.slotPayout;
  });
}
assert.deepEqual(settleSequence(computeModifiers(new Map([['jackpot_lens', 1]])), [0, 1, 4, 7, 8, 2]), [65, 8, 1, 8, 65, 0], 'jackpot lens buffs both edges, never center or drains');
assert.deepEqual(settleSequence({ slotMultiplier: 2, jackpotMultiplier: 2 }, [1, 0, 8, 4]), [16, 75, 75, 2], 'jackpot and global multipliers must add, not multiply');
assert.deepEqual(settleSequence(computeModifiers(new Map([['slot_streak', 1]])), [3, 5, 2, 3, 4]), [2, 5, 0, 2, 4], 'flat winning streak continues across prizes and drains break it');

const run = new RunState(CONFIG, { cash: 100000 });
assert.match(upgradeContext(run, getUpgrade('mass_production')), /暂不增加/);
assert.match(upgradeContext(run, getUpgrade('expand_hopper')), /暂用不完/);
applyUpgrade(run, getUpgrade('mass_production'));
assert.match(upgradeContext(run, getUpgrade('expand_hopper')), /多发 10 颗/);
assert.equal(applyUpgrade(run, getUpgrade('auto_line')).ok, true);
assert.equal(run.singleLaunch, 25);
assert.equal(run.nextDailySupply, 70);

const recycler = new RunState(CONFIG, { cash: 100000 });
for (const refund of [15, 15, 15]) recycler.onBatchComplete({ supplyRefund: refund });
assert.equal(recycler.nextDayBonus, 40, 'recycling has useful room beyond the former 20-ball cap');
assert.equal(recycler.lastReport.supplyRefund, 10, 'summary shows the actually credited refund');
recycler.phase = RUN_PHASES.RENT; recycler.payRent();
assert.equal(recycler.dailySupply, 90);

const lastDay = new RunState(CONFIG, { cash: 100000 }); lastDay.day = CONFIG.run.days;
assert.ok(draftUpgrades(lastDay, 'normal', 100, lastDay.rng).every(card => !['dailySupply', 'outerRecycle', 'productionLine'].includes(card.effect.type)));
assert.equal(lastDay.startAdvancedShop().next, 'rent', 'final day must skip upgrades that cannot affect the outcome');

const sim = new Simulation({ config: CONFIG });
const base = sim.board.layout.slots;
const baseWidth = base[0].width, basePrizeWidth = base[1].width;
assert.equal(sim.rebuildBoard({ winningExpansion: 12 }).ok, true);
const widened = sim.board.layout.slots;
assert.equal(widened[0].width, baseWidth, 'prize-area guide must preserve jackpot width');
assert.equal(widened[1].width, basePrizeWidth + 12);
assert.equal(widened[7].width, basePrizeWidth + 12);
assert.ok(widened.every(slot => slot.width > CONFIG.physics.marble.radius * 2 + CONFIG.board.dividerWidth));
assert.equal(sim.rebuildBoard({ slotExpansion: 16, winningExpansion: 12 }).ok, true);
assert.equal(sim.board.slots[0].width, baseWidth + 16);
assert.equal(sim.board.slots[8].width, baseWidth + 16);
assert.ok(sim.board.layout.slots.every(slot => slot.width > CONFIG.physics.marble.radius * 2 + CONFIG.board.dividerWidth));
console.log('BALANCE TESTS PASSED: jackpot-only multiplier, winning streaks, capacity hints, recycling, final-day draft, real prize-area geometry');
