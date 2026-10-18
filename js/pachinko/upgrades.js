import { clamp } from './utils.js';

const TAG_LABELS = {
  marble: '弹珠',
  peg: '撞针',
  slot: '槽位',
  value: '收益',
  quantity: '数量',
  supply: '供给',
  physical: '物理',
  economy: '经营',
  rail: '挡板'
};

const RARITY_LABELS = {
  common: '普通',
  rare: '稀有',
  advanced: '高级'
};

const RARITY_WEIGHTS = {
  common: 3,
  rare: 1.4,
  advanced: 1
};

export const UPGRADES = [
  { id: 'rail_length', name: '延伸挡板', rarity: 'rare', pool: 'normal', price: 20, maxStacks: 3, tags: ['rail', 'physical'], effect: { type: 'railLength', value: 1 }, description: '两侧挡板沿侧壁向上延长 8px，最多 3 段；不伸入撞针球路。' },
  { id: 'rail_rubber', name: '弹性包覆', rarity: 'rare', pool: 'normal', price: 22, maxStacks: 3, tags: ['rail', 'physical'], effect: { type: 'railElasticity', value: 1 }, description: '命中挡板时强力斜上回弹，层数越高力量越大；每球前 15 秒最多强弹 6 次，不刷新撞针领奖周期。' },
  { id: 'rail_energy', name: '动能兑现', rarity: 'rare', pool: 'normal', price: 24, maxStacks: Infinity, tags: ['rail', 'marble'], effect: { type: 'railEnergyValue', value: 2 }, description: '每次有效挡板碰撞积蓄 +2 币动能/层，每球最多蓄 6 次，中奖时兑现；落空失去动能。' },
  { id: 'slot_cashout', name: '奖槽收束', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: Infinity, requires: [{ id: 'gold_slots', stacks: 1 }], tags: ['slot', 'value'], effect: { type: 'pegCashout', value: 1 }, description: '中奖时，本球每已赚到 5 币撞针收入，再额外结算 1 币/层；落空不兑现。' },
  { id: 'service_value', name: '工坊加值', rarity: 'common', pool: 'normal', price: 28, maxStacks: Infinity, fallback: true, slotless: true, tags: ['value'], effect: { type: 'marbleBaseValue', value: 1 }, description: '普通池候选不足时提供：中奖弹珠基础价值 +1，不占构筑位置。' },
  { id: 'service_growth', name: '精炼服务', rarity: 'common', pool: 'normal', price: 32, maxStacks: Infinity, fallback: true, slotless: true, tags: ['value'], effect: { type: 'growth', perHit: 1, cap: 1 }, description: '普通池候选不足时提供：有效撞针成长 +1、成长上限 +1，不占构筑位置。' },
  { id: 'service_slots', name: '奖槽保养', rarity: 'common', pool: 'normal', price: 30, maxStacks: Infinity, fallback: true, slotless: true, tags: ['value'], effect: { type: 'slotValue', value: 1 }, description: '普通池候选不足时提供：非落空槽各 +1 币，不占构筑位置，台面更新。' },
  { id: 'patient_core', name: '慢热晶核', rarity: 'rare', pool: 'normal', price: 26, maxStacks: 3, tags: ['marble', 'value'], effect: { type: 'matureBonus', value: 5 }, description: '单球有效撞针达到 12 次后，中奖结算额外 +5 币/层；落空不兑现。' },
  { id: 'split_shell', name: '双生外壳', rarity: 'rare', pool: 'normal', price: 24, maxStacks: 3, tags: ['marble', 'value'], requires: [{ id: 'infinite_breeding', stacks: 1 }], effect: { type: 'bonusBallBase', value: 3 }, description: '仅分裂子球的中奖基础价值 +3/层，仍受子球价值折算；原球不受益。' },
  { id: 'twin_reactor', name: '双生反应炉', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 2, tags: ['marble', 'physical'], requires: [{ id: 'infinite_breeding', stacks: 1 }], effect: { type: 'splitBoost', value: 4 }, description: '每批分裂上限 +4，每层将分裂间隔减少 2 次撞针（最低 6 次）；保留子球价值折算。' },
  { id: 'small_batch', name: '精投校准', rarity: 'rare', pool: 'normal', price: 22, maxStacks: 3, tags: ['quantity', 'marble'], effect: { type: 'smallBatchBonus', value: 3 }, description: '每批主动投掷不超过 10 颗时，中奖球额外 +3 币/层；多发则失效，分裂球不改变门槛。' },
  { id: 'outer_gild', name: '边缘镀金', rarity: 'rare', pool: 'normal', price: 24, maxStacks: 3, tags: ['slot', 'value'], effect: { type: 'outerPrizeBonus', value: 3 }, description: '两侧四个大奖/头奖槽各 +3 币/层，台面直接更新；中间小奖不变。' },
  { id: 'inner_alchemy', name: '小奖精炼', rarity: 'common', pool: 'normal', price: 22, maxStacks: 3, tags: ['slot', 'value'], effect: { type: 'innerPrizeBonus', value: 2 }, description: '中间三个小奖槽各 +2 币/层，台面直接更新；两侧大奖不变。' },
  { id: 'drain_memory', name: '逆转蓄能', rarity: 'rare', pool: 'normal', price: 24, maxStacks: 2, tags: ['slot', 'value'], effect: { type: 'drainCharge', value: 3 }, description: '每颗落空球蓄能 +3 币/层，最多蓄 9 币/层，由同批下一颗中奖球兑现；落空本身仍无金币，批末清空。' },
  { id: 'jackpot_echo', name: '头奖回声', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 2, tags: ['slot', 'value'], requires: [{ id: 'outer_gild', stacks: 1 }], effect: { type: 'jackpotEcho', value: 12 }, description: '头奖后为同批下一颗中奖球额外 +12 币/层；最多储存一次，批末清空。' },
  { id: 'high_stakes', name: '孤注一掷', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 2, tags: ['slot', 'value'], requires: [{ id: 'outer_gild', stacks: 1 }], effect: { type: 'riskySlots', value: 30 }, description: '两端头奖各 +30 币/层，但中间三个小奖各 -1 币/层（最低 1 币）。奖金直接显示在台面。' },
  { id: 'reserve_rhythm', name: '循环装填', rarity: 'common', pool: 'normal', price: 16, maxStacks: 3, tags: ['supply', 'quantity'], effect: { type: 'batchReserve', value: 2 }, description: '每次投掷结束为次日储备 +2 颗/层；与回收共用每日 40 颗额外补给上限，仍需匹配发射容量。' },
  { id: 'cash_interest', name: '滚存利息', rarity: 'rare', pool: 'normal', price: 22, maxStacks: 3, tags: ['economy', 'value'], effect: { type: 'cashInterest', value: 3 }, description: '日终每存有 100 币领取 3 币/层利息，最多 30 币/层，每天只结算一次；鼓励留现金。' },
  { id: 'rent_voucher', name: '租约谈判', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 3, minDay: 4, tags: ['economy', 'value'], requires: [{ id: 'cash_interest', stacks: 1 }], effect: { type: 'rentDiscount', value: 200 }, description: '每日应付租金减少 200 币/层，减免最多原租金的 20%；从第 4 天起可出现。' },
  { id: 'low_cash_bonus', name: '应急周转', rarity: 'common', pool: 'normal', price: 18, maxStacks: 2, tags: ['economy', 'supply'], effect: { type: 'lowCashBonus', value: 25 }, description: '成功付租后若现金不足 100 币，额外补助 25 币/层；每天一次，无法挽救付不起租金的局面。' },
  { id: 'endless_polish', name: '魔力淬炼', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: Infinity, fallback: true, tags: ['value'], effect: { type: 'marbleBaseValue', value: 1 }, description: '所有中奖弹珠的基础价值永久 +1，可持续升阶；高级池不足时提供，不占普通卡位。' },
  { id: 'star_pegs', name: '星辉镀针', rarity: 'rare', pool: 'normal', price: 28, maxStacks: 3, tags: ['peg', 'physical'], effect: { type: 'specialPegCount', value: 4 }, description: '把 4 枚普通撞针改为青色星辉针；每次有效碰撞 +1 币，同针间隔 400ms，每球最多领取 20 次特殊针奖励。' },
  { id: 'crystal_pegs', name: '雷晶镀针', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 2, tags: ['peg', 'physical'], effect: { type: 'specialPegCount', value: 4 }, description: '额外改造 4 枚青色特殊撞针，每次有效碰撞给金币；与星辉镀针叠加，不改变撞针位置。' },
  { id: 'special_core', name: '辉光核心', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 2, tags: ['peg', 'value'], requires: [{ id: 'star_pegs', stacks: 1 }], effect: { type: 'specialPegBonus', value: 1 }, description: '每次命中青色特殊撞针额外 +1 币；每球 20 次特殊针领奖上限不变。' },
  { id: 'research_grant', name: '研究补助', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 1, fallback: true, consumable: true, tags: ['value'], effect: { type: 'cashGrant', value: 30 }, description: '立即领取 30 + 当前天数 ×10 币。一次性奖励，不占构筑卡位。' },
  { id: 'reserve_crate', name: '备用弹珠箱', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 1, fallback: true, consumable: true, tags: ['supply'], effect: { type: 'reserveSupply', value: 12 }, description: '仅下一天额外补给 12 颗。一次性奖励，不占构筑卡位。' },
  { id: 'fine_feed', name: '供球微调', rarity: 'advanced', pool: 'advanced', price: 0, maxStacks: 9, fallback: true, tags: ['quantity'], effect: { type: 'singleLaunch', value: 1 }, description: '每次基础发射量永久 +1；高级改造不占普通卡位。' },
  {
    id: 'mass_production',
    name: '批量生产',
    rarity: 'common',
    pool: 'normal',
    price: 10,
    maxStacks: 4,
    tags: ['marble', 'quantity'],
    effect: { type: 'singleLaunch', value: 5 },
    description: '扩大弹珠模具，每次投掷的基础数量 +5。'
  },
  {
    id: 'expand_hopper',
    name: '扩充弹仓',
    rarity: 'common',
    pool: 'normal',
    price: 10,
    maxStacks: 4,
    tags: ['supply', 'quantity'],
    effect: { type: 'dailySupply', value: 10 },
    description: '每日补弹时额外 +10 颗，从下一天生效。'
  },
  {
    id: 'golden_marble',
    name: '镀金弹珠',
    rarity: 'common',
    pool: 'normal',
    price: 22,
    maxStacks: 4,
    tags: ['marble', 'value'],
    effect: { type: 'marbleBaseValue', value: 1 },
    description: '每颗弹珠进入中奖槽时的基础价值 +1；落空槽无奖励。'
  },
  {
    id: 'polished_marble',
    name: '精工抛光',
    rarity: 'rare',
    pool: 'normal',
    price: 28,
    maxStacks: 3,
    tags: ['marble', 'value'],
    effect: { type: 'growth', perHit: 1, cap: 3 },
    description: '每层让有效撞针成长 +1，成长上限每层 +3；只在中奖槽兑现。'
  },
  {
    id: 'brass_pegs',
    name: '标记撞针',
    rarity: 'common',
    pool: 'normal',
    price: 24,
    maxStacks: 4,
    tags: ['peg', 'value'],
    effect: { type: 'pegValueBonus', value: 1 },
    description: '命中琥珀色标记撞针 +1 币；每颗球对同一枚标记钉只领一次。'
  },
  {
    id: 'precision_pegs',
    name: '精密加工',
    rarity: 'rare',
    pool: 'normal',
    price: 26,
    maxStacks: 3,
    tags: ['peg', 'value'],
    effect: { type: 'rarePegBonus', value: 2 },
    description: '命中粉色稀有撞针额外 +2 币；每颗球对同一枚钉只领一次。'
  },
  {
    id: 'chain_impact',
    name: '连锁撞击',
    rarity: 'rare',
    pool: 'normal',
    price: 28,
    maxStacks: 3,
    tags: ['peg', 'value'],
    effect: { type: 'chain', value: 2, windowMs: 1800 },
    description: '1800ms 内连续命中不同奖励钉（琥珀/粉色），第二枚额外 +2 币。'
  },
  {
    id: 'resonance',
    name: '共振回路',
    rarity: 'rare',
    pool: 'normal',
    price: 34,
    maxStacks: 2,
    tags: ['peg', 'value'],
    requires: [{ id: 'chain_impact', stacks: 1 }],
    effect: { type: 'adjacent', value: 2, windowMs: 2500 },
    description: '2500ms 内命中附近的不同奖励钉额外 +2 币，需要先拥有连锁撞击。'
  },
  {
    id: 'gold_slots',
    name: '黄金槽',
    rarity: 'rare',
    pool: 'normal',
    price: 26,
    maxStacks: 4,
    tags: ['slot', 'value'],
    effect: { type: 'slotValue', value: 2 },
    description: '所有非落空槽的基础奖金 +2 币，直接更新台面金额。'
  },
  {
    id: 'slot_expansion',
    name: '槽位扩容',
    rarity: 'rare',
    pool: 'normal',
    price: 10,
    maxStacks: 2,
    tags: ['slot', 'physical'],
    effect: { type: 'slotExpansion', value: 8 },
    description: '左右两端头奖入口各向内扩大 8px，隔板和传感器一起移动。'
  },
  {
    id: 'recycle_bin',
    name: '废珠回收',
    rarity: 'common',
    pool: 'normal',
    price: 10,
    maxStacks: 3,
    tags: ['slot', 'supply'],
    effect: { type: 'outerRecycle', value: 0, supply: 1, cap: 3 },
    description: '落空球为次日返还 1 颗补给，每批每层最多返还 3 颗；不返金币，所有回收每日合计最多 40 颗。'
  },
  {
    id: 'aimed_launch',
    name: '奖区导轨',
    rarity: 'rare',
    pool: 'normal',
    price: 14,
    maxStacks: 1,
    tags: ['slot', 'physical'],
    effect: { type: 'winningExpansion', value: 12 },
    description: '两侧大奖区各向中间扩大 12px，挤占落空槽；两端头奖宽度不变。'
  },
  {
    id: 'auto_line',
    name: '自动化生产线',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 2,
    tags: ['marble', 'quantity'],
    requires: [{ id: 'mass_production', stacks: 1 }],
    effect: { type: 'productionLine', launch: 10, supply: 20 },
    description: '单次发射 +10、每日供给 +20（供给次日生效），需要先拥有批量生产。'
  },
  {
    id: 'nitori_supply',
    name: '荷取的补给箱',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 2,
    tags: ['supply', 'quantity'],
    effect: { type: 'dailySupply', value: 25 },
    description: '每日补弹额外 +25 颗，从下一天生效。'
  },
  {
    id: 'infinite_breeding',
    name: '无限增殖实验',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['marble', 'physical'],
    effect: { type: 'split', every: 10, max: 4, valueFactor: 0.5 },
    description: '弹珠每累计 10 次有效撞针分裂出 1 颗真实弹珠，每批最多 4 颗，分裂球继承 50% 价值。'
  },
  {
    id: 'overload',
    name: '过载钉阵',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['peg', 'value'],
    requires: [{ id: 'brass_pegs', stacks: 1 }],
    effect: { type: 'overload', threshold: 3, value: 6 },
    description: '单颗球命中第 3 枚及之后的不同奖励钉时，额外 +6 币。'
  },
  {
    id: 'supply_overdrive',
    name: '超载弹仓',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['supply', 'quantity'],
    requires: [{ id: 'expand_hopper', stacks: 2 }],
    effect: { type: 'dailySupply', value: 50 },
    description: '每日补弹额外 +50 颗，从下一天生效，需要扩充弹仓 ×2。'
  },
  {
    id: 'jackpot_lens',
    name: '头奖增幅',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['slot', 'value'],
    effect: { type: 'jackpotValue', value: 25 },
    description: '左右两端头奖的基础奖金各 +25 币，直接更新台面金额。'
  },
  {
    id: 'golden_slots_prime',
    name: '黄金槽・镀层',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['slot', 'value'],
    requires: [{ id: 'gold_slots', stacks: 1 }],
    effect: { type: 'slotValue', value: 5 },
    description: '所有非落空槽的基础奖金再 +5 币，直接更新台面金额。'
  },
  {
    id: 'marble_compound',
    name: '价值复利',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['marble', 'value'],
    requires: [{ id: 'polished_marble', stacks: 1 }],
    effect: { type: 'growth', perHit: 1, cap: 4 },
    description: '每次有效撞针让该弹珠价值 +1，单颗上限额外 +4。'
  },
  {
    id: 'slot_streak',
    name: '连胜槽',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['slot', 'value'],
    requires: [{ id: 'gold_slots', stacks: 1 }],
    effect: { type: 'slotStreak', value: 3, cap: 3, anyWin: true },
    description: '连续中奖时，每次结算额外多 +3 币，最多额外 +9 币；落空立即中断。'
  },
  {
    id: 'perpetual_recycle',
    name: '永动回收',
    rarity: 'advanced',
    pool: 'advanced',
    price: 0,
    maxStacks: 1,
    tags: ['slot', 'value', 'supply'],
    requires: [{ id: 'recycle_bin', stacks: 1 }],
    effect: { type: 'outerRecycle', value: 0, supply: 2, cap: 8 },
    description: '落空球为次日返还 2 颗补给，每批最多返还 8 颗；不返金币。需要废珠回收；所有回收每日合计最多 40 颗。'
  }
];

