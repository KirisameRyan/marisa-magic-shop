import Matter from './matter.js';
import { createBoard, resolveSlotValues } from './board.js';
import { clamp, makeRng } from './utils.js';
import {
  createBatch,
  createMarbleRecord,
  registerPegHit,
  registerBallCollision,
  registerWallContact,
  registerSlotContact,
  settleMarbleRecord,
  markLost,
  recycleMarbleRecord,
  chargeBatch,
  finalizeBatch
} from './ledger.js';

const { Body, Bodies, Composite, Engine, Events } = Matter;

export class Simulation {
  constructor({ config, wallet = null, boardModifiers = {} }) {
    this.config = config;
    this.wallet = wallet;
    this.boardModifiers = boardModifiers;
    this.board = createBoard(config, boardModifiers);
    this.engine = Engine.create({
      enableSleeping: config.physics.enableSleeping,
      positionIterations: config.physics.positionIterations,
      velocityIterations: config.physics.velocityIterations
    });
    this.engine.gravity.y = config.physics.gravityY;
    Composite.add(this.engine.world, this.board.staticBodies);
    this.listeners = new Map();
    this.activeBatch = null;
    this.lastReport = null;
    this.launchQueue = 0;
    this.nextFeedAt = 0;
    this.feedIntervalSteps = config.launch.feedIntervalSteps;
    this.activeCap = config.launch.activeCap;
    this.batchCounter = 0;
    this.simTime = 0;
    this.rng = makeRng(config.seed);
    this.pendingSplits = [];
    Events.on(this.engine, 'collisionStart', (event) => this.handleCollisionStart(event));
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) handlers.delete(handler);
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => handler(payload));
  }

  startBatch(count, options = {}) {
    if (this.activeBatch) return { ok: false, reason: 'busy' };
    const request = Number(count);
    if (!Number.isInteger(request) || request < 1) {
      return { ok: false, reason: 'invalid' };
    }
    const limit = options.benchmark
      ? this.config.limits.benchmarkMarbles
      : this.config.limits.maxMarbles;
    if (request > limit) return { ok: false, reason: 'limit' };

    const applyEconomy = options.applyEconomy !== false && this.wallet !== null;
    const id = this.batchCounter + 1;
    const seed = options.seed === undefined
      ? ((Date.now() ^ (id * 2654435761)) >>> 0)
      : (options.seed >>> 0);
    const batch = createBatch({
      id,
      count: request,
      costPerMarble: this.config.economy.marbleCost,
      seed,
      applyEconomy,
      benchmark: options.benchmark === true,
      modifiers: options.modifiers || {},
      slotValues: resolveSlotValues(this.config, options.modifiers || this.boardModifiers),
      jackpotSlotIds: this.board.slots.filter((slot) => slot.jackpot).map((slot) => slot.id),
      walletStart: this.wallet ? this.wallet.balance : null
    });
    batch.startedAt = this.simTime;

    if (applyEconomy && !chargeBatch(batch, this.wallet)) {
      return { ok: false, reason: 'funds', batch };
    }

    this.batchCounter = id;
    this.activeBatch = batch;
    this.launchQueue = request;
    this.nextFeedAt = this.simTime;
    this.feedIntervalSteps = options.benchmark
      ? this.config.launch.benchmarkFeedIntervalSteps
      : this.config.launch.feedIntervalSteps;
    this.activeCap = options.benchmark
      ? this.config.launch.benchmarkActiveCap
      : this.config.launch.activeCap;
    batch.queued = request;
    batch.activeCap = this.activeCap;
    this.rng = makeRng(seed);
    this.pendingSplits = [];
    this.emit('batchStart', batch);
    return { ok: true, batch };
  }

  step() {
    if (!this.activeBatch) return null;
    this.simTime += this.config.physics.fixedDt;
    this.processLaunches();
    this.containFieldBalls();
    Engine.update(this.engine, this.config.physics.fixedDt);
    this.processRailImpulses();
    this.clampFieldSpeed();
    this.containFieldBalls();
    this.processSplits();
    this.checkPositions();
    this.processPendingSettles();
    this.checkStalls();
    this.checkTimeout();
    this.checkCompletion();
    if (this.activeBatch) {
      this.activeBatch.peakFieldActive = Math.max(this.activeBatch.peakFieldActive, this.activeBatch.fieldActive);
    }
    return this.lastReport;
  }

  processLaunches() {
    const batch = this.activeBatch;
    if (!batch || this.launchQueue <= 0) return;
    if (this.simTime < this.nextFeedAt) return;
    if (batch.fieldActive >= this.activeCap) return;

    const feed = this.board.layout.feed;
    const spread = this.config.launch.entryJitterX * (this.boardModifiers.spawnRangeScale ?? 1);
    const x = feed.entryX + this.rng.range(-spread, spread);
    const y = feed.entryY + this.rng.range(-1, 1);
    const record = this.spawnMarble(x, y, {});
    this.launchQueue -= 1;
    batch.queued = this.launchQueue;
    batch.fed += 1;
    this.nextFeedAt = this.simTime + this.feedIntervalSteps * this.config.physics.fixedDt;
    this.emit('launchFeed', {
      record,
      fed: batch.fed,
      queued: batch.queued,
      total: batch.count
    });
  }

  spawnMarble(x, y, options = {}) {
    const batch = this.activeBatch;
    const config = this.config.physics.marble;
    const record = createMarbleRecord(
      batch,
      batch.marbles.length,
      this.simTime,
      {
        bonus: options.bonus === true,
        valueFactor: options.valueFactor
      }
    );
    record.spawnX = x;
    record.spawnY = y;
    record.launchState = 'field';
    record.nextStallCheckAt = this.simTime + this.config.physics.stallCheckMs;
    batch.fieldActive += 1;

    const body = Bodies.circle(x, y, config.radius, {
      density: config.density,
      restitution: config.restitution,
      friction: config.friction,
      frictionStatic: config.frictionStatic,
      frictionAir: config.frictionAir,
      slop: config.slop,
      label: 'marble'
    });
    body.plugin.pachinko = { type: 'marble', record };
    record.body = body;

    const inherited = options.inheritedVelocity;
    const vx = inherited
      ? inherited.x + this.rng.range(-0.35, 0.35)
      : this.rng.range(-0.55, 0.55);
    const vy = inherited
      ? Math.min(0.15, inherited.y) + this.rng.range(-0.2, 0.1)
      : this.rng.range(0.2, 0.55);
    Body.setVelocity(body, { x: vx, y: vy });
    Body.setAngularVelocity(body, this.rng.range(-config.angularVelocity, config.angularVelocity));
    Body.setAngle(body, this.rng.range(0, Math.PI * 2));
    Composite.add(this.engine.world, body);
    this.emit('marbleSpawned', {
      record,
      x,
      y,
      bonus: record.isBonus
    });
    return record;
  }

  maybeSplit(record) {
    const batch = this.activeBatch;
    if (!batch || !record || !record.body || record.isBonus) return;
    const modifiers = batch.modifiers || {};
    if (!modifiers.splitEvery || !modifiers.maxSplits) return;
    if (batch.bonusSpawned >= modifiers.maxSplits) return;
    if (batch.active >= this.config.limits.maxActiveBodies) return;
    if (record.pegHits < (record.splitCount + 1) * modifiers.splitEvery) return;
    const radius = this.config.physics.marble.radius;
    const position = record.body.position;
    const x = clamp(
      position.x + this.rng.range(-8, 8),
      this.config.board.playLeft + radius + 2,
      this.config.board.playRight - radius - 2
    );
    const y = clamp(
      position.y - radius * 2 - 4,
      this.config.board.playTop + radius + 2,
      this.config.board.playBottom - radius - 2
    );
    this.pendingSplits.push({
      x,
      y,
      valueFactor: modifiers.splitValueFactor,
      velocity: { x: record.body.velocity.x, y: record.body.velocity.y },
      parentId: record.id
    });
    record.splitCount += 1;
  }

  clampFieldSpeed() {
    const batch = this.activeBatch;
    if (!batch) return;
    const maxSpeed = this.config.physics.maxFieldSpeed;
    if (!maxSpeed) return;
    for (let index = 0; index < batch.marbles.length; index += 1) {
      const record = batch.marbles[index];
      if (record.state !== 'ACTIVE' || !record.body) continue;
      const velocity = record.body.velocity;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed <= maxSpeed) continue;
      const scale = maxSpeed / speed;
      Body.setVelocity(record.body, {
        x: velocity.x * scale,
        y: velocity.y * scale
      });
    }
  }

  containFieldBalls() {
    const batch = this.activeBatch;
    if (!batch) return;
    const layout = this.board.layout;
    const radius = this.config.physics.marble.radius;
    const boundaryAt = (y) => {
      if (y <= layout.playTop) return [layout.topOpeningLeft, layout.topOpeningRight];
      if (y < layout.shoulderY) {
        const t = (y - layout.playTop) / (layout.shoulderY - layout.playTop);
        return [
          layout.topOpeningLeft + (layout.playLeft - layout.topOpeningLeft) * t,
          layout.topOpeningRight + (layout.playRight - layout.topOpeningRight) * t
        ];
      }
      return [layout.playLeft, layout.playRight];
    };
    for (let index = 0; index < batch.marbles.length; index += 1) {
      const record = batch.marbles[index];
      if (record.state !== 'ACTIVE' || !record.body) continue;
      const body = record.body;
      const position = body.position;
      const velocity = body.velocity;
      let x = position.x;
      let y = position.y;
      let vx = velocity.x;
      let vy = velocity.y;
      let changed = false;
      if (y < layout.playTop + radius) {
        y = layout.playTop + radius;
        vy = Math.abs(vy);
        changed = true;
      }
      const bounds = boundaryAt(y);
      if (x < bounds[0] - 1 || x > bounds[1] + 1) {
        markLost(batch, record, this.simTime, 'out-of-bounds', position);
        continue;
      }
      if (x < bounds[0] + radius) {
        x = bounds[0] + radius;
        vx = Math.abs(vx);
        changed = true;
      } else if (x > bounds[1] - radius) {
        x = bounds[1] - radius;
        vx = -Math.abs(vx);
        changed = true;
      }
      if (changed) {
        Body.setPosition(body, { x, y });
        Body.setVelocity(body, { x: vx, y: vy });
      }
    }
  }
  processSplits() {
    if (!this.pendingSplits || this.pendingSplits.length === 0) return;
    const batch = this.activeBatch;
    if (!batch) {
      this.pendingSplits.length = 0;
      return;
    }
    const modifiers = batch.modifiers || {};
    while (this.pendingSplits.length > 0) {
      const item = this.pendingSplits.pop();
      if (!modifiers.maxSplits || batch.bonusSpawned >= modifiers.maxSplits) continue;
      if (batch.active >= this.config.limits.maxActiveBodies) continue;
      const record = this.spawnMarble(item.x, item.y, {
        bonus: true,
        valueFactor: item.valueFactor,
        inheritedVelocity: item.velocity
      });
      this.emit('split', {
        record,
        parentId: item.parentId,
        x: item.x,
        y: item.y
      });
    }
  }

  handleCollisionStart(event) {
    const batch = this.activeBatch;
    if (!batch) return;
    for (let index = 0; index < event.pairs.length; index += 1) {
      const pair = event.pairs[index];
      const dataA = pair.bodyA.plugin?.pachinko;
      const dataB = pair.bodyB.plugin?.pachinko;
      if (!dataA || !dataB) continue;
      if (dataA.type === 'marble' && dataB.type === 'marble') {
        registerBallCollision(batch, dataA.record, dataB.record);
      } else if (dataA.type === 'marble') {
        this.handleMarbleContact(dataA, dataB);
      } else if (dataB.type === 'marble') {
        this.handleMarbleContact(dataB, dataA);
      }
    }
  }

  handleMarbleContact(marbleData, otherData) {
    const batch = this.activeBatch;
    const record = marbleData.record;
    if (!batch || !record) return;

    if (otherData.type === 'peg') {
      const coinsBefore = record.pegCoins;
      const awarded = registerPegHit(
        batch,
        record,
        otherData,
        this.simTime,
        this.config.physics.pegCooldownMs
      );
      if (awarded) {
        this.maybeSplit(record);
        this.emit('pegHit', {
          record,
          index: otherData.index,
          value: record.pegCoins - coinsBefore,
          rare: otherData.rare,
          special: otherData.special,
          x: otherData.x,
          y: otherData.y
        });
      }
      return;
    }

    if (otherData.type === 'slot') {
      // A sensor overlap from outside the side wall is an escape, not a win.
      const x = record.body?.position.x;
      if (x < this.board.layout.playLeft || x > this.board.layout.playRight) {
        markLost(batch, record, this.simTime, 'out-of-bounds', record.body.position);
        return;
      }
      registerSlotContact(batch, record);
      if (record.state === 'ACTIVE') {
        settleMarbleRecord(
          batch,
          record,
          otherData.slotId,
          this.simTime,
          'sensor',
          record.body ? record.body.position : null
        );
      }
      return;
    }

    if (otherData.type === 'bumper') {
      registerWallContact(batch, record);
      this.emit('bumperHit', {
        record,
        index: otherData.index,
        x: otherData.x,
        y: otherData.y
      });
      return;
    }

    if (otherData.type === 'splitter' || otherData.type === 'wall') {
      registerWallContact(batch, record);
      if (otherData.kind === 'side-return') this.onRailContact(record, otherData);
    }
  }

  onRailContact(record, rail) {
    if (record.state !== 'ACTIVE' || !record.body || this.simTime < (record.nextRailAt || 0)) return;
    record.nextRailAt = this.simTime + 700;
    const modifiers = this.activeBatch.modifiers;
    record.railEnergyHits = Math.min(6, (record.railEnergyHits || 0) + 1);
    record.railEnergy = record.railEnergyHits * (modifiers.railEnergyValue || 0);
    const canBoost = (modifiers.railElasticity || 0) > 0 && (record.elasticKicks || 0) < 6
      && this.simTime - record.spawnAt < 15000;
    if (canBoost) {
      record.elasticKicks = (record.elasticKicks || 0) + 1;
      const stage = Math.min(3, modifiers.railElasticity);
      record.pendingElasticImpulse = { x: (rail.normalX >= 0 ? 1 : -1) * (4.2 + stage * 1.1), y: -(2.8 + stage * 1.2) };
    }
    this.emit('railHit', { record, railId: rail.railId, x: record.body.position.x, y: record.body.position.y, boosted: canBoost,
      elasticRemaining: Math.max(0, 6 - (record.elasticKicks || 0)),
      energy: record.railEnergy });
  }

  processRailImpulses() {
    for (const record of this.activeBatch?.marbles || []) {
      if (record.state === 'ACTIVE' && record.body && record.pendingElasticImpulse) {
        Body.setVelocity(record.body, record.pendingElasticImpulse);
      }
      record.pendingElasticImpulse = null;
    }
  }

  checkPositions() {
    const batch = this.activeBatch;
    if (!batch) return;
    const board = this.config.board;
    for (let index = 0; index < batch.marbles.length; index += 1) {
      const record = batch.marbles[index];
      if (record.state !== 'ACTIVE' || !record.body) continue;
      const position = record.body.position;
      if (
        position.x < board.playLeft - 40
        || position.x > board.playRight + 40
        || position.y < board.playTop - 200
        || position.y > board.playBottom + 40
      ) {
        markLost(batch, record, this.simTime, 'out-of-bounds', position);
        continue;
      }
      if (position.y >= board.playBottom - 10) {
        const slotId = this.board.getSlotIndexAtX(position.x);
        if (slotId >= 0) {
          settleMarbleRecord(batch, record, slotId, this.simTime, 'fallback', position);
        } else {
          markLost(batch, record, this.simTime, 'out-of-bounds', position);
        }
      }
    }
  }

  processPendingSettles() {
    const batch = this.activeBatch;
    if (!batch) return;
    while (batch.settling.length > 0) {
      const entry = batch.settling.pop();
      const record = entry.record;
      if (record.body) {
        Composite.remove(this.engine.world, record.body);
        record.body = null;
      }
      if (entry.lost) {
        recycleMarbleRecord(batch, record, this.simTime);
        this.emit('marbleLost', {
          record,
          x: entry.x,
          y: entry.y,
          reason: entry.method
        });
      } else {
        recycleMarbleRecord(batch, record, this.simTime);
        this.emit('marbleSettled', {
          record,
          x: entry.x,
          y: entry.y,
          slotId: record.slotId,
          value: record.slotPayout
        });
      }
      record.pegCooldowns = null;
    }
  }

  checkStalls() {
    const batch = this.activeBatch;
    if (!batch) return;
    const physics = this.config.physics;
    for (let index = 0; index < batch.marbles.length; index += 1) {
      const record = batch.marbles[index];
      if (record.state !== 'ACTIVE' || !record.body) continue;
      if (this.simTime < record.nextStallCheckAt) continue;
      record.nextStallCheckAt = this.simTime + physics.stallCheckMs;
      const velocity = record.body.velocity;
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed < physics.stallSpeed) {
        record.stallMs += physics.stallCheckMs;
      } else {
        record.stallMs = 0;
      }
      if (record.stallMs < physics.stallTriggerMs) continue;
      if (record.nudges < physics.maxNudges) {
        Body.setVelocity(record.body, {
          x: velocity.x + this.rng.range(-physics.nudgeX, physics.nudgeX),
          y: velocity.y - physics.nudgeY
        });
        Body.setAngularVelocity(record.body, this.rng.range(-0.25, 0.25));
        record.nudges += 1;
        record.stallMs = 0;
        batch.nudges += 1;
        this.emit('nudge', { record });
      } else {
        markLost(batch, record, this.simTime, 'stuck', record.body.position);
        record.stallMs = 0;
      }
    }
  }

  checkTimeout() {
    const batch = this.activeBatch;
    if (!batch) return;
    if (this.simTime - batch.startedAt < this.config.physics.maxBatchMs) return;
    if (this.launchQueue > 0 || batch.launchSpawned < batch.count) {
      batch.aborted = true;
    }
    this.launchQueue = 0;
    batch.queued = 0;
    for (let index = 0; index < batch.marbles.length; index += 1) {
      const record = batch.marbles[index];
      if (record.state !== 'ACTIVE' || !record.body) continue;
      markLost(batch, record, this.simTime, 'timeout', record.body.position);
    }
    this.processPendingSettles();
  }

  checkCompletion() {
    const batch = this.activeBatch;
    if (!batch) return;
    if (this.launchQueue > 0 || batch.active > 0 || batch.settling.length > 0) return;
    batch.queued = 0;
    batch.residualBodies = this.getWorldMarbleCount();
    finalizeBatch(batch, this.simTime, this.wallet);
    this.lastReport = batch;
    this.activeBatch = null;
    this.emit('batchComplete', batch);
  }

  getWorldMarbleCount() {
    const bodies = Composite.allBodies(this.engine.world);
    let count = 0;
    for (let index = 0; index < bodies.length; index += 1) {
      if (bodies[index].plugin?.pachinko?.type === 'marble') count += 1;
    }
    return count;
  }

  isBusy() {
    return this.activeBatch !== null;
  }

  getActiveCount() {
    return this.activeBatch ? this.activeBatch.active : 0;
  }

  getMarbles() {
    return this.activeBatch ? this.activeBatch.marbles : [];
  }

  getFeedSnapshot() {
    const batch = this.activeBatch || this.lastReport;
    if (!batch) {
      return {
        total: 0,
        queued: 0,
        fed: 0,
        fieldActive: 0,
        activeCap: this.activeCap
      };
    }
    return {
      total: batch.count,
      queued: batch.queued,
      fed: batch.fed,
      fieldActive: batch.fieldActive,
      activeCap: batch.activeCap || this.activeCap
    };
  }

  getSnapshot() {
    return {
      simTime: this.simTime,
      busy: this.isBusy(),
      active: this.getActiveCount(),
      worldMarbles: this.getWorldMarbleCount(),
      lastReportId: this.lastReport ? this.lastReport.id : null,
      feed: this.getFeedSnapshot()
    };
  }

  getFieldActiveCount() {
    return this.activeBatch ? this.activeBatch.fieldActive : 0;
  }

  rebuildBoard(modifiers = {}) {
    if (this.activeBatch) return { ok: false, reason: 'busy' };
    Composite.remove(this.engine.world, this.board.staticBodies);
    this.boardModifiers = modifiers;
    this.board = createBoard(this.config, modifiers);
    Composite.add(this.engine.world, this.board.staticBodies);
    this.pendingSplits = [];
    Engine.clear(this.engine);
    return { ok: true, board: this.board };
  }

  reset() {
    const bodies = Composite.allBodies(this.engine.world);
    for (let index = 0; index < bodies.length; index += 1) {
      if (bodies[index].plugin?.pachinko?.type === 'marble') {
        Composite.remove(this.engine.world, bodies[index]);
      }
    }
    this.activeBatch = null;
    this.lastReport = null;
    this.launchQueue = 0;
    this.nextFeedAt = 0;
    this.batchCounter = 0;
    this.simTime = 0;
    this.rng = makeRng(this.config.seed);
    this.pendingSplits = [];
    Engine.clear(this.engine);
  }
}
