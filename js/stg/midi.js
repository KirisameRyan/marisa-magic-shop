// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · MIDI 演奏 (midi.js)
//  解析 .mid (format 0/1) → WebAudio 芯片音序器
//  主旋律方波/锯齿 + 低音三角 + 通道10鼓(噪声), 整曲循环
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.midi = (function() {
  var ac = null, master = null, timer = null;
  var volF = 0.6, mutedF = false;   // 音量缩放(关0/小0.35/中0.6/大1) 与 静音
  var events = [], total = 0;       // 绝对秒事件表 / 曲长
  var playT = 0, evIdx = 0;         // 本轮起点 / 事件指针
  var curPath = null;
  var active = [];                // 进行中的发声体
  var VOICES = 16, LOOK = 0.15;

  function applyGain() { if (master) master.gain.value = 0.24 * volF * (mutedF ? 0 : 1); }
  function ensureAC() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      applyGain();
      master.connect(ac.destination);
    } catch (e) { ac = null; return false; }
    return true;
  }
  function setMuted(m) { mutedF = !!m; applyGain(); }
  function setVolume(v) { volF = Math.max(0, Math.min(1, v)); applyGain(); }

  // ── 解析 .mid → 绝对秒音符表 ──
  function parse(buf) {
    var v = new DataView(buf), p = 0;
    function u32() { var x = v.getUint32(p); p += 4; return x; }
    function u16() { var x = v.getUint16(p); p += 2; return x; }
    function u8() { var x = v.getUint8(p); p += 1; return x; }
    function str(n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(u8()); return s; }
    function varlen() { var d = 0, b; do { b = u8(); d = (d << 7) | (b & 0x7f); } while (b & 0x80); return d; }

    if (str(4) !== 'MThd') throw new Error('not midi');
    u32();
    u16();                                   // format
    var ntrk = u16(), div = u16();
    if (div & 0x8000) div = 480;             // SMPTE 不支持, 退回默认
    var evs = [];
    for (var t = 0; t < ntrk; t++) {
      if (p + 8 > v.byteLength) break;
      if (str(4) !== 'MTrk') throw new Error('bad track');
      var len = u32(), end = p + len;
      var tick = 0, run = 0, prog = 0;
      while (p < end) {
        tick += varlen();
        var st = u8();
        if (st < 0x80) { p--; st = run; } else if (st < 0xf0) run = st;
        if (st === 0xff) {
          var type = u8(), n = varlen();
          if (type === 0x51 && n === 3) {
            var us = (u8() << 16) | (u8() << 8) | u8();
            evs.push({ tick: tick, tempo: us });
          } else p += n;
        } else if (st === 0xf0 || st === 0xf7) {
          p += varlen();
        } else {
          var ch = st & 0x0f, cmd = st & 0xf0;
          if (cmd === 0x90 || cmd === 0x80) {
            var note = u8(), vel = u8();
            evs.push({ tick: tick, ch: ch, on: cmd === 0x90 && vel > 0, note: note, vel: vel, prog: prog });
          } else if (cmd === 0xc0) {
            prog = u8();
          } else if (cmd === 0xb0 || cmd === 0xe0 || cmd === 0xa0) {
            u8(); u8();
          } else if (cmd === 0xd0) {
            u8();
          } else p = end;
        }
      }
      p = end;
    }
    // tick → 秒(沿 tempo 曲线积分), 配对 note on/off
    evs.sort(function(a, b) { return a.tick - b.tick; });
    var uspq = 500000, sec = 0, lastTick = 0;
    var notes = [], open = {};
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      sec += (e.tick - lastTick) * (uspq / 1000000) / div;
      lastTick = e.tick;
      if (e.tempo) { uspq = e.tempo; continue; }
      var key = e.ch + ':' + e.note;
      if (e.on) {
        if (!open[key]) open[key] = { t: sec, ch: e.ch, note: e.note, vel: e.vel, prog: e.prog };
      } else if (open[key]) {
        var o = open[key];
        notes.push({ t: o.t, dur: Math.max(0.05, sec - o.t), ch: o.ch, note: o.note, vel: o.vel, prog: o.prog });
        delete open[key];
      }
    }
    var endT = sec + 0.5;
    for (var k in open) {
      var o2 = open[k];
      notes.push({ t: o2.t, dur: Math.max(0.05, endT - o2.t), ch: o2.ch, note: o2.note, vel: o2.vel, prog: o2.prog });
    }
    notes.sort(function(a, b) { return a.t - b.t; });
    return { notes: notes, total: endT };
  }

  // ── 芯片音合成 ──
  function noteFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  var _noise = null;
  function noiseBuf(len) {
    if (_noise && _noise.duration >= len) return _noise;
    var n = Math.max(1, Math.floor(ac.sampleRate * len));
    var b = ac.createBuffer(1, n, ac.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    _noise = b;
    return b;
  }
  function voice(t, dur, ch, note, vel, prog) {
    if (active.length >= VOICES) return;
    var vol = 0.18 + 0.5 * (vel / 127);
    var g = ac.createGain();
    g.connect(master);
    if (ch === 9) {
      // 鼓(通道10): 35/36 底鼓 = 低频下扫; 其余 = 噪声(短=帽, 长=军鼓)
      if (note === 35 || note === 36) {
        var o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(dur, 0.12));
        o.connect(g);
        o.start(t); o.stop(t + 0.16);
        active.push({ stop: t + 0.16, osc: o });
        return;
      }
      var len = (note === 42 || note === 44) ? 0.05 : 0.12;
      var src = ac.createBufferSource();
      src.buffer = noiseBuf(len);
      g.gain.setValueAtTime(vol * 0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(g);
      src.start(t);
      active.push({ stop: t + len + 0.02 });
      return;
    }
    // 旋律/贝斯: 低音区三角; program 弦乐类锯齿, 吉他类三角, 其余方波
    var wave = 'square';
    if (note < 48) wave = 'triangle';
    else if (prog === 40 || prog === 41 || prog === 42 || prog === 45) wave = 'sawtooth';
    else if (prog >= 24 && prog <= 31) wave = 'triangle';
    var o2 = ac.createOscillator();
    o2.type = wave;
    o2.frequency.value = noteFreq(note);
    var a = Math.min(0.02, dur / 4);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - 0.05));
    g.gain.linearRampToValueAtTime(0.001, t + dur);
    o2.connect(g);
    o2.start(t); o2.stop(t + dur + 0.02);
    active.push({ stop: t + dur + 0.02, osc: o2 });
  }

  // ── 音序器 ──
  function sweep() {
    if (!events.length || !ac) return;
    var now = ac.currentTime;
    for (var i = active.length - 1; i >= 0; i--) if (active[i].stop < now - 0.05) active.splice(i, 1);
    while (evIdx < events.length && playT + events[evIdx].t < now + LOOK) {
      var e = events[evIdx];
      voice(playT + e.t, e.dur, e.ch, e.note, e.vel, e.prog);
      evIdx++;
    }
    if (evIdx >= events.length && now + LOOK >= playT + total) { playT += total; evIdx = 0; }   // 循环
  }

  function play(path) {
    if (curPath === path) return;
    stop();
    if (!ensureAC()) return;
    curPath = path;
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    fetch(encodeURI(path))
      .then(function(r) { if (!r.ok) throw new Error('404'); return r.arrayBuffer(); })
      .then(function(buf) {
        if (curPath !== path) return;   // 期间已切曲
        var parsed = parse(buf);
        if (!parsed.notes.length) return;
        events = parsed.notes;
        total = parsed.total;
        playT = ac.currentTime + 0.1;
        evIdx = 0;
        if (!timer) timer = setInterval(sweep, 50);
      })
      .catch(function() { if (curPath === path) curPath = null; });   // 缺文件/解析失败: 静默
  }
  function stop() {
    curPath = null;
    events = [];
    evIdx = 0;
    if (timer) { clearInterval(timer); timer = null; }
    for (var i = 0; i < active.length; i++) {
      try { if (active[i].osc) active[i].osc.stop(); } catch (e) {}
    }
    active = [];
  }

  return {
    play: play, stop: stop, setMuted: setMuted, setVolume: setVolume,
    get status() { return { playing: !!curPath, path: curPath, notes: events.length, total: Math.round(total * 10) / 10, pos: Math.min(evIdx, events.length), voices: active.length }; }
  };
})();
