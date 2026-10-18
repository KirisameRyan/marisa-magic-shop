import { Wallet } from './ledger.js';
import { makeRng, clamp } from './utils.js';
import {
  applyUpgrade,
  computeModifiers,
  draftUpgrades,
  getUpgrade,
  getUpgradePrice
} from './upgrades.js';

export const RUN_PHASES = {
  READY: 'ready',
  RESOLVING: 'resolving',
  NORMAL_SHOP: 'normalShop',
  SUPPLY_EMPTY: 'supplyEmpty',
  ADVANCED_SHOP: 'advancedShop',
  RENT: 'rent',
  WON: 'won',
  LOST: 'lost'
};

export class RunState {
  constructor(config, options = {}) {
    this.config = config;
    this.seed = (options.seed ?? config.seed) >>> 0;
    this.rng = makeRng(this.seed);
    this.wallet = new Wallet(options.cash ?? config.run.startCash);
    this.day = 1;
    this.endless = false;
    this.settledDays = new Set();
    this.throwsLeft = config.run.throwsPerDay;
    this.singleLaunchBase = config.run.singleLaunchBase;
    this.dailySupplyBase = config.run.dailySupplyBase;
    this.dailySupply = this.dailySupplyBase;
    this.supplyRemaining = this.dailySupply;
    this.stacks = new Map();
    this.modifiers = computeModifiers(this.stacks);
    this.nextDayBonus = 0;
    this.phase = RUN_PHASES.READY;
    this.shopCards = [];
    this.refreshesRemaining = config.run.refreshesPerDay ?? 2;
    this.lastReport = null;
    this.lastLaunchCount = 0;
    this.lastBatchId = null;
    this.boardDirty = false;
    this.endReason = null;
    this.log = [];
  }

  get cash() {
    return this.wallet.balance;
  }

  get rent() {
    const base = this.baseRentForDay(this.day);
    return base - Math.min(this.modifiers.rentDiscount || 0, Math.floor(base * .2));
  }

  get isFinalDay() { return !this.endless && this.day >= this.config.run.days; }

