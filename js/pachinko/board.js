import Matter from './matter.js';
import { clamp } from './utils.js';

const { Bodies } = Matter;

export function resolveSlotValues(config, modifiers = {}) {
  return config.board.slotValues.map((value, index) => value <= 0 ? 0 : Math.max(1, value
    + (modifiers.slotValueBonus || 0)
    + (value >= 8 ? (modifiers.outerPrizeBonus || 0) : (modifiers.innerPrizeBonus || 0) - (modifiers.riskySlots || 0) / 30)
    + ((config.board.jackpotSlotIds || []).includes(index) ? (modifiers.jackpotValueBonus || 0) + (modifiers.riskySlots || 0) : 0)));
}

function assignPlugin(body, data) {
  body.plugin.pachinko = data;
  return body;
}

function makeSegment(x1, y1, x2, y2, thickness, options, plugin) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const body = Bodies.rectangle(
    (x1 + x2) / 2,
    (y1 + y2) / 2,
    length,
    thickness,
    { ...options, angle: Math.atan2(dy, dx) }
  );
  assignPlugin(body, plugin);
  return body;
}

export function createBoard(config, boardModifiers = {}) {
  const boardConfig = config.board;
  const launch = config.launch;
  const physics = config.physics;
  const width = config.canvas.width;
  const height = config.canvas.height;
  const {
    centerX,
    playLeft,
    playRight,
    playTop,
    playBottom,
    shoulderY,
    topOpeningLeft,
    topOpeningRight,
    pegRowCounts,
    pegStartY,
    pegRowGap,
    pegGapX,
    pegRareKeys,
    topSplitter,
    topGuidePaths,
    bumperPositions,
    guidePinY,
    slotCount,
    slotTop,
    slotValues,
    slotNames,
    dividerWidth,
    dividerCapRadius
  } = boardConfig;

  const staticBodies = [];
  const pegs = [];
  const slots = [];
  const dividers = [];
  const walls = [];
  const bumpers = [];
  const guides = [];
  const deflectors = [];
  const addBody = (body) => {
    staticBodies.push(body);
    return body;
  };

  const wallOptions = {
    isStatic: true,
    restitution: physics.wall.restitution,
    friction: physics.wall.friction,
    label: 'wall'
  };
  const guideOptions = {
    isStatic: true,
    restitution: 0.2,
    friction: 0.015,
    label: 'guide'
  };
  const bumperOptions = {
    isStatic: true,
    restitution: 0.92,
    friction: 0.004,
    label: 'bumper'
  };

  const leftShoulder = addBody(makeSegment(
    topOpeningLeft,
    playTop,
    playLeft,
    shoulderY,
    10,
    wallOptions,
    { type: 'wall', kind: 'shoulder-left' }
  ));
  walls.push(leftShoulder);
  const rightShoulder = addBody(makeSegment(
    topOpeningRight,
    playTop,
    playRight,
    shoulderY,
    10,
    wallOptions,
    { type: 'wall', kind: 'shoulder-right' }
  ));
  walls.push(rightShoulder);

  const leftCeiling = addBody(Bodies.rectangle(
    (playLeft + topOpeningLeft) / 2,
    playTop,
    topOpeningLeft - playLeft,
    10,
    wallOptions
  ));
  assignPlugin(leftCeiling, { type: 'wall', kind: 'ceiling-left' });
  walls.push(leftCeiling);
  const rightCeiling = addBody(Bodies.rectangle(
    (topOpeningRight + playRight) / 2,
    playTop,
    playRight - topOpeningRight,
    10,
    wallOptions
  ));
  assignPlugin(rightCeiling, { type: 'wall', kind: 'ceiling-right' });
  walls.push(rightCeiling);

  const leftSide = addBody(Bodies.rectangle(
    playLeft,
    (shoulderY + playBottom) / 2,
    10,
    playBottom - shoulderY,
    wallOptions
  ));
  assignPlugin(leftSide, { type: 'wall', kind: 'side-left' });
  walls.push(leftSide);
  const rightSide = addBody(Bodies.rectangle(
    playRight,
    (shoulderY + playBottom) / 2,
    10,
    playBottom - shoulderY,
    wallOptions
  ));
  assignPlugin(rightSide, { type: 'wall', kind: 'side-right' });
  walls.push(rightSide);

  const floor = addBody(Bodies.rectangle(
    width / 2,
    playBottom + 6,
    width,
    12,
    {
      isStatic: true,
      restitution: physics.floor.restitution,
      friction: physics.floor.friction,
      label: 'floor'
    }
  ));
  assignPlugin(floor, { type: 'wall', kind: 'floor' });
  walls.push(floor);

  const throatLeft = centerX - launch.throatHalfWidth;
  const throatRight = centerX + launch.throatHalfWidth;
  const throatTop = 80;
  const throatBottom = launch.entryY + 8;
  for (const x of [throatLeft, throatRight]) {
    const wall = addBody(Bodies.rectangle(
      x,
      (throatTop + throatBottom) / 2,
      5,
      throatBottom - throatTop,
      guideOptions
    ));
    assignPlugin(wall, { type: 'wall', kind: 'feed-throat' });
    walls.push(wall);
  }

  const splitterBody = addBody(Bodies.circle(
    topSplitter.x,
    topSplitter.y,
    topSplitter.radius,
    {
      isStatic: true,
      restitution: 0.82,
      friction: 0.006,
      label: 'feed-splitter'
    }
  ));
  assignPlugin(splitterBody, { type: 'splitter', ...topSplitter });
  const splitter = { ...topSplitter, body: splitterBody };

  for (const side of ['left', 'right']) {
    const path = topGuidePaths[side];
    for (let index = 0; index < path.length - 1; index += 1) {
      const [x1, y1] = path[index];
      const [x2, y2] = path[index + 1];
      const body = addBody(makeSegment(
        x1,
        y1,
        x2,
        y2,
        5,
        guideOptions,
        { type: 'wall', kind: 'guide' }
      ));
      walls.push(body);
      guides.push({ side, index, x1, y1, x2, y2, body });
    }
  }

  // Extend upward along the wall. Tips remain clear of the pin field.
  const extension = clamp(boardModifiers.railLength || 0, 0, 3) * 8;
  const railPaths = [[106, 378 - extension, 117, 415], [106, 493 - extension, 122, 545]];
  for (const side of ['left', 'right']) for (let index = 0; index < railPaths.length; index++) {
    const [ax, y1, bx, y2] = railPaths[index];
    const x1 = side === 'left' ? ax : width - ax, x2 = side === 'left' ? bx : width - bx;
    const restitution = boardModifiers.railElasticity > 0 ? .55 + clamp(boardModifiers.railElasticity, 0, 3) * .1 : guideOptions.restitution;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const normalSign = x2 >= x1 ? 1 : -1;
    const body = addBody(makeSegment(x1, y1, x2, y2, 12, { ...guideOptions, restitution }, { type: 'wall', kind: 'side-return', side, thickness: 12, railId: `${side}-${index}`,
      elasticity: boardModifiers.railElasticity || 0, normalX: normalSign * (y2 - y1) / length }));
    // Matter resets restitution when making a body static; restore this rail's surface.
    body.restitution = restitution;
    walls.push(body);
    guides.push({ x1, y1, x2, y2, body });
  }

  const rareSet = new Set(pegRareKeys);
  const markedSet = new Set(config.board.pegMarkedKeys || []);
  const specialKeys = ['2:2','2:6','4:3','4:7','6:3','6:7','3:3','3:6','5:3','5:6','7:3','7:6','8:2','8:6','1:2','1:5','9:1','9:5','0:1','0:5'];
  const specialSet = new Set(specialKeys.slice(0, boardModifiers.specialPegCount || 0));
  let pegId = 0;
  for (let row = 0; row < pegRowCounts.length; row += 1) {
    const count = pegRowCounts[row];
    const rowWidth = (count - 1) * pegGapX;
    const startX = centerX - rowWidth / 2;
    const y = pegStartY + row * pegRowGap;
    for (let col = 0; col < count; col += 1) {
      const x = startX + col * pegGapX;
      const rare = rareSet.has(`${row}:${col}`);
      const special = specialSet.has(`${row}:${col}`);
      const value = special ? 1 : rare ? config.economy.pegRareValue : config.economy.pegNormalValue;
      const body = addBody(Bodies.circle(x, y, physics.peg.radius, {
        isStatic: true,
        restitution: physics.peg.restitution,
        friction: physics.peg.friction,
        frictionStatic: physics.peg.frictionStatic,
        label: rare ? 'rare-peg' : 'peg'
      }));
      const data = {
        type: 'peg',
        kind: 'peg',
        index: pegId,
        id: pegId,
        row,
        col,
        x,
        y,
        rare,
        special,
        marked: markedSet.has(`${row}:${col}`),
        value
      };
      assignPlugin(body, data);
      pegs.push({ ...data, radius: physics.peg.radius, body });
      pegId += 1;
    }
  }

  const baseSlotWidth = (playRight - playLeft) / slotCount;
  const baseBoundaries = [];
  for (let index = 0; index <= slotCount; index += 1) {
    baseBoundaries.push(config.board.slotBoundaries?.[index] ?? (playLeft + index * baseSlotWidth));
  }

  const boundaries = baseBoundaries.slice();
  const slotExpansion = clamp(boardModifiers.slotExpansion ?? 0, 0, 16);
  const winningExpansion = clamp(boardModifiers.winningExpansion ?? 0, 0, 16);
  // Widen both edge jackpots inward. The separate guide expands the adjacent
  // major prizes into the drain lanes, keeping the jackpot entrances unchanged.
  boundaries[1] += slotExpansion;
  boundaries[slotCount - 1] -= slotExpansion;
  boundaries[2] += winningExpansion;
  boundaries[slotCount - 2] -= winningExpansion;

  for (let index = 1; index < slotCount; index += 1) {
    const x = baseBoundaries[index];
    const radius = 4.5;
    const body = addBody(Bodies.circle(x, guidePinY, radius, {
      isStatic: true,
      restitution: 0.55,
      friction: 0.01,
      label: 'slot-guide-peg'
    }));
    const data = {
      type: 'peg',
      kind: 'guide',
      index: pegId,
      id: pegId,
      row: pegRowCounts.length,
      col: index - 1,
      x,
      y: guidePinY,
      rare: false,
      value: 0
    };
    assignPlugin(body, data);
    pegs.push({ ...data, radius, body });
    pegId += 1;
  }

  for (let index = 0; index < bumperPositions.length; index += 1) {
    const item = bumperPositions[index];
    const body = addBody(Bodies.circle(item.x, item.y, item.radius, bumperOptions));
    const data = {
      type: 'bumper',
      index,
      id: index,
      x: item.x,
      y: item.y,
      radius: item.radius
    };
    assignPlugin(body, data);
    bumpers.push({ ...data, body });
  }

  const sensorBottom = playBottom - 2;
  const sensorTop = sensorBottom - physics.sensorHeight;
  const sensorY = (sensorTop + sensorBottom) / 2;
  const effectiveSlotValues = resolveSlotValues(config, boardModifiers);

  for (let index = 0; index < slotCount; index += 1) {
    const left = boundaries[index];
    const right = boundaries[index + 1];
    const slotWidth = right - left;
    const x = left + slotWidth / 2;
    const value = effectiveSlotValues[index] ?? 0;
    const name = slotNames[index] ?? `槽位 ${index + 1}`;
    const sensor = addBody(Bodies.rectangle(
      x,
      sensorY,
      Math.max(16, slotWidth - 10),
      physics.sensorHeight,
      {
        isStatic: true,
        isSensor: true,
        label: 'slot-sensor'
      }
    ));
    assignPlugin(sensor, { type: 'slot', slotId: index, value, name });
    slots.push({
      index,
      id: index,
      left,
      right,
      x,
      width: slotWidth,
      value,
      name,
      baseValue: slotValues[index] ?? 0,
      jackpot: (boardConfig.jackpotSlotIds || []).includes(index),
      sensorTop,
      sensorBottom,
      floorY: playBottom,
      sensorBody: sensor
    });
  }

  for (let index = 1; index < slotCount; index += 1) {
    const x = boundaries[index];
    const height = playBottom - slotTop + 20;
    const centerY = slotTop + height / 2;
    const body = addBody(Bodies.rectangle(x, centerY, dividerWidth, height, {
      isStatic: true,
      restitution: physics.divider.restitution,
      friction: physics.divider.friction,
      label: 'slot-divider'
    }));
    assignPlugin(body, { type: 'wall', kind: 'divider' });
    const cap = addBody(Bodies.circle(x, slotTop, dividerCapRadius, {
      isStatic: true,
      restitution: physics.divider.restitution,
      friction: physics.divider.friction,
      label: 'slot-divider-cap'
    }));
    assignPlugin(cap, { type: 'wall', kind: 'divider-cap' });
    dividers.push({ x, top: slotTop, bottom: playBottom, width: dividerWidth, capRadius: dividerCapRadius });
  }

  const playfieldPolygon = [
    { x: topOpeningLeft, y: playTop },
    { x: playLeft, y: shoulderY },
    { x: playLeft, y: playBottom },
    { x: playRight, y: playBottom },
    { x: playRight, y: shoulderY },
    { x: topOpeningRight, y: playTop }
  ];

  const layout = {
    width,
    height,
    centerX,
    playLeft,
    playRight,
    playTop,
    playBottom,
    shoulderY,
    topOpeningLeft,
    topOpeningRight,
    playfieldPolygon,
    slotTop,
    slotWidth: baseSlotWidth,
    slotCount,
    boundaries,
    pegs,
    slots,
    dividers,
    walls,
    bumpers,
    guides,
    deflectors,
    splitter,
    outerFrame: boardConfig.outerFrame,
    innerFrame: boardConfig.innerFrame,
    marquee: boardConfig.marquee,
    marqueeLed: boardConfig.marqueeLed,
    sideCabinetLeft: boardConfig.sideCabinetLeft,
    sideCabinetRight: boardConfig.sideCabinetRight,
    bottomTray: boardConfig.bottomTray,
    slotBank: {
      x: playLeft,
      y: slotTop,
      width: playRight - playLeft,
      height: playBottom - slotTop
    },
    feed: {
      entryX: launch.entryX,
      entryY: launch.entryY,
      throatHalfWidth: launch.throatHalfWidth,
      throatTop,
      throatBottom
    }
  };

  const getSlotIndexAtX = (x) => {
    if (x < playLeft || x > playRight) return -1;
    for (let index = 0; index < slotCount; index += 1) {
      if (x >= boundaries[index] && x < boundaries[index + 1]) return index;
    }
    return slotCount - 1;
  };

  return {
    layout,
    staticBodies,
    pegs,
    slots,
    dividers,
    walls,
    bumpers,
    guides,
    deflectors,
    splitter,
    getSlotIndexAtX,
    staticBodyCount: staticBodies.length
  };
}
