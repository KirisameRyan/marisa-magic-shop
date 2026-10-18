import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.Matter = require('../js/vendor/matter.min.js');

const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState, RUN_PHASES } = await import('../js/pachinko/run-state.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const {
  applyUpgrade,
  getUpgrade,
  computeModifiers,
  draftUpgrades,
  isUpgradeAvailable
} = await import('../js/pachinko/upgrades.js');

function chooseCard(run, cards) {
  const affordable = cards.filter((card) => (
    isUpgradeAvailable(run, card) && run.cash >= run.getUpgradePrice(card)
    && run.cash - run.getUpgradePrice(card) >= run.rent * 1.3 + 20
  ));
  const preferred = affordable.find((card) => (
    card.effect.type === 'singleLaunch'
    || card.effect.type === 'dailySupply'
    || card.effect.type === 'pegValueBonus'
    || card.effect.type === 'slotMultiplier'
  ));
  return preferred || affordable[0] || null;
}

function playRun(seed) {
  const run = new RunState(CONFIG, { seed });
  const sim = new Simulation({ config: CONFIG, wallet: run.wallet });
  const batches = [];
  let guard = 0;
  let dayLaunches = 0;
  let daySupplyStart = run.dailySupply;

  while (run.phase !== RUN_PHASES.WON && run.phase !== RUN_PHASES.LOST && guard < 220) {
    guard += 1;

    if (run.phase === RUN_PHASES.READY) {
      if (run.canThrow()) {
        const count = run.defaultThrow;
        assert.ok(run.supplyRemaining >= count, `day ${run.day} supply exceeded`);
        if (run.boardDirty) {
          const rebuilt = sim.rebuildBoard(run.getBoardModifiers());
          assert.equal(rebuilt.ok, true);
          run.boardDirty = false;
        }
        const start = sim.startBatch(count, {
          applyEconomy: true,
          modifiers: run.modifiers,
          seed: run.nextBatchSeed()
        });
        assert.equal(start.ok, true, `start batch day ${run.day}`);
        const supplyBefore = run.supplyRemaining;
        run.onThrowStarted(count, start.batch);
        assert.equal(run.supplyRemaining, supplyBefore - count);
        dayLaunches += count;
        let steps = 0;
        while (sim.isBusy() && steps < 4000) {
          sim.step();
          steps += 1;
        }
        assert.equal(sim.isBusy(), false, `batch did not finish on day ${run.day}`);
        const report = sim.lastReport;
        if (!report.validationOk) {
          console.log('batch failure', {
            lost: report.lost,
            bad: report.validation.filter((item) => !item.ok),
            records: report.marbles.filter((record) => record.state === 'DESTROYED').map((record) => ({
              id: record.id,
              reason: record.lostReason,
              x: record.lostX,
              y: record.lostY,
              pegs: record.pegHits,
              nudges: record.nudges,
              spawn: record.spawnAt
            }))
          });
        }
        assert.equal(report.validationOk, true, JSON.stringify(report.validation.filter((item) => !item.ok)));
        assert.equal(report.lost, 0);
        assert.equal(report.residualBodies, 0);
        batches.push(report);
        run.onBatchComplete(report);
      } else if (run.canEndDayEarly()) {
        run.endDayEarly();
      } else {
        assert.fail(`deadlock in ready phase: ${JSON.stringify(run.getSnapshot())}`);
      }
      continue;
    }

    if (run.phase === RUN_PHASES.NORMAL_SHOP) {
      const card = chooseCard(run, run.shopCards);
      if (card) run.buyNormal(card.id);
      else run.skipNormal();
      continue;
    }

    if (run.phase === RUN_PHASES.SUPPLY_EMPTY) {
      run.endDayEarly();
      continue;
    }

    if (run.phase === RUN_PHASES.ADVANCED_SHOP) {
      const card = run.shopCards[0];
      if (card) run.takeAdvanced(card.id);
      else run.phase = RUN_PHASES.RENT;
      continue;
    }

    if (run.phase === RUN_PHASES.RENT) {
      assert.equal(daySupplyStart - run.supplyRemaining, dayLaunches, `day ${run.day} supply accounting`);
      run.payRent();
      if (run.phase !== RUN_PHASES.WON && run.phase !== RUN_PHASES.LOST) {
        daySupplyStart = run.dailySupply;
        dayLaunches = 0;
      }
      continue;
    }

    assert.fail(`unexpected phase ${run.phase}`);
  }

  assert.equal(guard < 220, true, 'run loop guard');
  const transactionSum = run.wallet.transactions.reduce((sum, item) => sum + item.amount, 0);
  assert.equal(run.wallet.balance, run.wallet.initialBalance + transactionSum);
  return { run, batches };
}

