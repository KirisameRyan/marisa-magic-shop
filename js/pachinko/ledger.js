export class Wallet {
  constructor(initialBalance) {
    this.initialBalance = initialBalance;
    this.balance = initialBalance;
    this.transactions = [];
  }

  charge(amount, batchId, reason) {
    const value = Number(amount) || 0;
    if (value < 0 || value > this.balance) return false;
    this.balance -= value;
    this.transactions.push({
      type: 'charge',
      amount: -value,
      batchId,
      reason,
      balance: this.balance
    });
    this.trim();
    return true;
  }

  credit(amount, batchId, reason) {
    const value = Number(amount) || 0;
    if (value < 0) return false;
    this.balance += value;
    if (value !== 0) {
      this.transactions.push({
        type: 'credit',
        amount: value,
        batchId,
        reason,
        balance: this.balance
      });
      this.trim();
    }
    return true;
  }

  trim() {
    if (this.transactions.length > 200) {
      this.transactions.splice(0, this.transactions.length - 200);
    }
  }

  reset() {
    this.balance = this.initialBalance;
    this.transactions.length = 0;
  }
}

export function createBatch(options) {
  const count = options.count;
  const costPerMarble = options.costPerMarble;
  const slotValues = Array.isArray(options.slotValues) ? options.slotValues.slice() : [];
  return {
    id: options.id,
    count,
    costPerMarble,
    cost: count * costPerMarble,
    seed: options.seed >>> 0,
    applyEconomy: options.applyEconomy !== false,
    benchmark: options.benchmark === true,
    modifiers: options.modifiers ? { ...options.modifiers } : {},
    startedAt: 0,
    endedAt: 0,
    durationMs: 0,
    walletStart: options.walletStart ?? null,
    walletEnd: null,
    costCharged: false,
    finalized: false,
    aborted: false,
    launchSpawned: 0,
    bonusSpawned: 0,
    spawned: 0,
    active: 0,
    settled: 0,
    lost: 0,
    supplyRefund: 0,
    queued: 0,
    fed: 0,
    fieldActive: 0,
    peakFieldActive: 0,
    activeCap: 0,
    lastSlotId: null,
    slotStreak: 0,
    slotValues,
    jackpotSlotIds: options.jackpotSlotIds?.slice() ?? slotValues.flatMap((value, index) => value > 0 && value === Math.max(...slotValues) ? [index] : []),
    slotCounts: slotValues.map(() => 0),
    slotIncome: 0,
    railEnergyIncome: 0,
    pegContacts: 0,
    pegAwards: 0,
    pegSuppressed: 0,
    pegIncome: 0,
    specialIncome: 0,
    ballBallContacts: 0,
    wallContacts: 0,
    slotContacts: 0,
    totalContacts: 0,
    duplicateSettleAttempts: 0,
    nudges: 0,
    sensorSettles: 0,
    fallbackSettles: 0,
    timeoutLosses: 0,
    stuckLosses: 0,
    outOfBoundsLosses: 0,
    residualBodies: null,
    totalIncome: 0,
    net: 0,
    validation: [],
    validationOk: false,
    marbles: [],
    settling: []
  };
}

export function createMarbleRecord(batch, index, spawnAt, options = {}) {
  const isBonus = options.bonus === true;
  const valueFactor = options.valueFactor ?? 1;
  const record = {
    id: `${batch.id}-${String(index + 1).padStart(3, '0')}`,
    marbleId: `${batch.id}-${String(index + 1).padStart(3, '0')}`,
    batchId: batch.id,
    index,
    state: 'ACTIVE',
    spawnAt,
    settledAt: null,
    recycledAt: null,
    destroyedAt: null,
    endedAt: null,
    slotId: null,
    slotPayout: 0,
    railEnergyPayout: 0,
    slotMultiplier: 1,
    baseValue: (batch.modifiers?.marbleBaseValue || 0) + (isBonus ? (batch.modifiers?.bonusBallBase || 0) : 0),
    growthValue: 0,
    valueFactor,
    isBonus,
    pegContacts: 0,
    pegHits: 0,
    pegCoins: 0,
    pegSuppressed: 0,
    ballContacts: 0,
    wallContacts: 0,
    slotContacts: 0,
    nudges: 0,
    stallMs: 0,
    nextStallCheckAt: spawnAt,
    settleMethod: null,
    lostReason: null,
    totalPayout: 0,
    hitSeq: [],
    pegCooldowns: Object.create(null),
    lastPegId: null,
    lastPegAt: -Infinity,
    lastPegRow: null,
    lastPegCol: null,
    splitCount: 0,
    body: null,
    spawnX: 0,
    spawnY: 0
  };
  batch.marbles.push(record);
  if (isBonus) batch.bonusSpawned += 1;
  else batch.launchSpawned += 1;
  batch.spawned += 1;
  batch.active += 1;
  return record;
}