// Geometry/mechanism cards retain a limit; numerical ranks grow linearly.
const REPEATABLE_EFFECTS = new Set(['singleLaunch', 'dailySupply', 'marbleBaseValue', 'growth', 'pegValueBonus', 'rarePegBonus', 'chain', 'adjacent', 'slotValue', 'jackpotValue', 'outerPrizeBonus', 'innerPrizeBonus', 'matureBonus', 'bonusBallBase', 'smallBatchBonus', 'drainCharge', 'jackpotEcho', 'cashInterest', 'lowCashBonus', 'batchReserve', 'specialPegBonus', 'railEnergyValue', 'pegCashout']);
for (const card of UPGRADES) {
  if (!card.consumable && REPEATABLE_EFFECTS.has(card.effect.type)) card.maxStacks = Infinity;
  if (card.id === 'gold_slots') { card.effect.value = 3; card.description = '所有非落空槽的基础奖金 +3 币/层，直接更新台面金额，可持续升阶。'; }
  if (card.id === 'outer_gild') { card.effect.value = 8; card.description = '两侧四个大奖/头奖槽各 +8 币/层，台面直接更新；中间小奖不变，可持续升阶。'; }
  if (card.id === 'inner_alchemy') { card.effect.value = 3; card.description = '中间三个小奖槽各 +3 币/层，台面直接更新；两侧大奖不变，可持续升阶。'; }
  if (card.id === 'jackpot_lens') { card.effect.value = 40; card.description = '左右两端头奖的基础奖金各 +40 币/层，台面直接更新，可持续升阶。'; }
}

