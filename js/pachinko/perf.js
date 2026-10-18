import { mean, percentile } from './utils.js';

export class PerfMonitor {
  constructor() {
    this.liveFps = 0;
    this.last = null;
    this.recording = false;
    this.lastTickAt = 0;
    this.lastFrameAt = 0;
    this.startAt = 0;
    this.deltas = [];
    this.actives = [];
    this.physicsSamples = [];
    this.renderSamples = [];
    this.steps = 0;
  }

  reset() {
    this.liveFps = 0;
    this.last = null;
    this.recording = false;
    this.lastTickAt = 0;
    this.lastFrameAt = 0;
    this.startAt = 0;
    this.deltas.length = 0;
    this.actives.length = 0;
    this.physicsSamples.length = 0;
    this.renderSamples.length = 0;
    this.steps = 0;
  }

  resetFrameClock() {
    this.lastTickAt = 0;
    this.lastFrameAt = 0;
  }

  tick(now, frame) {
    if (this.lastTickAt > 0 && now > this.lastTickAt && !frame.paused) {
      const dt = now - this.lastTickAt;
      if (dt > 0 && dt < 250) {
        const instant = 1000 / dt;
        this.liveFps = this.liveFps > 0 ? this.liveFps * 0.85 + instant * 0.15 : instant;
      }
    }
    this.lastTickAt = now;

    if (frame.paused) {
      if (this.recording) this.lastFrameAt = now;
      return;
    }

    if (frame.wasBusy) {
      if (!this.recording) {
        this.recording = true;
        this.startAt = now;
        this.lastFrameAt = now;
        this.deltas.length = 0;
        this.actives.length = 0;
        this.physicsSamples.length = 0;
        this.renderSamples.length = 0;
        this.steps = 0;
        return;
      }
      const dt = now - this.lastFrameAt;
      if (dt > 0 && dt <= 1000) {
        this.deltas.push(dt);
        this.actives.push(frame.active);
        this.physicsSamples.push(frame.physicsMs);
        this.renderSamples.push(frame.renderMs);
        this.steps += frame.steps;
      }
      this.lastFrameAt = now;
    }

    if (this.recording && !frame.isBusy) {
      this.finalize(frame.batchId);
    }
  }

  finalize(batchId) {
    this.recording = false;
    const frames = this.deltas.length;
    if (!frames) {
      this.last = {
        batchId,
        frames: 0,
        avgFps: 0,
        minFps: 0,
        p95FrameMs: 0,
        maxFrameMs: 0,
        peakAvgFps: 0,
        peakActive: 0,
        durationMs: 0,
        avgPhysicsMs: 0,
        avgRenderMs: 0,
        physicsMsPerStep: 0,
        displayHz: 0
      };
      return;
    }

    const sorted = this.deltas.slice().sort((a, b) => a - b);
    const sum = this.deltas.reduce((total, value) => total + value, 0);
    const avgDt = sum / frames;
    const maxDt = sorted[sorted.length - 1];
    const p95 = percentile(sorted, 0.95);
    const peakActive = this.actives.reduce((max, value) => Math.max(max, value), 0);
    const threshold = peakActive * 0.8;
    const peakDeltas = [];
    for (let index = 0; index < frames; index += 1) {
      if (this.actives[index] >= threshold) peakDeltas.push(this.deltas[index]);
    }
    const peakAvgDt = peakDeltas.length ? mean(peakDeltas) : avgDt;
    const physicsTotal = this.physicsSamples.reduce((total, value) => total + value, 0);
    const renderTotal = this.renderSamples.reduce((total, value) => total + value, 0);

    this.last = {
      batchId,
      frames,
      avgFps: 1000 / avgDt,
      minFps: maxDt > 0 ? 1000 / maxDt : 0,
      p95FrameMs: p95,
      maxFrameMs: maxDt,
      peakAvgFps: peakAvgDt > 0 ? 1000 / peakAvgDt : 0,
      peakActive,
      durationMs: sum,
      avgPhysicsMs: physicsTotal / frames,
      avgRenderMs: renderTotal / frames,
      physicsMsPerStep: this.steps > 0 ? physicsTotal / this.steps : 0,
      displayHz: 1000 / percentile(sorted, 0.5)
    };
  }
}