export function registerPegHit(batch, record, peg, simTime, cooldownMs) {
  if (!record) return false;
  record.pegContacts += 1;
  batch.pegContacts += 1;
  batch.totalContacts += 1;
  if (record.state !== 'ACTIVE') return false;
  const last = record.pegCooldowns[peg.id];
  if (last !== undefined && simTime - last < (peg.special ? Math.max(400, cooldownMs) : cooldownMs)) {
    record.pegSuppressed += 1;
    batch.pegSuppressed += 1;
    return false;
  }
  record.pegCooldowns[peg.id] = simTime;
  const modifiers = batch.modifiers || {};
  const nextHits = record.pegHits + 1;
  record.rewardPegIds ||= {};
  const rewardPin = peg.marked || peg.rare || (peg.value || 0) > 0;
  const firstReward = rewardPin && !record.rewardPegIds[peg.id];
  let value = 0;
  if (firstReward) {
    record.rewardPegIds[peg.id] = true;
    record.rewardPegHits = (record.rewardPegHits || 0) + 1;
    record.epochRewardHits = (record.epochRewardHits || 0) + 1;
    value = (peg.special ? 0 : (peg.value || 0)) + (peg.marked ? (modifiers.pegValueBonus || 0) : 0);
    if (peg.rare) value += modifiers.rarePegBonus || 0;
    if (record.lastRewardPegId != null && record.lastRewardPegId !== peg.id
      && simTime - record.lastRewardPegAt <= (modifiers.chainWindowMs || 0)) value += modifiers.chainBonus || 0;
    if (record.lastRewardPegId != null && simTime - record.lastRewardPegAt <= (modifiers.adjacentWindowMs || 0)
      && Math.abs(record.lastRewardPegRow - peg.row) <= 2 && Math.abs(record.lastRewardPegCol - peg.col) <= 2) value += modifiers.adjacentBonus || 0;
    if (modifiers.overloadThreshold && record.epochRewardHits >= modifiers.overloadThreshold) value += modifiers.overloadBonus || 0;
    if (modifiers.pegPaidHitCap && record.epochRewardHits > modifiers.pegPaidHitCap) value = 0;
    record.lastRewardPegId = peg.id; record.lastRewardPegAt = simTime;
    record.lastRewardPegRow = peg.row; record.lastRewardPegCol = peg.col;
  }
  if (peg.special && (record.specialPaidHits || 0) < 20) {
    record.specialPaidHits = (record.specialPaidHits || 0) + 1;
    value += (peg.value || 1) + (modifiers.specialPegBonus || 0);
  }
  value = Math.max(0, Math.round(value * record.valueFactor));
  record.pegHits = nextHits;
  record.pegCoins += value;
  record.totalPayout = record.pegCoins + record.slotPayout;
  batch.pegAwards += 1;
  batch.pegIncome += value;
  if (modifiers.growthPerHit) {
    record.growthValue = Math.min(
      modifiers.growthCap,
      record.growthValue + modifiers.growthPerHit
    );
  }
  record.lastPegId = peg.id;
  record.lastPegAt = simTime;
  record.lastPegRow = peg.row;
  record.lastPegCol = peg.col;
  if (record.hitSeq.length < 24) record.hitSeq.push(peg.id);
  return true;
}

export function registerBallCollision(batch, recordA, recordB) {
  if (!recordA || !recordB) return;
  recordA.ballContacts += 1;
  recordB.ballContacts += 1;
  batch.ballBallContacts += 1;
  batch.totalContacts += 1;
}

export function registerWallContact(batch, record) {
  if (!record) return;
  record.wallContacts += 1;
  batch.wallContacts += 1;
  batch.totalContacts += 1;
}

export function registerSlotContact(batch, record) {
  if (!record) return;
  record.slotContacts += 1;
  batch.slotContacts += 1;
  batch.totalContacts += 1;
}