const BY_ID = new Map(UPGRADES.map((definition) => [definition.id, definition]));

export function getUpgrade(id) {
  return BY_ID.get(id) || null;
}

export function getUpgradePrice(definition, day, stacks = 0) {
  if (!definition || definition.pool === 'advanced') return 0;
  return Math.round(definition.price * (1 + stacks * 0.65)) + Math.max(0, day - 1) * 4;
}

export function requirementsMet(run, definition) {
  if (!definition.requires) return true;
  return definition.requires.every((requirement) => (
    (run.stacks.get(requirement.id) || 0) >= requirement.stacks
  ));
}

export function normalBuildCount(run) { return [...run.stacks.keys()].filter(id => { const card = getUpgrade(id); return card?.pool === 'normal' && !card.slotless; }).length; }

export function replacementOptions(run, definition) {
  return [...run.stacks.keys()].filter(id => {
    const old = getUpgrade(id);
    if (old?.pool !== 'normal' || old.slotless || id === definition.id) return false;
    const trial = { ...run, stacks: new Map(run.stacks) };
    trial.stacks.delete(id); trial.stacks.set(definition.id, 1);
    return [...trial.stacks.keys()].every(key => {
      const card = getUpgrade(key);
      return requirementsMet(trial, card) && !(card.excludes || []).some(excluded => trial.stacks.has(excluded));
    });
  });
}