  baseRentForDay(day) {
    const rents = this.config.run.rents;
    if (day <= rents.length) return rents[Math.max(0, day - 1)];
    let rent = rents[rents.length - 1];
    for (let i = 1; i <= day - rents.length; i++) {
      rent = Math.ceil(rent * Math.min(4, (this.config.run.endlessGrowth || 1.65) + (i - 1) * (this.config.run.endlessGrowthStep || .2)));
      if (rent >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
    }
    return rent;
  }

  get singleLaunch() {
    return clamp(
      this.singleLaunchBase + this.modifiers.singleLaunchBonus,
      this.singleLaunchBase,
      this.config.limits.maxMarbles
    );
  }

  get maxThrow() {
    return Math.max(0, Math.min(this.singleLaunch, this.supplyRemaining, Math.floor(this.cash / this.config.economy.marbleCost)));
  }

  get defaultThrow() {
    return this.maxThrow;
  }

  get nextDailySupply() {
    return this.dailySupplyBase + this.modifiers.dailySupplyBonus + this.nextDayBonus;
  }

  get pendingSupply() {
    return Math.max(0, this.nextDailySupply - this.dailySupply);
  }

  canThrow() {
    return this.phase === RUN_PHASES.READY
      && this.throwsLeft > 0
      && this.supplyRemaining >= 1
      && this.wallet.balance >= this.config.economy.marbleCost;
  }

  canEndDayEarly() {
    return (this.phase === RUN_PHASES.READY || this.phase === RUN_PHASES.SUPPLY_EMPTY)
      && this.throwsLeft > 0
      && (this.supplyRemaining < 1 || this.wallet.balance < this.config.economy.marbleCost);
  }

  nextBatchSeed() {
    return (this.rng.int(1, 0x7fffffff) ^ this.seed) >>> 0;
  }

  onThrowStarted(count, batch) {
    this.supplyRemaining = Math.max(0, this.supplyRemaining - count);
    this.throwsLeft = Math.max(0, this.throwsLeft - 1);
    this.lastLaunchCount = count;
    this.lastBatchId = batch ? batch.id : null;
    this.phase = RUN_PHASES.RESOLVING;
    this.endReason = null;
  }

  onBatchComplete(report) {
    this.lastReport = report;
    if (report.supplyRefund > 0) {
      report.supplyRefund = Math.min(report.supplyRefund, Math.max(0, (this.config.run.recycleDailyCap ?? 40) - this.nextDayBonus));
      this.nextDayBonus += report.supplyRefund;
    }
    report.reserveSupply = Math.min(this.modifiers.batchReserve || 0, Math.max(0, (this.config.run.recycleDailyCap ?? 40) - this.nextDayBonus));
    this.nextDayBonus += report.reserveSupply;
    this.phase = RUN_PHASES.NORMAL_SHOP;
    this.shopCards = draftUpgrades(this, 'normal', this.config.run.normalCards, this.rng);
    return this.shopCards;
  }

  buyNormal(id, replaceId = null) {
    if (this.phase !== RUN_PHASES.NORMAL_SHOP) return { ok: false, reason: 'phase' };
    const definition = this.shopCards.find((card) => card.id === id);
    if (!definition) return { ok: false, reason: 'card' };
    const result = applyUpgrade(this, definition, { replaceId });
    if (!result.ok) return result;
    this.shopCards = [];
    this.log.push({ kind: 'upgrade', id, day: this.day, price: result.price });
    if (replaceId) this.log.push({ kind: 'replace', removed: replaceId, added: id, day: this.day });
    return { ok: true, ...this.afterShop(), definition, price: result.price };
  }

  refreshShop() {
    const pool = this.phase === RUN_PHASES.NORMAL_SHOP ? 'normal' : this.phase === RUN_PHASES.ADVANCED_SHOP ? 'advanced' : null;
    if (!pool) return { ok: false, reason: 'phase' };
    if (this.refreshesRemaining <= 0) return { ok: false, reason: 'limit' };
    const previous = this.shopCards.slice();
    const count = pool === 'normal' ? this.config.run.normalCards : this.config.run.advancedCards;
    const fresh = draftUpgrades(this, pool, count, this.rng, { excludeIds: previous.map(card => card.id) });
    if (!fresh.length) return { ok: false, reason: 'noAlternatives' };
    const changed = fresh.length;
    this.shopCards = fresh.concat(previous.filter(card => !fresh.some(next => next.id === card.id))).slice(0, count);
    this.refreshesRemaining -= 1;
    this.log.push({ kind: 'refresh', day: this.day, pool, cards: this.shopCards.map(card => card.id) });
    return { ok: true, changed, remaining: this.refreshesRemaining };
  }

  skipNormal() {
    if (this.phase !== RUN_PHASES.NORMAL_SHOP) return { ok: false, reason: 'phase' };
    this.shopCards = [];
    return { ok: true, ...this.afterShop() };
  }

  afterShop() {
    if (this.throwsLeft <= 0) {
      return this.startAdvancedShop();
    }
    if (this.supplyRemaining < 1) {
      this.phase = RUN_PHASES.SUPPLY_EMPTY;
      this.endReason = 'supply';
      return { next: 'supplyEmpty' };
    }
    if (this.wallet.balance < this.config.economy.marbleCost) {
      this.phase = RUN_PHASES.SUPPLY_EMPTY;
      this.endReason = 'cash';
      return { next: 'supplyEmpty' };
    }
    this.phase = RUN_PHASES.READY;
    return { next: 'throw' };
  }

  endDayEarly() {
    if (!this.canEndDayEarly()) return { ok: false, reason: 'phase' };
    this.throwsLeft = 0;
    this.log.push({ kind: 'endDayEarly', day: this.day, reason: this.endReason || 'supply' });
    return { ok: true, ...this.startAdvancedShop() };
  }

  startAdvancedShop() {
    if (!this.settledDays.has(this.day)) {
      this.settledDays.add(this.day);
      const interest = Math.min(Math.floor(this.cash / 100), 10) * (this.modifiers.cashInterest || 0);
      if (interest > 0) { this.wallet.credit(interest, null, 'daily-interest'); this.log.push({ kind: 'interest', day: this.day, value: interest }); }
    }
    if (this.isFinalDay) {
      this.shopCards = []; this.phase = RUN_PHASES.RENT;
      return { next: 'rent', cards: [] };
    }
    this.phase = RUN_PHASES.ADVANCED_SHOP;
    this.shopCards = draftUpgrades(this, 'advanced', this.config.run.advancedCards, this.rng);
    if (this.shopCards.length === 0) {
      this.phase = RUN_PHASES.RENT;
      return { next: 'rent', cards: [] };
    }
    return { next: 'advanced', cards: this.shopCards };
  }

  takeAdvanced(id) {
    if (this.phase !== RUN_PHASES.ADVANCED_SHOP) return { ok: false, reason: 'phase' };
    const definition = this.shopCards.find((card) => card.id === id);
    if (!definition) return { ok: false, reason: 'card' };
    const result = applyUpgrade(this, definition);
    if (!result.ok) return result;
    this.shopCards = [];
    this.phase = RUN_PHASES.RENT;
    this.log.push({ kind: 'advanced', id, day: this.day });
    return { ok: true, definition };
  }

  payRent() {
    if (this.phase !== RUN_PHASES.RENT) return { ok: false, reason: 'phase' };
    const due = this.rent;
    if (this.wallet.balance < due) {
      this.phase = RUN_PHASES.LOST;
      this.log.push({ kind: 'rentFail', day: this.day, due, cash: this.wallet.balance });
      return { ok: false, reason: 'rent', due, cash: this.wallet.balance };
    }
    this.wallet.charge(due, `rent-${this.day}`, 'rent');
    this.log.push({ kind: 'rentPaid', day: this.day, due });
    if ((this.modifiers.lowCashBonus || 0) > 0 && this.cash < 100) {
      this.wallet.credit(this.modifiers.lowCashBonus, null, 'low-cash-grant');
    }
    if (this.isFinalDay) {
      this.phase = RUN_PHASES.WON;
      return { ok: true, won: true, day: this.day, paid: due };
    }
    return this.beginNextDay();
  }

  beginNextDay() {
    this.day += 1;
    this.refreshesRemaining = this.config.run.refreshesPerDay ?? 2;
    this.dailySupply = this.nextDailySupply;
    this.supplyRemaining = this.dailySupply;
    this.throwsLeft = this.config.run.throwsPerDay;
    this.nextDayBonus = 0;
    this.phase = RUN_PHASES.READY;
    this.endReason = null;
    this.log.push({ kind: 'dayStart', day: this.day, supply: this.dailySupply });
    return { ok: true, won: false, day: this.day, dailySupply: this.dailySupply };
  }

  startEndless() {
    if (this.phase !== RUN_PHASES.WON || this.endless) return { ok: false, reason: 'phase' };
    this.endless = true;
    this.log.push({ kind: 'endlessStart', day: this.day });
    return this.beginNextDay();
  }

  getUpgradeStacks(id) {
    return this.stacks.get(id) || 0;
  }

  removeUpgrade(id) {
    if (this.phase !== RUN_PHASES.READY || !this.stacks.has(id)) return false;
    const blocked = this.getBuildList().some(({ definition }) =>
      definition.requires?.some((requirement) => requirement.id === id));
    if (blocked) return false;
    this.stacks.delete(id);
    this.modifiers = computeModifiers(this.stacks);
    this.boardDirty = true;
    this.log.push({ kind: 'dismantle', id, day: this.day });
    return true;
  }

  getBuildList() {
    const list = [];
    for (const [id, stacks] of this.stacks.entries()) {
      const definition = getUpgrade(id);
      if (definition && stacks > 0) list.push({ definition, stacks });
    }
    return list.sort((a, b) => a.definition.name.localeCompare(b.definition.name, 'zh-CN'));
  }

  getBoardModifiers() {
    return {
      slotExpansion: this.modifiers.slotExpansion,
      specialPegCount: this.modifiers.specialPegCount,
      slotValueBonus: this.modifiers.slotValueBonus,
      jackpotValueBonus: this.modifiers.jackpotValueBonus,
      winningExpansion: this.modifiers.winningExpansion,
      outerPrizeBonus: this.modifiers.outerPrizeBonus,
      innerPrizeBonus: this.modifiers.innerPrizeBonus,
      riskySlots: this.modifiers.riskySlots,
      spawnRangeScale: this.modifiers.spawnRangeScale,
      railLength: this.modifiers.railLength, railElasticity: this.modifiers.railElasticity
    };
  }

  getUpgradePrice(definition) {
    return getUpgradePrice(definition, this.day, this.getUpgradeStacks(definition.id));
  }

  getSnapshot() {
    return {
      day: this.day,
      endless: this.endless,
      refreshesRemaining: this.refreshesRemaining,
      days: this.config.run.days,
      cash: this.wallet.balance,
      rent: this.rent,
      throwsLeft: this.throwsLeft,
      throwsPerDay: this.config.run.throwsPerDay,
      singleLaunch: this.singleLaunch,
      dailySupply: this.dailySupply,
      supplyRemaining: this.supplyRemaining,
      pendingSupply: this.pendingSupply,
      phase: this.phase,
      endReason: this.endReason,
      stacks: Object.fromEntries(this.stacks)
    };
  }
}