export function settleMarbleRecord(batch, record, slotId, simTime, method, position) {
  if (!record) return false;
  if (record.state !== 'ACTIVE') {
    batch.duplicateSettleAttempts += 1;
    return false;
  }
  record.state = 'SETTLING';
  record.settledAt = simTime;
  record.slotId = slotId;
  const modifiers = batch.modifiers || {};
  const slotValue = batch.slotValues[slotId] ?? 0;
  const isDrain = slotValue <= 0;
  const isJackpot = batch.jackpotSlotIds.includes(slotId);
  const streak = modifiers.slotStreakAnyWin
    ? (isDrain ? 0 : batch.lastSlotWinning ? batch.slotStreak + 1 : 1)
    : (batch.lastSlotId === slotId ? batch.slotStreak + 1 : 1);
  const streakStacks = Math.min(Math.max(0, streak - 1), modifiers.slotStreakCap || 0);
  let multiplier = modifiers.slotMultiplier || 1;
  if (isJackpot) multiplier += (modifiers.jackpotMultiplier || 1) - 1;
  let payout = isDrain ? 0 : (
    slotValue
    + (record.baseValue || 0)
    + (record.growthValue || 0)
  ) * multiplier * (record.valueFactor || 1);
  if (!isDrain) payout += (modifiers.slotStreakBonus || 0) * streakStacks * (record.valueFactor || 1);
  if (isDrain) {
    batch.drainBank = Math.min((modifiers.drainCharge || 0) * 3, (batch.drainBank || 0) + (modifiers.drainCharge || 0));
  } else {
    const bonus = (record.pegHits >= 12 ? (modifiers.matureBonus || 0) : 0)
      + (batch.count <= 10 ? (modifiers.smallBatchBonus || 0) : 0)
      + (batch.drainBank || 0) + (batch.echoBank || 0) + (record.railEnergy || 0);
    payout += bonus * (record.valueFactor || 1);
    payout += Math.floor(record.pegCoins / 5) * (modifiers.pegCashout || 0);
    record.conditionalBonus = bonus;
    batch.drainBank = 0;
    batch.echoBank = isJackpot ? (modifiers.jackpotEcho || 0) : 0;
  }
  // Drain lanes never pay cash, even with value/growth/multiplier upgrades.
  // Recycling is an explicit build choice: it only returns next-day supply.
  if (isDrain && !record.isBonus && modifiers.outerRecycleSupply) {
    const remaining = Math.max(0, (modifiers.outerRecycleCap || 0) - batch.supplyRefund);
    batch.supplyRefund += Math.min(modifiers.outerRecycleSupply, remaining);
  }
  record.slotMultiplier = multiplier;
  record.railEnergyPayout = isDrain ? 0 : Math.max(0, Math.round((record.railEnergy || 0) * (record.valueFactor || 1)));
  batch.railEnergyIncome += record.railEnergyPayout;
  record.slotPayout = Math.max(0, Math.round(payout));
  record.settleMethod = method;
  record.totalPayout = record.pegCoins + record.slotPayout;
  batch.slotCounts[slotId] = (batch.slotCounts[slotId] || 0) + 1;
  batch.slotIncome += record.slotPayout;
  batch.lastSlotWinning = !isDrain;
  batch.lastSlotId = slotId;
  batch.slotStreak = streak;
  if (method === 'fallback') batch.fallbackSettles += 1;
  else batch.sensorSettles += 1;
  batch.settling.push({
    record,
    lost: false,
    method,
    x: position?.x ?? 0,
    y: position?.y ?? 0
  });
  return true;
}

export function markLost(batch, record, simTime, reason, position) {
  if (!record || record.state !== 'ACTIVE') return false;
  record.state = 'DESTROYED';
  record.lostReason = reason;
  record.destroyedAt = simTime;
  record.lostX = position?.x ?? null;
  record.lostY = position?.y ?? null;
  batch.lost += 1;
  if (reason === 'stuck') batch.stuckLosses += 1;
  else if (reason === 'timeout') batch.timeoutLosses += 1;
  else if (reason === 'out-of-bounds') batch.outOfBoundsLosses += 1;
  batch.settling.push({
    record,
    lost: true,
    method: reason,
    x: position?.x ?? 0,
    y: position?.y ?? 0
  });
  return true;
}

export function recycleMarbleRecord(batch, record, simTime) {
  if (!record) return false;
  if (record.state === 'SETTLING') {
    record.state = 'RECYCLED';
    record.recycledAt = simTime;
    record.endedAt = simTime;
    batch.settled += 1;
    batch.active = Math.max(0, batch.active - 1);
    if (record.launchState === 'field') batch.fieldActive = Math.max(0, batch.fieldActive - 1);
    return true;
  }
  if (record.state === 'DESTROYED') {
    record.destroyedAt = record.destroyedAt ?? simTime;
    record.endedAt = simTime;
    batch.active = Math.max(0, batch.active - 1);
    if (record.launchState === 'field') batch.fieldActive = Math.max(0, batch.fieldActive - 1);
    return true;
  }
  return false;
}

export function chargeBatch(batch, wallet) {
  if (!batch.applyEconomy) return true;
  if (batch.costCharged) return true;
  if (!wallet) return false;
  if (!wallet.charge(batch.cost, batch.id, 'batch-cost')) return false;
  batch.costCharged = true;
  return true;
}

