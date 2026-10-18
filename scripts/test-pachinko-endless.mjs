import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
globalThis.Matter = createRequire(import.meta.url)('../js/vendor/matter.min.js');
const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState, RUN_PHASES } = await import('../js/pachinko/run-state.js');
const { UPGRADES, computeModifiers, applyUpgrade, getUpgrade, draftUpgrades } = await import('../js/pachinko/upgrades.js');
const { resolveSlotValues } = await import('../js/pachinko/board.js');
const { createBatch, createMarbleRecord, settleMarbleRecord } = await import('../js/pachinko/ledger.js');

function payouts(modifiers, slots, count = slots.length, hits = 0) {
  const batch = createBatch({ id: 1, count, costPerMarble: 1, modifiers, slotValues: resolveSlotValues(CONFIG, modifiers), jackpotSlotIds: CONFIG.board.jackpotSlotIds });
  const values = slots.map((slot, index) => {
    const record = createMarbleRecord(batch, index, 0); record.pegHits = hits;
    settleMarbleRecord(batch, record, slot, index * 100, 'sensor', { x: 300, y: 670 });
    return record.slotPayout;
  });
  return { values, batch };
}
assert.deepEqual(payouts({ drainCharge: 3 }, [2, 2, 2, 2, 4, 4]).values, [0, 0, 0, 0, 10, 1], 'drains never pay directly; capped bank cashes out once');
assert.deepEqual(payouts({ jackpotEcho: 12 }, [0, 2, 4, 4]).values, [25, 0, 13, 1], 'echo survives drain and is consumed by next win');
assert.deepEqual(payouts({ matureBonus: 5 }, [4], 1, 11).values, [1]);
assert.deepEqual(payouts({ matureBonus: 5 }, [4], 1, 12).values, [6]);
assert.deepEqual(payouts({ smallBatchBonus: 3 }, [4, 2], 10).values, [4, 0]);
assert.deepEqual(payouts({ smallBatchBonus: 3 }, [4], 11).values, [1]);
const splitMods = computeModifiers(new Map([['infinite_breeding', 1], ['twin_reactor', 2], ['split_shell', 1]]));
assert.equal(splitMods.maxSplits, 12); assert.equal(splitMods.splitEvery, 6);
const splitBatch = createBatch({ id: 2, count: 1, costPerMarble: 1, slotValues: CONFIG.board.slotValues, modifiers: { bonusBallBase: 3 } });
assert.equal(createMarbleRecord(splitBatch, 0, 0).baseValue, 0);
assert.equal(createMarbleRecord(splitBatch, 1, 0, { bonus: true, valueFactor: .5 }).baseValue, 3);
assert.deepEqual(resolveSlotValues(CONFIG, { outerPrizeBonus: 3, innerPrizeBonus: 2, riskySlots: 30 }), [58, 11, 0, 3, 2, 3, 0, 11, 58]);

const run = new RunState(CONFIG, { cash: 100000000 });
assert.equal(run.startEndless().ok, false);
assert.deepEqual([11, 12, 13].map(day => run.baseRentForDay(day)), [24750, 45788, 93866]);
assert.ok(CONFIG.run.rents[6] > 2850 * 1.5);
applyUpgrade(run, getUpgrade('gold_slots')); run.nextDayBonus = 12;
run.day = 10; run.phase = RUN_PHASES.RENT;
assert.equal(run.payRent().won, true);
const savedCash = run.cash, savedBuild = JSON.stringify([...run.stacks]);
assert.equal(run.startEndless().ok, true); assert.equal(run.day, 11);
assert.equal(run.cash, savedCash); assert.equal(JSON.stringify([...run.stacks]), savedBuild);
assert.equal(run.dailySupply, 62);
assert.equal(run.startEndless().ok, false); assert.equal(run.day, 11);
for (let day = 11; day <= 15; day++) {
  assert.equal(run.startAdvancedShop().next, 'advanced');
  assert.equal(run.shopCards.length, 3);
  assert.equal(run.takeAdvanced(run.shopCards[0].id).ok, true);
  assert.equal(run.payRent().won, false); assert.equal(run.day, day + 1);
  assert.equal(run.payRent().ok, false, 'double rent payment cannot advance another day');
}
run.day = 100000;
assert.equal(run.baseRentForDay(run.day), Number.MAX_SAFE_INTEGER);
assert.ok(Number.isSafeInteger(run.rent));
run.wallet.charge(run.cash, null, 'test'); run.phase = RUN_PHASES.RENT;
assert.equal(run.payRent().ok, false); assert.equal(run.phase, RUN_PHASES.LOST);

const depleted = new RunState(CONFIG, { cash: 100000 }); depleted.endless = true; depleted.day = 30;
depleted.stacks = new Map(UPGRADES.filter(c => !c.consumable && Number.isFinite(c.maxStacks)).map(c => [c.id, c.maxStacks]));
depleted.modifiers = computeModifiers(depleted.stacks);
assert.equal(draftUpgrades(depleted, 'advanced', 3, depleted.rng).length, 3, 'endless daily rewards remain available after every finite card is maxed');
assert.equal(applyUpgrade(depleted, getUpgrade('endless_polish')).ok, true);

const economy = new RunState(CONFIG, { cash: 1000 });
applyUpgrade(economy, getUpgrade('cash_interest'));
const bankBefore = economy.cash;
economy.startAdvancedShop(); const earned = economy.cash - bankBefore;
assert.equal(earned, 27); economy.startAdvancedShop(); assert.equal(economy.cash - bankBefore, earned, 'interest pays once per day');
economy.day = 4;
assert.equal(applyUpgrade(economy, getUpgrade('rent_voucher')).ok, true);
assert.equal(economy.rent, 800);
economy.modifiers = { batchReserve: 6 }; economy.nextDayBonus = 38;
const report = { supplyRefund: 0 }; economy.onBatchComplete(report);
assert.equal(report.reserveSupply, 2); assert.equal(economy.nextDayBonus, 40);
const broke = new RunState(CONFIG, { cash: 3 }); assert.equal(broke.defaultThrow, 3, 'launch quantity respects available cash');
console.log('ENDLESS/BUILD TESTS PASSED: conditional rewards, split growth, printed prizes, accelerating rents, preserved win/continuation, repeated daily drafts, finite numbers, interest guard, reserve cap and affordable launch');
