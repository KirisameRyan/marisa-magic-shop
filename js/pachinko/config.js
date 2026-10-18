export const CONFIG = {
  canvas: {
    width: 600,
    height: 820,
    maxDpr: 2
  },
  physics: {
    fixedDt: 1000 / 60,
    maxSubSteps: 3,
    gravityY: 0.86,
    positionIterations: 6,
    velocityIterations: 4,
    enableSleeping: false,
    marble: {
      radius: 7.0,
      density: 0.0013,
      restitution: 0.48,
      friction: 0.028,
      frictionStatic: 0.30,
      frictionAir: 0.0016,
      slop: 0.02,
      angularVelocity: 0.25
    },
    peg: {
      radius: 7.5,
      restitution: 0.72,
      friction: 0.002,
      frictionStatic: 0.01
    },
    wall: {
      restitution: 0.35,
      friction: 0.01
    },
    divider: {
      restitution: 0.35,
      friction: 0.01
    },
    floor: {
      restitution: 0.18,
      friction: 0.15
    },
    pegCooldownMs: 200,
    maxBatchMs: 90000,
    stallCheckMs: 600,
    stallTriggerMs: 900,
    stallSpeed: 0.18,

    nudgeX: 2.2,
    nudgeY: 2.2,
    maxNudges: 30,
    maxFieldSpeed: 10,
    sensorHeight: 42
  },
  board: {
    centerX: 300,
    playLeft: 104,
    playRight: 496,
    playTop: 112,
    playBottom: 700,
    shoulderY: 250,
    topOpeningLeft: 220,
    topOpeningRight: 380,
    pegRowCounts: [7, 8, 9, 10, 11, 10, 11, 10, 9, 7],
    pegStartY: 206,
    pegRowGap: 38,
    pegGapX: 32,
    pegRareKeys: ['2:1', '2:7', '4:2', '4:8', '6:5'],
    pegMarkedKeys: ['1:1', '1:6', '3:2', '3:7', '5:1', '5:8', '7:2', '7:7'],
    topSplitter: { x: 300, y: 166, radius: 9 },
    topGuidePaths: {
      left: [[286, 126], [258, 158], [230, 186]],
      right: [[314, 126], [342, 158], [370, 186]]
    },
    bumperPositions: [
      { x: 154, y: 238, radius: 11 },
      { x: 446, y: 238, radius: 11 }
    ],
    guidePinY: 574,
    slotCount: 9,
    slotTop: 604,
    slotBoundaries: [104, 138, 182, 226, 274, 326, 374, 418, 462, 496],
    slotValues: [25, 8, 0, 2, 1, 2, 0, 8, 25],
    slotNames: ['头奖', '大奖', '落空', '小奖', '小奖', '小奖', '落空', '大奖', '头奖'],
    jackpotSlotIds: [0, 8],
    dividerWidth: 5,
    dividerCapRadius: 3,
    outerFrame: { x: 8, y: 8, width: 584, height: 804, radius: 26 },
    innerFrame: { x: 94, y: 94, width: 412, height: 618, radius: 18 },
    marquee: { x: 178, y: 16, width: 244, height: 62, radius: 16 },
    marqueeLed: { x: 226, y: 42, width: 148, height: 26 },
    sideCabinetLeft: { x: 18, y: 100, width: 74, height: 670 },
    sideCabinetRight: { x: 508, y: 100, width: 74, height: 670 },
    bottomTray: { x: 94, y: 706, width: 412, height: 86, radius: 16 }
  },
  launch: {
    entryX: 300,
    entryY: 124,
    entryJitterX: 2.2,
    throatHalfWidth: 16,
    feedIntervalSteps: 6,
    benchmarkFeedIntervalSteps: 2,
    activeCap: 24,
    benchmarkActiveCap: 220
  },
  economy: {
    trialCoins: 10000,
    marbleCost: 1,
    pegNormalValue: 0,
    pegRareValue: 3
  },
  run: {
    days: 10,
    throwsPerDay: 5,
    startCash: 50,
    singleLaunchBase: 10,
    dailySupplyBase: 50,
    rents: [150, 300, 550, 1000, 1800, 3000, 4800, 7200, 10500, 15000],
    endlessGrowth: 1.65,
    endlessGrowthStep: 0.2,
    buildSlots: 8,
    recycleDailyCap: 40,
    normalCards: 3,
    refreshesPerDay: 2,
    advancedCards: 3
  },
  limits: {
    maxMarbles: 100,
    benchmarkMarbles: 200,
    maxActiveBodies: 240,
    maxHistory: 12
  },
  benchmark: {
    sizes: [20, 50, 100, 150, 200],
    seedBase: 20261017,
    gapMs: 350
  },
  seed: 20261017,
  ui: {
    hudIntervalMs: 150,
    maxFloating: 24
  }
};