function check(id, label, ok, detail) {
  return { id, label, ok: !!ok, detail: String(detail ?? '') };
}

export function verifyBatch(batch) {
  const checks = [];
  const uniqueIds = new Set();
  let slotPayoutSum = 0;
  let pegCoinSum = 0;
  let slotCountSum = 0;

  for (let index = 0; index < batch.marbles.length; index += 1) {
    const record = batch.marbles[index];
    uniqueIds.add(record.id);
    slotPayoutSum += record.slotPayout;
    pegCoinSum += record.pegCoins;
  }

  for (let index = 0; index < batch.slotCounts.length; index += 1) {
    slotCountSum += batch.slotCounts[index];
  }

  checks.push(check('launch', '发射数量', batch.launchSpawned === batch.count, `${batch.launchSpawned}/${batch.count}`));
  checks.push(check('fed', '进入板面', batch.fed === batch.count, `${batch.fed}/${batch.count}`));
  checks.push(check('queue', '待发清零', batch.queued === 0, `待发 ${batch.queued}`));
  checks.push(check('spawned', '总弹珠数量', batch.spawned === batch.launchSpawned + batch.bonusSpawned, `${batch.spawned} = ${batch.launchSpawned} + ${batch.bonusSpawned} 增殖`));
  checks.push(check('lifecycle', '生命周期闭合', batch.settled + batch.lost === batch.spawned, `${batch.settled} 落槽 + ${batch.lost} 回收 = ${batch.spawned}`));
  checks.push(check('active', '无活跃残留', batch.active === 0, `active=${batch.active}`));
  checks.push(check('slot-sum', '槽位收益一致', slotPayoutSum === batch.slotIncome, `${slotPayoutSum}/${batch.slotIncome}`));
  const energySum = batch.marbles.reduce((sum, record) => sum + (record.railEnergyPayout || 0), 0);
  checks.push(check('energy-sum', '动能兑现已计入槽位收益', energySum === (batch.railEnergyIncome || 0) && energySum <= batch.slotIncome, `${energySum} / 槽位 ${batch.slotIncome}`));
  checks.push(check('peg-sum', '撞针收益一致', pegCoinSum === batch.pegIncome, `${pegCoinSum}/${batch.pegIncome}`));
  checks.push(check('slot-count', '槽位计数一致', slotCountSum === batch.settled, `${slotCountSum}/${batch.settled}`));
  checks.push(check('unique', '弹珠 ID 唯一', uniqueIds.size === batch.marbles.length, `${uniqueIds.size}/${batch.marbles.length}`));
  checks.push(check('duplicate', '无重复落槽', batch.duplicateSettleAttempts === 0, `重复尝试 ${batch.duplicateSettleAttempts}`));

  if (batch.residualBodies === null) {
    checks.push(check('bodies', '无残留刚体', false, '未采集'));
  } else {
    checks.push(check('bodies', '无残留刚体', batch.residualBodies === 0, `残留 ${batch.residualBodies}`));
  }

  if (batch.applyEconomy) {
    const charged = batch.costCharged === true;
    const deltaOk = batch.walletStart !== null
      && batch.walletEnd !== null
      && batch.walletEnd - batch.walletStart === batch.net;
    checks.push(check('charge', '成本已扣一次', charged, charged ? `-${batch.cost}` : '未扣款'));
    checks.push(check('wallet', '钱包账目一致', deltaOk, `${batch.walletStart} → ${batch.walletEnd}，净变化 ${batch.net}`));
  } else {
    checks.push(check('charge', '成本已扣一次', true, '基准批次不记账'));
    checks.push(check('wallet', '钱包账目一致', true, '基准批次不记账'));
  }

  const ballCollisionOk = batch.spawned < 50 || batch.ballBallContacts > 0;
  checks.push(check('ball-ball', '球球碰撞发生', ballCollisionOk, `${batch.ballBallContacts} 次`));
  checks.push(check('clean-run', '无超时或卡球回收', batch.lost === 0, `回收 ${batch.lost}`));

  return checks;
}

export function finalizeBatch(batch, simTime, wallet) {
  if (batch.finalized) return batch;
  batch.finalized = true;
  batch.endedAt = simTime;
  batch.durationMs = simTime - batch.startedAt;
  batch.totalIncome = batch.pegIncome + batch.slotIncome + batch.specialIncome;
  batch.net = batch.totalIncome - batch.cost;

  if (batch.applyEconomy && wallet) {
    wallet.credit(batch.totalIncome, batch.id, 'batch-income');
    batch.walletEnd = wallet.balance;
  }

  batch.validation = verifyBatch(batch);
  batch.validationOk = batch.validation.every((item) => item.ok);
  return batch;
}