export function isUpgradeAvailable(run, definition, { allowReplacement = false } = {}) {
  if (!definition) return false;
  if ((run.stacks.get(definition.id) || 0) >= definition.maxStacks) return false;
  if (definition.effect.type === 'singleLaunch' && run.singleLaunch >= run.config.limits.maxMarbles) return false;
  if (definition.effect.type === 'dailySupply' && run.nextDailySupply >= run.config.limits.maxMarbles * run.config.run.throwsPerDay) return false;
  if (definition.effect.type === 'batchReserve' && (run.modifiers.batchReserve || 0) >= run.config.run.recycleDailyCap) return false;
  if (definition.minDay && run.day < definition.minDay) return false;
  if (run.isFinalDay && ['dailySupply', 'outerRecycle', 'productionLine', 'batchReserve', 'reserveSupply'].includes(definition.effect.type)) return false;
  if (definition.pool === 'normal' && !definition.slotless && !run.stacks.has(definition.id) && normalBuildCount(run) >= run.config.run.buildSlots) {
    return allowReplacement && replacementOptions(run, definition).length > 0;
  }
  if ((definition.excludes || []).some(id => run.stacks.has(id))) return false;
  return requirementsMet(run, definition);
}

function rarityWeight(definition) {
  return RARITY_WEIGHTS[definition.rarity] || 1;
}