function testDualGrowth() {
  const run = new RunState(CONFIG, { seed: 7, cash: 500 });
  assert.equal(run.singleLaunch, 10);
  assert.equal(run.dailySupply, 50);
  assert.equal(run.supplyRemaining, 50);
  assert.equal(run.throwsLeft, 5);

  assert.equal(applyUpgrade(run, getUpgrade('mass_production')).ok, true);
  assert.equal(run.singleLaunch, 15);
  assert.equal(run.supplyRemaining, 50);

  assert.equal(applyUpgrade(run, getUpgrade('expand_hopper')).ok, true);
  assert.equal(run.dailySupply, 50);
  assert.equal(run.nextDailySupply, 60);
  assert.equal(run.pendingSupply, 10);

  run.phase = RUN_PHASES.RENT;
  const paid = run.payRent();
  assert.equal(paid.ok, true);
  assert.equal(run.day, 2);
  assert.equal(run.dailySupply, 60);
  assert.equal(run.supplyRemaining, 60);
  assert.equal(run.pendingSupply, 0);
  assert.equal(run.throwsLeft, 5);
  console.log('dual growth ok', {
    singleLaunch: run.singleLaunch,
    dailySupply: run.dailySupply,
    cash: run.cash,
    rent: run.rent
  });
}

function testSplitAndBoard() {
  const sim = new Simulation({ config: CONFIG, wallet: null });
  const modifiers = {
    splitEvery: 10,
    maxSplits: 8,
    splitValueFactor: 0.5,
    marbleBaseValue: 1,
    pegValueBonus: 1,
    growthPerHit: 1,
    growthCap: 12,
    slotMultiplier: 1.3
  };
  const start = sim.startBatch(30, {
    benchmark: true,
    applyEconomy: false,
    seed: 20360717,
    modifiers
  });
  assert.equal(start.ok, true);
  let steps = 0;
  while (sim.isBusy() && steps < 4000) {
    sim.step();
    steps += 1;
  }
  const report = sim.lastReport;
  assert.equal(report.validationOk, true, JSON.stringify(report.validation.filter((item) => !item.ok)));
  assert.ok(report.bonusSpawned > 0, 'split should create bonus physical marbles');
  assert.equal(report.settled + report.lost, report.spawned);
  assert.equal(sim.getWorldMarbleCount(), 0);
  const baseEdge = sim.board.layout.slots[0].width;
  const rebuilt = sim.rebuildBoard({ slotExpansion: 20 });
  assert.equal(rebuilt.ok, true);
  assert.ok(sim.board.layout.slots[0].width > baseEdge);
  assert.equal(sim.board.layout.slots[0].width, sim.board.layout.slots[8].width);
  assert.equal(sim.board.layout.centerX, sim.board.layout.feed.entryX);
  assert.equal(sim.board.layout.playLeft + sim.board.layout.playRight, sim.board.layout.centerX * 2);
  assert.equal(sim.board.layout.bumpers.length, 2);
  assert.ok(sim.board.layout.guides.length >= 4);
  assert.equal(sim.board.layout.playfieldPolygon[0].x + sim.board.layout.playfieldPolygon[5].x, sim.board.layout.centerX * 2);
  const second = sim.startBatch(20, {
    benchmark: true,
    applyEconomy: false,
    seed: 20360718,
    modifiers: {}
  });
  assert.equal(second.ok, true);
  let secondSteps = 0;
  while (sim.isBusy() && secondSteps < 4000) {
    sim.step();
    secondSteps += 1;
  }
  assert.equal(sim.lastReport.validationOk, true);
  console.log('split and board ok', {
    bonus: report.bonusSpawned,
    total: report.spawned,
    centerWidth: sim.board.layout.slots[4].width,
    centerX: sim.board.layout.centerX,
    feedX: sim.board.layout.feed.entryX
  });
}

