import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.Matter = require('../js/vendor/matter.min.js');

const { CONFIG } = await import('../js/pachinko/config.js');
const { RunState, RUN_PHASES } = await import('../js/pachinko/run-state.js');
const { Simulation } = await import('../js/pachinko/simulation.js');
const { isUpgradeAvailable } = await import('../js/pachinko/upgrades.js');

const RUNS = Number(process.env.RUNS || 3);
const POLICY = process.env.POLICY || 'all';
const RENTS = (process.env.RENTS || CONFIG.run.rents.join(','))
  .split(',')
  .map((value) => Number(value));

const TAG_BY_POLICY = {
  quantity: ['quantity', 'supply'],
  value: ['value', 'marble', 'peg', 'slot'],
  slot: ['slot'],
  peg: ['peg'],
  marble: ['marble'],
  all: ['value', 'quantity', 'marble', 'peg', 'slot']
};

function availableCards(run, cards, policy) {
  const tags = TAG_BY_POLICY[policy] || TAG_BY_POLICY.all;
  const affordable = cards.filter((card) => isUpgradeAvailable(run, card) && run.cash >= run.getUpgradePrice(card));
  const preferred = affordable.filter((card) => card.tags.some((tag) => tags.includes(tag)));
  return preferred.length ? preferred : affordable;
}

function chooseNormal(run, policy) {
  let cards = availableCards(run, run.shopCards, policy);
  // A focused deck still needs launch/supply infrastructure; pure tags starve the machine.
  if (['peg', 'marble', 'slot'].includes(policy) && run.day <= 3 && run.throwsLeft % 2 === 0) {
    const utility = run.shopCards.filter((card) => card.tags.includes('quantity') && isUpgradeAvailable(run, card));
    cards = [...utility, ...cards.filter((card) => !utility.includes(card))];
  }
  if (policy === 'random') return cards[0] || null;
  if (!cards.length) return null;
  return cards.find((card) => run.cash - run.getUpgradePrice(card) >= run.rent * 1.3 + 20) || null;
}

function chooseAdvanced(run, policy) {
  if (!run.shopCards.length) return null;
  const tags = TAG_BY_POLICY[policy] || TAG_BY_POLICY.all;
  return run.shopCards.find((card) => card.tags.some((tag) => tags.includes(tag))) || run.shopCards[0];
}

function play(seed, policy, rents) {
  const config = JSON.parse(JSON.stringify(CONFIG));
  config.run.rents = rents;
  const run = new RunState(config, { seed });
  const sim = new Simulation({ config, wallet: run.wallet });
  const daily = [];
  let guard = 0;
  while (run.phase !== RUN_PHASES.WON && run.phase !== RUN_PHASES.LOST && guard < 220) {
    guard += 1;
    if (run.phase === RUN_PHASES.READY) {
      if (run.canThrow()) {
        const count = run.defaultThrow;
        if (run.boardDirty) {
          sim.rebuildBoard(run.getBoardModifiers());
          run.boardDirty = false;
        }
        const start = sim.startBatch(count, {
          applyEconomy: true,
          modifiers: run.modifiers,
          seed: run.nextBatchSeed()
        });
        if (!start.ok) {
          return { seed, policy, phase: 'start-fail', day: run.day, cash: run.cash, daily };
        }
        run.onThrowStarted(count, start.batch);
        let steps = 0;
        while (sim.isBusy() && steps < 4000) {
          sim.step();
          steps += 1;
        }
        if (sim.isBusy()) {
          return { seed, policy, phase: 'batch-hang', day: run.day, cash: run.cash, daily };
        }
        if (!sim.lastReport.validationOk) {
          return { seed, policy, phase: 'validation-fail', day: run.day, cash: run.cash, daily };
        }
        run.onBatchComplete(sim.lastReport);
      } else if (run.canEndDayEarly()) {
        run.endDayEarly();
      } else {
        return { seed, policy, phase: 'deadlock', day: run.day, cash: run.cash, daily };
      }
      continue;
    }
    if (run.phase === RUN_PHASES.NORMAL_SHOP) {
      const card = chooseNormal(run, policy);
      if (card) run.buyNormal(card.id);
      else run.skipNormal();
      continue;
    }
    if (run.phase === RUN_PHASES.SUPPLY_EMPTY) {
      run.endDayEarly();
      continue;
    }
    if (run.phase === RUN_PHASES.ADVANCED_SHOP) {
      const card = chooseAdvanced(run, policy);
      if (card) run.takeAdvanced(card.id);
      else run.phase = RUN_PHASES.RENT;
      continue;
    }
    if (run.phase === RUN_PHASES.RENT) {
      daily.push({
        day: run.day,
        cashBeforeRent: run.cash,
        rent: run.rent,
        supply: run.dailySupply,
        singleLaunch: run.singleLaunch,
        upgrades: run.stacks.size
      });
      run.payRent();
      continue;
    }
    return { seed, policy, phase: 'unexpected', day: run.day, cash: run.cash, daily };
  }
  return {
    seed,
    policy,
    phase: run.phase,
    day: run.day,
    cash: run.cash,
    rent: run.rent,
    singleLaunch: run.singleLaunch,
    dailySupply: run.dailySupply,
    build: run.getBuildList().map((item) => `${item.definition.id}×${item.stacks}`),
    daily
  };
}

const policies = POLICY === 'all'
  ? ['random', 'quantity', 'peg', 'marble', 'slot']
  : [POLICY];
const results = [];
for (const policy of policies) {
  for (let index = 0; index < RUNS; index += 1) {
    results.push(play(index + 1, policy, RENTS));
  }
}

const summary = policies.map((policy) => {
  const subset = results.filter((item) => item.policy === policy);
  const wins = subset.filter((item) => item.phase === RUN_PHASES.WON).length;
  const medianCash = subset
    .map((item) => item.cash)
    .sort((a, b) => a - b)[Math.floor(subset.length / 2)] || 0;
  return { policy, runs: subset.length, wins, winRate: wins / Math.max(1, subset.length), medianCash };
});

const output = JSON.stringify({ rents: RENTS, runsPerPolicy: RUNS, summary, results }, null, 2);
console.log(output);
if (process.env.ECON_OUT) fs.writeFileSync(process.env.ECON_OUT, output);