function pickWeighted(candidates, rng, run) {
  const family = card => card?.tags.includes('quantity') ? 'quantity' : ['rail', 'peg', 'marble', 'slot', 'economy'].find(tag => card?.tags.includes(tag));
  const weight = card => {
    const tag = family(card);
    const matching = tag ? [...run.stacks.keys()].filter(id => family(getUpgrade(id)) === tag).length : 0;
    return rarityWeight(card) * (1 + Math.min(3, matching) * .25);
  };
  const total = candidates.reduce((sum, item) => sum + weight(item), 0);
  let roll = rng.next() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weight(candidates[index]);
    if (roll <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

export function draftUpgrades(run, pool, count, rng, { excludeIds = [] } = {}) {
  const candidates = UPGRADES.filter((definition) => (
    definition.pool === pool && !definition.fallback && !excludeIds.includes(definition.id) && isUpgradeAvailable(run, definition, { allowReplacement: true })
  ));
  const picked = [];
  if (pool === 'normal' && count > 0) {
    const existing = candidates.filter(card => run.stacks.has(card.id));
    if (existing.length) { const card = pickWeighted(existing, rng, run); picked.push(card); candidates.splice(candidates.indexOf(card), 1); }
  }
  while (picked.length < count && candidates.length > 0) {
    const choice = pickWeighted(candidates, rng, run);
    picked.push(choice);
    candidates.splice(candidates.indexOf(choice), 1);
  }
  if (picked.length < count) {
    for (const card of UPGRADES.filter(card => card.pool === pool && card.fallback && !excludeIds.includes(card.id) && isUpgradeAvailable(run, card))) {
      if (picked.length >= count) break;
      picked.push(card);
    }
  }
  if (pool === 'normal') {
    for (let i = picked.length - 1; i > 0; i--) {
      const j = rng.int(0, i); [picked[i], picked[j]] = [picked[j], picked[i]];
    }
  }
  return picked;
}

export function computeModifiers(stacks) {
  const modifiers = {
    singleLaunchBonus: 0,
    dailySupplyBonus: 0,
    marbleBaseValue: 0,
    pegValueBonus: 0,
    specialPegCount: 0,
    specialPegBonus: 0,
    pegPaidHitCap: 20,
    rarePegBonus: 0,
    chainBonus: 0,
    chainWindowMs: 1800,
    adjacentBonus: 0,
    adjacentWindowMs: 2500,
    growthPerHit: 0,
    growthCap: 0,
    slotMultiplier: 1,
    slotValueBonus: 0,
    jackpotValueBonus: 0,
    jackpotMultiplier: 1,
    winningExpansion: 0,
    slotStreakAnyWin: false,
    slotStreakBonus: 0,
    slotStreakCap: 0,
    outerSlotBonus: 0,
    outerRecycleValue: 0,
    outerRecycleSupply: 0,
    outerRecycleCap: 0,
    slotExpansion: 0,
    spawnRangeScale: 1,
    splitEvery: 0,
    maxSplits: 0,
    splitValueFactor: 0.5,
    overloadThreshold: 0,
    overloadBonus: 0,
    matureBonus: 0, bonusBallBase: 0, smallBatchBonus: 0, outerPrizeBonus: 0,
    innerPrizeBonus: 0, drainCharge: 0, jackpotEcho: 0, riskySlots: 0,
    batchReserve: 0, cashInterest: 0, rentDiscount: 0, lowCashBonus: 0,
    railLength: 0, railElasticity: 0, railEnergyValue: 0, pegCashout: 0
  };

  for (const [id, rawStacks] of stacks.entries()) {
    const definition = getUpgrade(id);
    const count = Math.max(0, Math.floor(Number(rawStacks) || 0));
    if (!definition || count <= 0) continue;
    const effect = definition.effect;
    switch (effect.type) {
      case 'productionLine':
        modifiers.singleLaunchBonus += effect.launch * count;
        modifiers.dailySupplyBonus += effect.supply * count;
        break;
      case 'winningExpansion':
        modifiers.winningExpansion += effect.value * count;
        break;
      case 'jackpotMultiplier':
        modifiers.jackpotMultiplier += effect.value * count;
        break;
      case 'singleLaunch':
        modifiers.singleLaunchBonus += effect.value * count;
        break;
      case 'dailySupply':
        modifiers.dailySupplyBonus += effect.value * count;
        break;
      case 'marbleBaseValue':
        modifiers.marbleBaseValue += effect.value * count;
        break;
      case 'pegValueBonus':
        modifiers.pegValueBonus += effect.value * count;
        break;
      case 'specialPegCount':
        modifiers.specialPegCount += effect.value * count;
        break;
      case 'specialPegBonus':
        modifiers.specialPegBonus += effect.value * count;
        break;
      case 'rarePegBonus':
        modifiers.rarePegBonus += effect.value * count;
        break;
      case 'chain':
        modifiers.chainBonus += effect.value * count;
        modifiers.chainWindowMs = effect.windowMs;
        break;
      case 'adjacent':
        modifiers.adjacentBonus += effect.value * count;
        modifiers.adjacentWindowMs = effect.windowMs;
        break;
      case 'growth':
        modifiers.growthPerHit += effect.perHit * count;
        modifiers.growthCap += effect.cap * count;
        break;
      case 'slotMultiplier':
        modifiers.slotMultiplier += effect.value * count;
        break;
      case 'slotValue':
        modifiers.slotValueBonus += effect.value * count;
        break;
      case 'jackpotValue':
        modifiers.jackpotValueBonus += effect.value * count;
        break;
      case 'outerSlotBonus':
        modifiers.outerSlotBonus += effect.value * count;
        break;
      case 'slotStreak':
        modifiers.slotStreakBonus += effect.value * count;
        modifiers.slotStreakCap = effect.cap;
        modifiers.slotStreakAnyWin = !!effect.anyWin;
        break;
      case 'slotExpansion':
        modifiers.slotExpansion += effect.value * count;
        break;
      case 'spawnRange':
        modifiers.spawnRangeScale = Math.max(0.55, modifiers.spawnRangeScale - effect.value * count);
        break;
      case 'split':
        modifiers.splitEvery = effect.every;
        modifiers.maxSplits = effect.max;
        modifiers.splitValueFactor = effect.valueFactor;
        break;
      case 'overload':
        modifiers.overloadThreshold = effect.threshold;
        modifiers.overloadBonus = effect.value * count;
        break;
      case 'outerRecycle':
        modifiers.outerRecycleValue += effect.value * count;
        modifiers.outerRecycleSupply += effect.supply * count;
        modifiers.outerRecycleCap += effect.cap * count;
        break;
      default:
        if (Object.hasOwn(modifiers, effect.type)) modifiers[effect.type] += effect.value * count;
        break;
    }
  }

  modifiers.synergies = getSynergies(stacks);
  const reactor = stacks.get('twin_reactor') || 0;
  if (reactor && modifiers.splitEvery) { modifiers.maxSplits += reactor * 4; modifiers.splitEvery = Math.max(6, modifiers.splitEvery - reactor * 2); }
  for (const synergy of modifiers.synergies.filter((item) => item.active)) {
    if (synergy.id === 'peg') { modifiers.chainBonus += 1; modifiers.slotMultiplier *= 0.85; }
    if (synergy.id === 'marble') { modifiers.growthCap += 4; modifiers.growthPerHit += 1; }
    if (synergy.id === 'slot') { modifiers.slotValueBonus += 4; modifiers.marbleBaseValue += 2; modifiers.pegValueBonus = Math.max(0, modifiers.pegValueBonus - 1); }
    if (synergy.id === 'quantity') { modifiers.dailySupplyBonus += 20; modifiers.marbleBaseValue = Math.max(0, modifiers.marbleBaseValue - 1); }
    if (synergy.id === 'economy') { modifiers.cashInterest += 2; modifiers.rentDiscount += 50; }
    if (synergy.id === 'rail') modifiers.railEnergyValue += 2;
  }
  modifiers.slotExpansion = clamp(modifiers.slotExpansion, 0, 16);
  modifiers.railLength = clamp(modifiers.railLength, 0, 3);
  modifiers.railElasticity = clamp(modifiers.railElasticity, 0, 3);
  return modifiers;
}

export function applyUpgrade(run, definition, { replaceId = null } = {}) {
  if (!definition) return { ok: false, reason: 'missing' };
  const current = run.stacks.get(definition.id) || 0;
  if (current >= definition.maxStacks) return { ok: false, reason: 'maxed' };
  const needsReplacement = definition.pool === 'normal' && !definition.slotless && !current && normalBuildCount(run) >= run.config.run.buildSlots;
  if (needsReplacement && !replaceId) return { ok: false, reason: 'replacement' };
  if (needsReplacement && !replacementOptions(run, definition).includes(replaceId)) return { ok: false, reason: 'dependency' };
  if (!needsReplacement && !requirementsMet(run, definition)) return { ok: false, reason: 'locked' };
  if (!isUpgradeAvailable(run, definition, { allowReplacement: needsReplacement })) return { ok: false, reason: 'capacity' };
  const price = getUpgradePrice(definition, run.day, current);
  if (price > 0 && run.wallet.balance < price) return { ok: false, reason: 'funds', price };
  if (needsReplacement) run.stacks.delete(replaceId);
  if (price > 0) {
    run.wallet.charge(price, `upgrade-${definition.id}-${run.day}`, 'upgrade');
  }
  if (definition.effect.type === 'cashGrant') run.wallet.credit(definition.effect.value + run.day * 10, null, 'research-grant');
  if (definition.effect.type === 'reserveSupply') run.nextDayBonus += definition.effect.value;
  if (!definition.consumable) run.stacks.set(definition.id, current + 1);
  run.modifiers = computeModifiers(run.stacks);
  // Any new card may activate a synergy that changes the printed prizes.
  run.boardDirty = true;
  return { ok: true, price, stacks: current + 1 };
}

export function upgradeTags(definition) {
  return definition.tags.map((tag) => TAG_LABELS[tag] || tag);
}

export function rarityLabel(definition) {
  return RARITY_LABELS[definition.rarity] || definition.rarity;
}

export function effectSummary(definition, stacks = 0) {
  const effect = definition.effect;
  const next = stacks + 1;
  switch (effect.type) {
    case 'railLength': return `侧壁挡板向上延长 ${8 * next}px（最多 24px）`;
    case 'railElasticity': return `强弹阶段 ${next}/3，每球最多强弹 6 次，前 15 秒有效`;
    case 'railEnergyValue': return `每次挡板碰撞蓄 +${effect.value * next}，最多蓄 ${effect.value * next * 6} 币，中奖兑现`;
    case 'pegCashout': return `中奖时每已赚 5 币撞针收入再额外 +${effect.value * next} 币`;
    case 'matureBonus': return `有效撞针 12 次后中奖额外 +${effect.value * next} 币`;
    case 'bonusBallBase': return `分裂子球基础价值 +${effect.value * next}（折算前）`;
    case 'splitBoost': return `分裂上限额外 +${effect.value * next}，间隔减少 ${2 * next} 次（最低 6）`;
    case 'smallBatchBonus': return `主动投掷 ≤10 颗时，每次中奖额外 +${effect.value * next} 币`;
    case 'outerPrizeBonus': return `两侧四个大奖槽各 +${effect.value * next} 币`;
    case 'innerPrizeBonus': return `中间三个小奖槽各 +${effect.value * next} 币`;
    case 'drainCharge': return `落空蓄能 +${effect.value * next}，最多 ${effect.value * next * 3} 币，下一中奖兑现`;
    case 'jackpotEcho': return `头奖后同批下一次中奖额外 +${effect.value * next} 币`;
    case 'riskySlots': return `两端头奖各 +${effect.value * next}，中央各 -${next}（最低 1）`;
    case 'batchReserve': return `每次投掷为次日储备 +${effect.value * next} 颗，每日额外补给上限 40`;
    case 'cashInterest': return `每存 100 币日终 +${effect.value * next} 币，上限 ${effect.value * next * 10} 币/日`;
    case 'rentDiscount': return `每日租金减 ${effect.value * next} 币，最多减免原租金 20%`;
    case 'lowCashBonus': return `成功付租后现金 <100，额外领取 ${effect.value * next} 币`;
    case 'specialPegCount': return `新增 ${effect.value} 枚青色特殊撞针；累计改造 ${effect.value * next} 枚`;
    case 'specialPegBonus': return `特殊撞针每次额外 +${effect.value * next} 币`;
    case 'cashGrant': return '即刻领钱，不占卡位';
    case 'reserveSupply': return `下一天补给 +${effect.value} 颗，不占卡位`;
    case 'productionLine':
      return `单次 +${effect.launch * next}，次日供给 +${effect.supply * next}`;
    case 'winningExpansion':
      return `两侧大奖区各向中间扩 ${effect.value * next}px；头奖宽度不变`;
    case 'jackpotMultiplier':
      return `仅头奖槽收益 +${Math.round(effect.value * next * 100)}%`;
    case 'slotValue':
      return `非落空槽各 +${effect.value * next} 币，金额直接显示在台面`;
    case 'jackpotValue':
      return `两端头奖各 +${effect.value * next} 币，金额直接显示在台面`;
    case 'singleLaunch':
      return `每次基础发射 +${effect.value}（叠加后 +${effect.value * next}）`;
    case 'dailySupply':
      return `每日供给 +${effect.value}/日（叠加后 +${effect.value * next}）`;
    case 'marbleBaseValue':
      return `中奖槽基础价值 +${effect.value}（叠加后 +${effect.value * next}）`;
    case 'growth':
      return `每次有效撞针成长 +${effect.perHit * next}，单颗成长上限 +${effect.cap * next}`;
    case 'pegValueBonus':
      return `每颗球首次命中琥珀标记钉 +${effect.value} 币（叠加后 +${effect.value * next}）`;
    case 'rarePegBonus':
      return `每颗球首次命中粉色奖励钉 +${effect.value} 币（叠加后 +${effect.value * next}）`;
    case 'chain':
      return `1800ms 内命中不同奖励钉 +${effect.value} 币（叠加后 +${effect.value * next}）`;
    case 'adjacent':
      return `2500ms 内命中附近不同奖励钉 +${effect.value} 币（叠加后 +${effect.value * next}）`;
    case 'slotMultiplier':
      return `槽位收益 +${Math.round(effect.value * 100)}%（叠加后 +${Math.round(effect.value * next * 100)}%）`;
    case 'outerSlotBonus':
      return `边缘槽额外 +${effect.value} 币（叠加后 +${effect.value * next}）`;
    case 'slotStreak':
      return `连续中奖每次多 +${effect.value} 币，最多额外 +${effect.value * effect.cap} 币`;
    case 'slotExpansion':
      return `两端头奖入口各 +${effect.value}px（叠加后各 +${effect.value * next}px）`;
    case 'spawnRange':
      return `顶部发射轨道收窄 ${Math.round(effect.value * next * 100)}%`;
    case 'split':
      return `每 ${effect.every} 次有效撞针分裂 1 颗（每批最多 ${effect.max} 颗，继承 ${Math.round(effect.valueFactor * 100)}% 价值）`;
    case 'overload':
      return `第 ${effect.threshold} 枚及之后的不同奖励钉，每枚 +${effect.value} 币`;
    case 'outerRecycle':
      return `落空返还次日补给 +${effect.supply} 颗，每批最多 ${effect.cap * next} 颗，每日总上限 40，不返金币`;
    default:
      return definition.description;
  }
}

export function requirementSummary(definition) {
  if (!definition.requires || !definition.requires.length) return '';
  return definition.requires.map((requirement) => {
    const target = getUpgrade(requirement.id);
    return `需要 ${target ? target.name : requirement.id} ×${requirement.stacks}`;
  }).join('，');
}

export function getSynergies(stacks) {
  const families = [
    { id: 'peg', name: '雷鸣连锁', description: '不同奖励钉连锁 +1；落槽倍率 ×0.85', threshold: 3 },
    { id: 'marble', name: '炼金养成', description: '每次撞针成长 +1，成长上限 +4', threshold: 3 },
    { id: 'slot', name: '黄金赌局', description: '中奖槽奖金 +4、弹珠基础价值 +2；标记钉加值 -1', threshold: 3 },
    { id: 'quantity', name: '弹幕工坊', description: '次日供给 +20；弹珠基础加值 -1', threshold: 3 },
    { id: 'economy', name: '周转经营', description: '每存100币日终利息+2（最多+20）；租金再减50，减免总计不超过20%', threshold: 3 },
    { id: 'rail', name: '弹性回路', description: '每次挡板碰撞额外蓄2币动能，中奖兑现；每球最多蓄6次', threshold: 3 }
  ];
  return families.map((family) => {
    const count = [...stacks].filter(([id, rank]) => {
      const card = getUpgrade(id);
      if (!card || rank <= 0) return false;
      if (family.id === 'quantity') return card.tags.includes('quantity');
      return card.tags.includes(family.id) && !card.tags.includes('quantity');
    }).length;
    return { ...family, count, active: count >= family.threshold };
  });
}


export function upgradeContext(run, definition) {
  const type = definition.effect.type;
  if (definition.tags.includes('rail')) {
    const rank = run.getUpgradeStacks(definition.id) + 1;
    if (type === 'railLength' || type === 'railElasticity') return '真实改变碰撞轨迹，不保证每批收入增加；搭配弹性包覆与动能兑现使用。';
  }
  if (['slotValue', 'jackpotValue', 'outerPrizeBonus', 'innerPrizeBonus', 'riskySlots'].includes(type)) {
    const stacks = new Map(run.stacks);
    stacks.set(definition.id, (stacks.get(definition.id) || 0) + 1);
    const next = computeModifiers(stacks);
    const prize = (id, mods) => Math.max(1, run.config.board.slotValues[id] + mods.slotValueBonus
      + (run.config.board.slotValues[id] >= 8 ? mods.outerPrizeBonus : mods.innerPrizeBonus - mods.riskySlots / 30)
      + (run.config.board.jackpotSlotIds.includes(id) ? mods.jackpotValueBonus + mods.riskySlots : 0));
    const center = Math.floor(run.config.board.slotCount / 2);
    return `台面奖金：中央 ${prize(center, run.modifiers)} → ${prize(center, next)} 币；两端 ${prize(0, run.modifiers)} → ${prize(0, next)} 币。`;
  }
  if (!['singleLaunch', 'dailySupply', 'productionLine', 'outerRecycle'].includes(type)) return '';
  const cap = run.singleLaunch * run.config.run.throwsPerDay;
  const supply = run.nextDailySupply;
  if (type === 'outerRecycle') return `回收次日生效；当前发射容量 ${cap} 颗/日，最多还能用 ${Math.max(0, cap - supply)} 颗额外补给。`;
  const stacks = new Map(run.stacks);
  stacks.set(definition.id, (stacks.get(definition.id) || 0) + 1);
  const next = computeModifiers(stacks);
  const nextCap = Math.min(run.config.limits.maxMarbles, run.singleLaunchBase + next.singleLaunchBonus) * run.config.run.throwsPerDay;
  const nextSupply = run.dailySupplyBase + next.dailySupplyBonus + run.nextDayBonus;
  const delta = Math.max(0, Math.min(nextCap, nextSupply) - Math.min(cap, supply));
  return delta > 0
    ? `按当前配套，次日每天最多多发 ${delta} 颗。`
    : type === 'singleLaunch' ? '当前每日供给不足，暂不增加日总投掷量；需配套弹仓或回收。'
      : '当前单次发射量不足，新增供给暂用不完；需配套批量生产。';
}
