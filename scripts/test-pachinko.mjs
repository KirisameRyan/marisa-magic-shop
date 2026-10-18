import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.Matter = require('../js/vendor/matter.min.js');

const { CONFIG } = await import('../js/pachinko/config.js');
const {
  Wallet,
  createBatch,
  createMarbleRecord,
  registerPegHit,
  settleMarbleRecord,
  recycleMarbleRecord,
  chargeBatch,
  finalizeBatch
} = await import('../js/pachinko/ledger.js');
const { Simulation } = await import('../js/pachinko/simulation.js');

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function testLedger() {
  const wallet = new Wallet(1000);
  const batch = createBatch({
    id: 1,
    count: 2,
    costPerMarble: 1,
    seed: 11,
    applyEconomy: true,
    slotValues: [1, 5],
    walletStart: wallet.balance
  });
  assert.equal(chargeBatch(batch, wallet), true);
  assert.equal(wallet.balance, 998);
  assert.equal(chargeBatch(batch, wallet), true);
  assert.equal(wallet.balance, 998);

  const marbleA = createMarbleRecord(batch, 0, 0);
  const marbleB = createMarbleRecord(batch, 1, 0);
  const peg = { id: 7, value: 3 };

  assert.equal(registerPegHit(batch, marbleA, peg, 100, 200), true);
  assert.equal(registerPegHit(batch, marbleA, peg, 150, 200), false);
  assert.equal(batch.pegSuppressed, 1);
  assert.equal(registerPegHit(batch, marbleA, peg, 320, 200), true);
  assert.equal(marbleA.pegCoins, 3);
  assert.equal(batch.pegIncome, 3);

  assert.equal(settleMarbleRecord(batch, marbleA, 1, 400, 'sensor', { x: 10, y: 20 }), true);
  assert.equal(settleMarbleRecord(batch, marbleA, 0, 401, 'sensor', { x: 10, y: 20 }), false);
  assert.equal(batch.duplicateSettleAttempts, 1);
  assert.equal(batch.slotIncome, 5);
  assert.equal(marbleA.slotPayout, 5);
  assert.equal(recycleMarbleRecord(batch, marbleA, 402), true);

  assert.equal(settleMarbleRecord(batch, marbleB, 0, 410, 'fallback', { x: 11, y: 21 }), true);
  assert.equal(recycleMarbleRecord(batch, marbleB, 412), true);
  assert.equal(batch.active, 0);
  batch.residualBodies = 0;
  const result = finalizeBatch(batch, 500, wallet);
  assert.equal(result.finalized, true);
  assert.equal(result.walletEnd, wallet.balance);
  assert.equal(wallet.balance, 1000 - 2 + result.pegIncome + result.slotIncome);
  const balanceAfterFirstFinalize = wallet.balance;
  finalizeBatch(batch, 600, wallet);
  assert.equal(wallet.balance, balanceAfterFirstFinalize);
  assert.equal(result.validation.length > 0, true);
  assert.equal(result.validation.find((item) => item.id === 'duplicate').ok, false);
  assert.equal(sum(result.slotCounts), result.settled);
  console.log('ledger ok', {
    pegIncome: result.pegIncome,
    slotIncome: result.slotIncome,
    net: result.net,
    balance: wallet.balance
  });
}

function testRewardPinsAndDrains() {
  const batch = createBatch({ id: 10, count: 2, costPerMarble: 1, slotValues: [0, 8, 0], modifiers: { pegValueBonus: 4, rarePegBonus: 2, chainBonus: 3, chainWindowMs: 1800, slotMultiplier: 4, outerSlotBonus: 99, outerRecycleValue: 99, outerRecycleSupply: 1, outerRecycleCap: 3 } });
  const ball = createMarbleRecord(batch, 0, 0);
  assert.equal(registerPegHit(batch, ball, { id: 1, value: 0, row: 0, col: 0 }, 100, 200), true);
  assert.equal(ball.pegCoins, 0, 'ordinary pins ignore cash bonuses');
  registerPegHit(batch, ball, { id: 2, value: 0, marked: true, row: 1, col: 1 }, 200, 200);
  assert.equal(ball.pegCoins, 4);
  registerPegHit(batch, ball, { id: 2, value: 0, marked: true, row: 1, col: 1 }, 500, 200);
  assert.equal(ball.pegCoins, 4, 'repeat contact after cooldown cannot farm cash');
  registerPegHit(batch, ball, { id: 3, value: 3, rare: true, row: 2, col: 1 }, 600, 200);
  assert.equal(ball.pegCoins, 12, 'different reward pin earns rare + chain');
  ball.baseValue = 100; ball.growthValue = 100;
  settleMarbleRecord(batch, ball, 0, 1000, 'sensor', { x: 1, y: 1 });
  assert.equal(ball.slotPayout, 0, 'drains never pay base, growth, multiplier or legacy cash bonuses');
  assert.equal(ball.totalPayout, 12, 'already earned reward-pin coins remain');
  assert.equal(batch.supplyRefund, 1, 'recycling returns supply only');
  const winningBall = createMarbleRecord(batch, 1, 0);
  winningBall.baseValue = 2; winningBall.growthValue = 3;
  settleMarbleRecord(batch, winningBall, 1, 1100, 'sensor', { x: 2, y: 1 });
  assert.equal(winningBall.slotPayout, 52, 'value and growth require a winning lane');
  console.log('marked pins, distinct chains, zero-pay drains and supply recycling ok');
}
testRewardPinsAndDrains();