function testBuildRules() {
  const run = new RunState(CONFIG, { seed: 99, cash: 100000 });
  const ids = ['brass_pegs', 'chain_impact', 'precision_pegs', 'golden_marble', 'polished_marble', 'gold_slots', 'mass_production', 'expand_hopper'];
  ids.forEach((id) => assert.equal(applyUpgrade(run, getUpgrade(id)).ok, true));
  assert.equal(run.stacks.size, 8);
  const before = run.cash;
  assert.equal(applyUpgrade(run, getUpgrade('recycle_bin')).reason, 'replacement');
  assert.equal(run.cash, before, 'rejected cards must not charge money');
  const rankPrice = run.getUpgradePrice(getUpgrade('brass_pegs'));
  assert.ok(rankPrice > getUpgrade('brass_pegs').price);
  assert.equal(applyUpgrade(run, getUpgrade('brass_pegs')).ok, true, 'rank up works at full capacity');
  assert.equal(before - run.cash, rankPrice, 'displayed price matches charge');
  const offers = draftUpgrades(run, 'normal', 3, run.rng);
  assert.equal(offers.length, 3);
  assert.ok(offers.some((card) => run.stacks.has(card.id)), 'full deck retains at least one rank-up offer');
  assert.equal(run.modifiers.synergies.find((item) => item.id === 'peg').active, true);
  assert.equal(computeModifiers(new Map([['brass_pegs', 4]])).synergies[0].active, false, 'ranks do not count as distinct cards');
  run.phase = RUN_PHASES.RESOLVING;
  assert.equal(run.removeUpgrade('precision_pegs'), false);
  run.phase = RUN_PHASES.READY;
  assert.equal(run.removeUpgrade('precision_pegs'), true);
  assert.equal(run.modifiers.synergies[0].active, false);
  assert.equal(applyUpgrade(run, getUpgrade('resonance')).ok, true);
  assert.equal(run.removeUpgrade('chain_impact'), false, 'cannot break a dependency');
  assert.equal(run.removeUpgrade('resonance'), true);
  assert.equal(run.removeUpgrade('chain_impact'), true);
  const loser = new RunState(CONFIG, { cash: 0 });
  loser.phase = RUN_PHASES.RENT;
  assert.equal(loser.payRent().reason, 'rent');
  assert.equal(loser.phase, RUN_PHASES.LOST);
  const winner = new RunState(CONFIG, { cash: 1000000 });
  for (let day = 1; day <= CONFIG.run.days; day++) {
    winner.phase = RUN_PHASES.RENT;
    assert.equal(winner.payRent().ok, true);
  }
  assert.equal(winner.phase, RUN_PHASES.WON);
  console.log('capacity, synergy, prices, dismantle, dependency and endings ok');
}

testBuildRules();

testDualGrowth();
testSplitAndBoard();
for (const seed of [1, 2, 3]) {
  const { run, batches } = playRun(seed);
  assert.ok([RUN_PHASES.WON, RUN_PHASES.LOST].includes(run.phase), `seed ${seed} did not reach an ending`);
  assert.ok(run.day >= 1 && run.day <= CONFIG.run.days);
  assert.ok(batches.length > 0);
  console.log('full run ok', {
    seed,
    ending: run.phase,
    batches: batches.length,
    cash: run.cash,
    rent: run.rent,
    singleLaunch: run.singleLaunch,
    dailySupply: run.dailySupply,
    build: run.getBuildList().map((item) => `${item.definition.id}×${item.stacks}`)
  });
}
console.log('ALL RUN TESTS PASSED');