function testPaidHitCap() {
  const batch = createBatch({ id: 9, count: 1, costPerMarble: 1, slotValues: [5], modifiers: { pegPaidHitCap: 20, growthPerHit: 1, growthCap: 30 } });
  const record = createMarbleRecord(batch, 0, 0);
  for (let i = 0; i < 25; i++) registerPegHit(batch, record, { id: i, value: 2, row: 0, col: i }, i * 220, 200);
  assert.equal(record.pegCoins, 40);
  assert.equal(record.pegHits, 25);
  assert.equal(record.growthValue, 25, 'growth continues after cash cap');
  settleMarbleRecord(batch, record, 0, 6000, 'sensor', { x: 1, y: 1 });
  assert.equal(record.slotPayout, 30);
  console.log('paid hit cap preserves growth and settlement');
}
testPaidHitCap();

async function testSimulation() {
  const wallet = new Wallet(100000);
  const sim = new Simulation({ config: CONFIG, wallet });
  const cases = [1, 10, 100];
  for (const count of cases) {
    const start = sim.startBatch(count, { seed: 20261017 + count * 101 });
    assert.equal(start.ok, true, `start ${count}`);
    let steps = 0;
    let maxActive = 0;
    let maxField = 0;
    while (sim.isBusy() && steps < 4000) {
      sim.step();
      maxActive = Math.max(maxActive, sim.getActiveCount());
      maxField = Math.max(maxField, sim.getFieldActiveCount());
      steps += 1;
    }
    assert.equal(sim.isBusy(), false, `${count} batch did not finish`);
    const report = sim.lastReport;
    assert.ok(report, `missing report for ${count}`);
    assert.equal(report.spawned, count);
    assert.equal(report.fed, count);
    assert.equal(report.queued, 0);
    assert.equal(report.fieldActive, 0);
    assert.equal(report.settled + report.lost, count);
    assert.equal(report.active, 0);
    assert.equal(report.residualBodies, 0);
    assert.equal(report.duplicateSettleAttempts, 0);
    assert.equal(sim.getWorldMarbleCount(), 0);
    assert.equal(
      report.marbles.reduce((total, record) => total + record.slotPayout, 0),
      report.slotIncome
    );
    assert.equal(
      report.marbles.reduce((total, record) => total + record.pegCoins, 0),
      report.pegIncome
    );
    if (count >= 10) {
      assert.ok(report.ballBallContacts > 0, 'ball-ball collisions should happen');
    }
    assert.ok(maxField <= CONFIG.launch.activeCap, `field active ${maxField} exceeds cap`);
    if (count === 100) {
      assert.ok(maxField > 0, '100-ball stream should put marbles on the field');
    }
    console.log('simulation ok', {
      count,
      steps,
      maxActive,
      maxField,
      durationMs: Math.round(report.durationMs),
      settled: report.settled,
      lost: report.lost,
      ballBallContacts: report.ballBallContacts,
      pegIncome: report.pegIncome,
      slotIncome: report.slotIncome,
      net: report.net,
      validationOk: report.validationOk
    });
    assert.equal(report.validationOk, true, `validation failed for ${count}: ${JSON.stringify(report.validation.filter((item) => !item.ok))}`);
  }
  const snapshot = sim.getSnapshot();
  assert.equal(snapshot.worldMarbles, 0);
  console.log('simulation cleanup ok', snapshot);
}

testLedger();
await testSimulation();
console.log('ALL TESTS PASSED');
