// ═══════════════════════════════════════════════════════════════
//  星之魔弹 · Boss (boss.js)
//  多 Boss: 立绘本体 + 2 符卡(限时) + 5 段血
//  支持道中简版(mini): 1 符卡 + 3 段 + 血量 40%
//  弹速随 Stage 递增; 入场阶段固定居中
// ═══════════════════════════════════════════════════════════════
window.STG = window.STG || {};
var STG = window.STG;

STG.boss = (function() {
  var C = STG.CONFIG;

  var SPELL_TIME = 25;        // 符卡限时 s
  // 相位表: 3 符卡 Boss(五六面) 7 段, 其余 5 段
  function phasesFor(cfg, mini) {
    if (mini) return ['normal1', 'spell1', 'normal2'];
    if (cfg.spells.length >= 3) return ['normal1', 'spell1', 'normal2', 'spell2', 'normal3', 'spell3', 'time'];
    return ['normal1', 'spell1', 'normal2', 'spell2', 'time'];
  }

  var b = null;

  // opts: { mini: true } → 道中简版
  function start(stage, opts) {
    var cfg = STG.bossFor(stage || 1);
    var mini = !!(opts && opts.mini);
    var segHp = Math.round(cfg.segHp * cfg.hpMul * (mini ? 0.8 : 1));
    var phases = phasesFor(cfg, mini);
    b = {
      cfg: cfg, mini: mini, stage: stage || 1,
      phases: phases,
      x: C.W / 2, y: -60,
      t: 0, swing: 0,
      hp: segHp * phases.length, segHp: segHp,
      seg: 0, phase: 'enter',
      spellT: 0, fireT: 1.2, spin: 0,
      lockT: 0,               // 符卡锁血演出剩余(演出期间不可击破)
      timeT: 0,               // 时符倒计时
      bannerT: 0, bannerDur: 1, bannerName: '', bannerKind: '',
      dash: null, dashCd: 3.5, ret: null, cnt: 0,   // 体术冲刺 / 回位 / 出招计数
      slowT: 0,               // 弹幕减速(寒冰妖精冰弹命中)
      beamT: 0,               // 魔炮接触时长(伤害递增, 脱离重置)
      dead: false, dying: 0
    };
  }

  function cfgName() { return b ? b.cfg.name : ''; }
  function phaseName() { return b ? b.phase : ''; }
  function segName() {
    if (!b) return '';
    if (b.phase === 'spell1') return '符卡·' + b.cfg.spells[0];
    if (b.phase === 'spell2') return '符卡·' + b.cfg.spells[1];
    if (b.phase === 'spell3') return '符卡·' + b.cfg.spells[2];
    if (b.phase === 'time') return '时符·' + (b.cfg.timeSpell ? b.cfg.timeSpell.name : '????');
    return b.mini ? '道中精英' : '通常攻击';
  }

  function update(dt, power, cb) {
    if (!b || b.dead) return;
    b.t += dt;

    if (b.phase === 'enter') {
      b.x = C.W / 2;
      b.y += 150 * dt;        // 登场加速(~1.2s 到位)
      if (b.y >= 128) { b.y = 128; enterPhase('normal1'); }
      return;
    }
    if (b.phase === 'dying') {
      b.dying -= dt;
      if (b.dying <= 0) { b.dead = true; if (cb && cb.died) cb.died(); }
      return;
    }

    // ── 移动(体术冲刺优先于横晃) ──
    if (b.dash) {
      b.dash.t += dt;
      if (b.dash.t < 0) {
        // 蓄力: 原地高频抖动
        b.x = b.dash.sx + STG.rnd(-3, 3);
        b.y = b.dash.sy + STG.rnd(-3, 3);
      } else if (b.dash.t < 0.38) {
        var dk = b.dash.t / 0.38;
        b.x = b.dash.sx + (b.dash.tx - b.dash.sx) * dk;
        b.y = b.dash.sy + (b.dash.ty - b.dash.sy) * dk;
        // 冲刺过程持续放弹幕
        if (Math.random() < dt * 9) {
          STG.bullets.pAimed(b.x, b.y, STG.player.x, STG.player.y, sp0() * 1.1, 0, 'b2', 2);
        }
      } else if (b.dash.t >= 0.9) {
        b.ret = { t: 0, fx: b.x, fy: b.y };
        b.dash = null;
      }
    } else if (b.ret) {
      // 冲刺后平滑回位
      b.ret.t += dt;
      var rk = Math.min(1, b.ret.t / 0.6);
      b.swing += dt * 0.8;
      var homeX = C.W / 2 + Math.sin(b.swing) * 150;
      b.x = b.ret.fx + (homeX - b.ret.fx) * rk;
      b.y = b.ret.fy + (128 - b.ret.fy) * rk;
      if (rk >= 1) b.ret = null;
    } else {
      b.swing += dt * 0.8;
      b.x = C.W / 2 + Math.sin(b.swing) * 150;
      // 体术触发(仅限 cfg.dash 的 Boss, 时符期不触发)
      if (b.cfg.dash && b.phase !== 'time' && b.phase !== 'enter') {
        b.dashCd -= dt;
        if (b.dashCd <= 0) {
          b.dash = { t: -0.55, sx: b.x, sy: b.y, tx: STG.player.x, ty: Math.min(STG.player.y - 60, 380) };
          b.dashCd = STG.rnd(4.5, 7.5);
          STG.engine.label(b.x, b.y - 64, '体术!', '#ff9db8', 16);
          STG.engine.shake(4, 0.25);
        }
      }
    }
    if (b.bannerT > 0) b.bannerT -= dt;
    if (b.slowT > 0) b.slowT -= dt;

    // ── 时符: Boss 无敌倒计时, 不吞自机弹, 撑过即击破 ──
    if (b.phase === 'time') {
      b.timeT -= dt;
      if (b.timeT <= 0) {
        STG.engine.label(C.W / 2, 240, '时符 取得!', '#ffe8b0', 20);
        enterPhase('dying');
        return;
      }
      b.fireT -= dt;
      if (b.fireT <= 0) { b.fireT = fireInterval(); doFire(); }
      return;
    }

    // 受击
    var hits = STG.bullets.hitPlayerBullets(b.x, b.y, 32);
    for (var h = 0; h < hits.length; h++) {
      var dmg = C.SHOT_DAMAGE * STG.totalDmgMul(power) * STG.bullets.bulletDmg(hits[h]);
      // 星散贴脸强化
      if (STG.player.gun === 'spread' && STG.player.perkLv('close_up') > 0 &&
          STG.dist2(b.x, b.y, STG.player.x, STG.player.y) < 150 * 150) {
        dmg *= 1 + 0.2 * STG.player.perkLv('close_up');
      }
      b.hp -= dmg;
      // 冰弹: Boss 弹幕发射减速
      if (STG.bullets.bulletIce(hits[h])) {
        if (b.slowT <= 0) STG.engine.label(b.x, b.y - 56, '弹幕减速!', '#7cc4ff', 13);
        b.slowT = 2.5;
      }
      STG.bullets.killPlayerBullet(hits[h]);
      STG.engine.spark(b.x + STG.rnd(-24, 24), b.y + STG.rnd(-24, 24), b.cfg.color, 3, 150);
    }
    if (b.hp <= 0) { enterPhase('dying'); return; }

    // ── 符卡锁血演出: 演出期间血量锁在段底, 保证弹幕展示时间 ──
    if (b.lockT > 0) {
      b.lockT -= dt;
      var segBottom = b.segHp * (b.phases.length - 1 - b.seg);
      if (b.hp < segBottom) b.hp = segBottom;
      if (b.lockT <= 0) STG.engine.label(C.W / 2, 240, '符卡解除 · 击破!', '#ffe8b0', 16);
    }

    // ── 段切换 ──
    var newSeg = Math.min(b.phases.length - 1, Math.max(0, b.phases.length - Math.ceil(b.hp / b.segHp)));
    if (newSeg > b.seg) {
      // 符卡取得: 未被 bomb/中弹弄脏的符卡相位被干净击破
      var oldPh = b.phases[b.seg];
      if ((oldPh === 'spell1' || oldPh === 'spell2' || oldPh === 'spell3') && !b.spellDirty && cb && cb.capture) {
        cb.capture(b.cfg.spells[oldPh === 'spell1' ? 0 : (oldPh === 'spell2' ? 1 : 2)]);
      }
      b.spellDirty = false;
      b.seg = newSeg;
      enterPhase(b.phases[b.seg]);
    }

    // 符卡限时
    if (b.phase === 'spell1' || b.phase === 'spell2' || b.phase === 'spell3') {
      b.spellT -= dt;
      if (b.spellT <= 0) {
        STG.engine.label(C.W / 2, 240, '符卡 FAILED', '#ff7b7b', 18);
        b.hp = Math.max(0, b.hp - (b.hp % b.segHp || b.segHp));
        b.seg = Math.min(b.phases.length - 1, b.seg + 1);
        enterPhase(b.phases[b.seg]);
      }
    }

    // 射击
    b.fireT -= dt;
    if (b.fireT <= 0) { b.fireT = fireInterval(); doFire(); }
  }

  function enterPhase(ph) {
    b.phase = ph;
    if (ph === 'dying') {
      b.dying = 1.0;
      STG.engine.shake(12, 0.6);
      STG.engine.spark(b.x, b.y, b.cfg.color, 50, 460);
      STG.engine.spark(b.x, b.y, '#ffe8b0', 40, 400);
      return;
    }
    if (ph === 'time') {
      // 时符宣言: 无敌倒计时
      b.timeT = b.cfg.timeSpell ? b.cfg.timeSpell.dur : 30;
      b.lockT = 0;
      b.bannerT = 2.2; b.bannerDur = 2.2;
      b.bannerName = segName();
      b.bannerKind = 'time';
      b.fireT = 0.6;
      return;
    }
    if (ph === 'spell1' || ph === 'spell2' || ph === 'spell3') {
      b.spellT = SPELL_TIME;
      b.lockT = b.mini ? 12 : 15;   // 符卡演出期锁血
      b.spellDirty = false;         // 干净击破可取得(被 bomb/中弹弄脏则取消)
      b.bannerT = 2.0; b.bannerDur = 2.0;
      b.bannerName = segName();
      b.bannerKind = 'spell';
      STG.engine.label(C.W / 2, 205, '符卡演出中 · 暂不可击破', '#8a7e9a', 11);
    } else {
      b.lockT = 0;
      STG.engine.label(C.W / 2, 180, segName(), '#f0c060', 16);
    }
    b.fireT = 0.6;
  }

  function fireInterval() {
    var st = Math.max(0.65, 1 - 0.07 * (b.stage - 1));   // 射击间隔随 Stage 收紧
    var slow = b.slowT > 0 ? 2 : 1;                      // 被冰弹命中: 弹幕减速
    if (b.phase === 'time') {
      // 时符: 倒计时越往后射得越密(起手即有压迫感)
      var prog = 1 - b.timeT / (b.cfg.timeSpell ? b.cfg.timeSpell.dur : 30);
      return Math.max(0.14, 0.42 - 0.28 * prog) * st;
    }
    if (b.phase === 'spell1') return 0.55 * st * slow;
    if (b.phase === 'spell2') return 0.5 * st * slow;
    return 1.0 * st * slow;
  }
  // 冲刺弹幕用的弹速
  function sp0() { return 150 * (1 + 0.08 * (b.stage - 1)); }
  function doFire() {
    var eb = STG.bullets;
    var px = STG.player.x, py = STG.player.y;
    // 弹速随 Stage 递增
    var sp = sp0();
    b.spin += 0.3;
    b.cnt++;

    if (b.phase === 'spell1') { spellFire(b.cfg.spells[0], sp); return; }
    if (b.phase === 'spell2' && b.cfg.spells[1]) { spellFire(b.cfg.spells[1], sp); return; }
    if (b.phase === 'spell3' && b.cfg.spells[2]) { spellFire(b.cfg.spells[2], sp); return; }
    if (b.phase === 'time' && b.cfg.timeSpell) { timeFire(b.cfg.timeSpell.name, sp); return; }

    // 通常攻击: 三套模式每 5 秒轮换, 不再固定一环三狙
    normalFire(Math.floor(b.t / 5) % 3, sp);
    if (STG.main.sfx) STG.main.sfx.eshot();   // Boss 开火音效(全局节流)
  }

  // ── 通常攻击模式库(按血段/时间轮换; 弹色按角色设定 cfg.n1 主色 / n2 副色) ──
  function normalFire(idx, sp) {
    var eb = STG.bullets;
    var px = STG.player.x, py = STG.player.y;
    var n1 = b.cfg.n1 || 'b3', n2 = b.cfg.n2 || 'b1';
    if (idx === 0) {
      // 环形弹 + 自机狙
      eb.pRing(b.x, b.y, 10 + b.seg * 2, sp * 0.6, n1, b.spin);
      eb.pAimed(b.x, b.y, px, py, sp * 1.3, 0, n2, 1 + b.seg);
    } else if (idx === 1) {
      // 宽扇面(朝下) + 侧翼降雨 + 双发狙
      eb.pFan(b.x, b.y, Math.PI / 2, 7 + b.seg, 2.4, sp * 0.8, n1);
      eb.fire(STG.rnd(30, C.W - 30), -16, Math.PI / 2, sp * 0.55, n2);
      eb.pAimed(b.x, b.y, px, py, sp * 1.4, 0, n2, 2);
    } else {
      // 大玉缓压(追踪) + 定向扇 + 三发狙
      eb.fire(b.x + STG.rnd(-60, 60), b.y + STG.rnd(-20, 20), Math.PI / 2, sp * 0.45, 'b6', { home: 2.2 });
      eb.pFan(b.x, b.y, STG.angleTo(b.x, b.y, px, py), 5, 1.4, sp * 0.9, n2);
      eb.pAimed(b.x, b.y, px, py, sp * 1.5, 0, n2, 3);
    }
  }

  // ── 符卡弹幕(按名字差异化) ──
  function spellFire(name, sp) {
    var eb = STG.bullets;
    var px = STG.player.x, py = STG.player.y;
    switch (name) {
      // ── 琪露诺(加强: 高密度高弹速) ──
      case '冰符·完美冻结':   // 冰扇朝玩家方向(向下)铺开 + 蓝菱自机狙
        eb.pFan(b.x, b.y, Math.PI / 2, 12, 4.0, sp * 1.0, 'b3');
        eb.pFan(b.x, b.y, Math.PI / 2, 12, 4.0, sp * 0.72, 'b1');
        eb.pAimed(b.x, b.y, px, py, sp * 1.5, 0, 'b3', 2);
        break;
      case '霜符·冻气蔓延':   // 冰晶菱形编队: 悬停成菱 → 锁定齐射 + 本体冰扇
        if (b.cnt % 5 === 1) {
          var dpts = diamondPoints(b.x, b.y - 20, 95);
          for (var di = 0; di < dpts.length; di++) {
            eb.fire(dpts[di][0], dpts[di][1], -Math.PI / 2, sp * 0.8, 'b3', { hold: 0.9 });
          }
        }
        eb.pFan(b.x, b.y, Math.PI / 2 + (b.cnt % 2 ? 0.35 : -0.35), 4, 1.0, sp * 0.85, 'b3');
        eb.pAimed(b.x, b.y, px, py, sp * 1.2, 0, 'b3', 2);
        break;
      // ── 芙兰朵露 ──
      case '禁忌·红魔法':
        eb.pRing(b.x, b.y, 16, sp * 0.75, 'b2', b.spin);
        eb.pRing(b.x, b.y, 16, sp * 0.75, 'b1', b.spin + Math.PI / 16);
        if (Math.floor(b.t * 3) % 2 === 0) eb.pAimed(b.x, b.y, px, py, sp * 1.6, 0, 'b2', 2);
        break;
      case '秘弹·莱瓦汀': {   // 红色激光大剑: 全屏长剑缓速扫 3/4 圆弧, 剑刃扫过处每 60px 生成红毛玉
        // 剑未激活或已扫完 → 重新出剑
        if (b.laiT === undefined || b.t - b.laiT > 2.4) {
          var sw = Math.floor(b.t / 6) % 2 === 0 ? 1 : -1;
          b.laiA0 = -Math.PI / 2 - sw * (Math.PI * 3 / 4);
          b.laiDir = sw;
          b.laiT = b.t;
          eb.fireLaser(b.x, b.y, b.laiA0, {
            w: 24, warn: 0.6, dur: 2.4, len: 640, color: '#ff5b5b',
            spin: sw * (Math.PI * 1.5 / 2.4)                          // 270° / 2.4s
          });
        }
        // 剑刃当前扫过位置: 沿剑身每 60px 一颗红毛玉(两拍覆盖全刃)
        var lp = (b.t - b.laiT) / 2.4;
        var cur = b.laiA0 + b.laiDir * (Math.PI * 1.5) * lp;
        var phase = b.cnt % 2;
        for (var d1 = 100 + phase * 60; d1 <= 640; d1 += 120) {
          eb.fire(b.x + Math.cos(cur) * d1, b.y + Math.sin(cur) * d1, cur, sp * 0.4, 'b2', { home: 1.8 });
        }
        eb.pAimed(b.x, b.y, px, py, sp * 1.2, 0, 'b2', 1);
        break;
      }
      // ── 风见幽香 ──
      case '花符·幻想乡的开花': {   // 向日葵开花: 花型编队悬停后径向绽放(参考花映塚)
        if (b.cnt % 2 === 1) {
          var bx0 = STG.rnd(80, C.W - 80), by0 = STG.rnd(90, 300);
          var n1 = 8, n2 = 12;
          for (var p1 = 0; p1 < n1; p1++) {
            var pa1 = (Math.PI * 2 * p1) / n1;
            eb.fire(bx0 + Math.cos(pa1) * 26, by0 + Math.sin(pa1) * 26, pa1, sp * 0.55, 'b5', { hold: 0.8, radial: true });
          }
          for (var p2 = 0; p2 < n2; p2++) {
            var pa2 = (Math.PI * 2 * p2) / n2 + 0.26;
            eb.fire(bx0 + Math.cos(pa2) * 52, by0 + Math.sin(pa2) * 52, pa2, sp * 0.65, 'b1', { hold: 0.8, radial: true });
          }
          eb.fire(bx0, by0, Math.PI / 2, sp * 0.4, 'b6');   // 花芯大玉
        }
        eb.pAimed(b.x, b.y, px, py, sp * 1.3, 0, 'b1', 2);
        break;
      }
      case '春花·幻想春花':   // 巨大花朵缓缓降下, 花瓣环缓降 + 大玉花芯
        if (b.cnt % 3 === 1) {
          var fx = STG.rnd(70, C.W - 70);
          for (var fi = 0; fi < 10; fi++) {
            var fa = (Math.PI * 2 * fi) / 10;
            eb.fire(fx + Math.cos(fa) * 34, -10, Math.PI / 2 + fa * 0.3, sp * 0.32, 'b1');
          }
          eb.fire(fx, -10, Math.PI / 2, sp * 0.25, 'b6');
        }
        if (b.cnt % 3 === 0) eb.pAimed(b.x, b.y, px, py, sp * 1.35, 0, 'b1', 3);
        break;
      // ── 蕾米莉亚 ──
      case '神枪·冈格尼尔': {   // 圣枪连射: 轰击玩家上一时刻位置(五连错峰) + 横向弹幕
        var tx = (b.gunX === undefined) ? px : b.gunX;
        b.gunX = px;   // 记录本时刻位置 → 下次发射用的就是"上一时刻"
        if (b.cnt % 5 === 4) {
          for (var gi = 0; gi < 5; gi++) {
            eb.fireLaser(tx, -20, Math.PI / 2, { w: 9, warn: 0.5 + gi * 0.22, dur: 0.55 });
          }
        } else {
          eb.fireLaser(tx, -20, Math.PI / 2, { w: 9, warn: 0.55, dur: 0.55 });
        }
        var gang = STG.angleTo(b.x, b.y, tx, py);
        eb.pFan(b.x, b.y, gang, 5, 1.0, sp * 1.1, 'b2');
        break;
      }
      case '夜符·黑夜狂欢':   // 黑夜降临(视野受限): 纯环形弹幕
        eb.pRing(b.x, b.y, 16, sp * 0.6, 'b1', b.spin);
        if (Math.floor(b.t * 2) % 2 === 0) eb.pRing(b.x, b.y, 12, sp * 0.78, 'b2', -b.spin * 0.8);
        eb.pAimed(b.x, b.y, px, py, sp * 1.2, 0, 'b2', 1);
        break;
      // ── 八云紫 ──
      case '不思议结界': {   // 四角环弹 + 两道结界激光连续投射(降频: 每 3 拍一对)
        fourCornerRing(sp * 0.6, 'b1');
        if (b.cnt % 3 === 1) {
          var cpts = [[70, 40], [C.W - 70, 40], [70, 150], [C.W - 70, 150]];
          var li1 = (b.cnt % 2) * 2;                       // 左对/右对交替
          eb.fireLaser(cpts[li1][0], cpts[li1][1], Math.atan2(py - cpts[li1][1], px - cpts[li1][0]), { w: 9, warn: 0.8, dur: 1.2 });
          var li2 = li1 + 1;
          eb.fireLaser(cpts[li2][0], cpts[li2][1], Math.atan2(py - cpts[li2][1], px - cpts[li2][0]), { w: 9, warn: 1.4, dur: 1.2 });
        }
        eb.pAimed(b.x, b.y, px, py, sp * 1.4, 0, 'b5', 2);
        break;
      }
      case '境符·梦与现实':   // 随机弹雨(加密) + 追踪大玉 + 自机狙雨
        for (var r = 0; r < 11; r++) {
          eb.fire(STG.rnd(40, C.W - 40), STG.rnd(-10, 80), Math.PI / 2 + STG.rnd(-0.3, 0.3), sp * STG.rnd(0.5, 0.9), 'b3');
        }
        if (b.cnt % 4 === 2) {
          eb.fire(STG.rnd(60, C.W - 60), STG.rnd(-10, 40), Math.PI / 2, sp * 0.4, 'b6', { home: 2.5 });
        }
        eb.pAimed(b.x, b.y, px, py, sp * 1.4, 0, 'b2', 3);
        break;
      case '罔两·八云紫的神隐': {   // 结界环: 以玩家为中心浮现大环, 悬停后齐射
        if (b.cnt % 4 === 1) {
          var rn = 14, rr = 95;
          for (var vi = 0; vi < rn; vi++) {
            var va = (Math.PI * 2 * vi) / rn;
            eb.fire(px + Math.cos(va) * rr, py + Math.sin(va) * rr, va + Math.PI, sp * 0.5, 'b5', { hold: 0.9 });
          }
        }
        eb.pRing(b.x, b.y, 10, sp * 0.5, 'b1', -b.spin);
        break;
      }
      // ── 幽幽子 ──
      case '亡我乡·无道之道': // 大玉缓速主扇 + 蓝毛玉副扇
        eb.pFan(b.x, b.y, Math.PI / 2, 9, 4.6, sp * 0.42, 'b6');
        eb.pFan(b.x, b.y, Math.PI / 2, 11, 5.0, sp * 0.55, 'b3');
        break;
      case '死符·逆死之蝶': {   // 螺旋正转 3s → 倒转; 折返弹从对面回来; 高密度
        var dir = Math.floor(b.t / 3) % 2 === 0 ? 1 : -1;
        b.spin += 0.5 * dir;
        eb.pSpiral(b.x, b.y, b.spin, sp * 0.6, 'b5');
        eb.pSpiral(b.x, b.y, b.spin + Math.PI, sp * 0.6, 'b5');
        eb.pSpiral(b.x, b.y, b.spin + Math.PI / 2, sp * 0.5, 'b1', { wrap: true });
        eb.pSpiral(b.x, b.y, b.spin + Math.PI * 1.5, sp * 0.5, 'b1', { wrap: true });
        break;
      }
      case '樱符·樱吹雪': {   // 樱花编队: 五瓣樱花悬停齐射 + 花瓣雨
        if (b.cnt % 5 === 1) {
          var spts = sakuraPoints(px, py - 120, 95, 45);
          for (var ki = 0; ki < spts.length; ki++) {
            eb.fire(spts[ki][0], spts[ki][1], Math.PI / 2, sp * 0.55, 'b5', { hold: 1.0 });
          }
        }
        for (var si = 0; si < 4; si++) {
          eb.fire(STG.rnd(20, C.W - 20), STG.rnd(-14, 40), Math.PI / 2 + STG.rnd(-0.5, 0.5), sp * STG.rnd(0.35, 0.6), 'b5');
        }
        break;
      }
      default:
        eb.pRing(b.x, b.y, 14, sp * 0.6, 'b1', b.spin);
        eb.pAimed(b.x, b.y, px, py, sp * 1.3, 0, 'b1', 1);
    }
  }
  // 四角结界: 四个角落放环形弹
  function fourCornerRing(sp, type) {
    var eb = STG.bullets;
    var pts = [ [70, 40], [C.W - 70, 40], [70, 150], [C.W - 70, 150] ];
    for (var i = 0; i < pts.length; i++) {
      eb.pRing(pts[i][0], pts[i][1], 8, sp, type, b.spin + i);
    }
  }

  // ── 编队取点 ──
  // 菱形(冰块意象): 沿菱形四边均匀取 n 点
  function diamondPoints(cx, cy, r) {
    var pts = [], per = 5;
    var c = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < per; j++) {
        var k = j / per;
        pts.push([c[i][0] + (c[(i + 1) % 4][0] - c[i][0]) * k, c[i][1] + (c[(i + 1) % 4][1] - c[i][1]) * k]);
      }
    }
    return pts;
  }
  // 蝴蝶曲线(幽幽子): 参数化蝴蝶方程取 n 点
  function butterflyPoints(cx, cy, s, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (Math.PI * 2 * i) / n;
      var rr = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.pow(Math.sin(t / 12), 5);
      pts.push([cx + Math.sin(t) * rr * s * 0.55, cy - Math.cos(t) * rr * s * 0.48]);
    }
    return pts;
  }

  // 樱花(五瓣玫瑰曲线 r=|cos2.5θ|)
  function sakuraPoints(cx, cy, R, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var t = (Math.PI * 2 * i) / n;
      var rr = R * Math.abs(Math.cos(2.5 * t));
      pts.push([cx + Math.sin(t) * rr, cy - Math.cos(t) * rr]);
    }
    return pts;
  }

  // ── 时符弹幕(最终相位, Boss 无敌, 高密度压制) ──
  function timeFire(name, sp) {
    var eb = STG.bullets;
    var px = STG.player.x, py = STG.player.y;
    switch (name) {
      case '九秒的冰狱':      // 冰柱天降 + 双旋大玉 + 自机狙
        for (var i1 = 0; i1 < 10; i1++) {
          eb.fire(C.W * (i1 + 0.5) / 10, -16, Math.PI / 2 + STG.rnd(-0.12, 0.12), sp * 0.5, 'b3');
        }
        eb.pSpiral(b.x, b.y, b.spin, sp * 0.55, 'b6');
        eb.pSpiral(b.x, b.y, b.spin + Math.PI, sp * 0.55, 'b6');
        eb.pAimed(b.x, b.y, px, py, sp * 1.25, 0, 'b3', 3);
        break;
      case '毁灭之夜': {      // 红色双排螺旋: 起手即密, 越来越快越来越密(时符不发射紫弹)
        var prog = 1 - b.timeT / (b.cfg.timeSpell ? b.cfg.timeSpell.dur : 30);
        b.spin += 0.42 + 0.5 * prog;                        // 转速递增
        var arms = 3 + Math.floor(prog * 1.99);             // 3 → 4 臂
        var asp = sp * (0.55 + 0.32 * prog);                // 弹速递增
        for (var ai = 0; ai < arms; ai++) {
          eb.pSpiral(b.x, b.y, b.spin + (Math.PI * 2 * ai) / arms, asp, 'b2');
          eb.pSpiral(b.x, b.y, b.spin + (Math.PI * 2 * ai) / arms + 0.18, asp * 0.92, 'b2');
        }
        break;
      }
      case '花之困境': {      // 四向激光十字: 主臂锚定正下方摆动, 不再转到水平
        if (Math.floor(b.t * 0.8) % 4 === 0) {
          var la = Math.PI / 2 + Math.sin(b.spin * 0.8) * 0.55;
          for (var q1 = 0; q1 < 4; q1++) {
            eb.fireLaser(C.W / 2, 120, la + q1 * Math.PI / 2, { w: 12, warn: 0.9, dur: 1.6 });
          }
        }
        eb.pFan(b.x, b.y, b.spin, 6, 1.2, sp * 0.7, 'b1');
        eb.pFan(b.x, b.y, -b.spin * 0.7 + Math.PI, 6, 1.2, sp * 0.7, 'b3');
        break;
      }
      case '永夜红月': {      // 追踪圣枪激光 + 环狙 + 三颗追踪大玉
        if (Math.floor(b.t * 0.7) % 5 === 0) {
          eb.fireLaser(b.x, b.y, Math.atan2(py - b.y, px - b.x), { w: 14, warn: 0.8, dur: 1.4 });
        }
        eb.pRing(b.x, b.y, 18, sp * 0.55, 'b2', b.spin);
        if (b.cnt % 3 === 0) {
          for (var h1 = 0; h1 < 2; h1++) {
            eb.fire(b.x + STG.rnd(-50, 50), b.y + STG.rnd(-20, 20), STG.rnd(0, Math.PI * 2), sp * 0.4, 'b6', { home: 2.6 });
          }
        }
        break;
      }
      case '境界之牢': {      // 牢笼: 同向异速激光车道切割全场(12s 消散), 环弹触界反弹
        if (b.cnt % 16 === 1) {
          // 纵车道全部向右漂, 横车道全部向下漂; 快慢不同形成动态间隙
          eb.fireLaser(70, -10, Math.PI / 2, { w: 8, warn: 1.2, dur: 12, vx: 20 });
          eb.fireLaser(200, -10, Math.PI / 2, { w: 8, warn: 1.6, dur: 12, vx: 34 });
          eb.fireLaser(330, -10, Math.PI / 2, { w: 8, warn: 2.0, dur: 12, vx: 26 });
          eb.fireLaser(-10, 150, 0, { w: 8, warn: 1.4, dur: 12, vy: 16 });
          eb.fireLaser(-10, 300, 0, { w: 8, warn: 1.8, dur: 12, vy: 24 });
        }
        eb.pRing(b.x, b.y, 9, sp * 0.5, 'b1', -b.spin * 1.3, { bounce: true });
        if (b.cnt % 2 === 0) eb.pSpiral(b.x, b.y, b.spin * 0.8, sp * 0.6, 'b5', { bounce: true });
        break;
      }
      case '无常之春': {      // 蝴蝶编队: 弹幕在屏幕上组成蝴蝶 → 锁定齐射 + 双旋大玉
        if (b.cnt % 6 === 1) {
          var bpts = butterflyPoints(C.W / 2, 235, 105, 44);
          for (var bi = 0; bi < bpts.length; bi++) {
            eb.fire(bpts[bi][0], bpts[bi][1], Math.PI / 2, sp * 0.7, 'b5', { hold: 1.1 });
          }
        }
        eb.pSpiral(b.x, b.y, b.spin, sp * 0.62, 'b6');
        eb.pSpiral(b.x, b.y, b.spin + Math.PI, sp * 0.62, 'b6');
        break;
      }
      default:
        eb.pRing(b.x, b.y, 18, sp * 0.55, 'b1', b.spin);
        eb.pAimed(b.x, b.y, px, py, sp * 1.3, 0, 'b1', 3);
    }
  }

  // 符卡/炸弹对其造成伤害(跨段扣血; 时符期间无敌)
  function damage(dmg) {
    if (!b || b.dead || b.phase === 'enter' || b.phase === 'dying' || b.phase === 'time') return;
    b.hp -= dmg;
    if (b.hp <= 0) { b.hp = 0; enterPhase('dying'); }
  }

  // 魔炮光束(逐帧): 接触越久伤害越高, 脱离从零累计
  function beamHit(dt, base) {
    if (!b || b.dead || b.phase === 'enter' || b.phase === 'dying' || b.phase === 'time') {
      if (b) b.beamT = 0;
      return;
    }
    if (dt > 0) {
      b.beamT = (b.beamT || 0) + dt;
      var mul = 1 + Math.min(1.5, b.beamT * 3.0);
      b.hp -= base * mul * dt;
      if (b.hp <= 0) { b.hp = 0; enterPhase('dying'); }
    } else {
      b.beamT = 0;
    }
  }

  // 符卡演出被 bomb/中弹弄脏(取消取得资格)
  function markSpellDirty() {
    if (b && (b.phase === 'spell1' || b.phase === 'spell2' || b.phase === 'spell3')) b.spellDirty = true;
  }

  function draw(ctx, assets) {
    if (!b || b.dead) return;
    var blink = b.phase === 'dying' && Math.floor(b.dying * 20) % 2 === 0;
    if (blink) return;
    var x = b.x, y = b.y;
    var col = b.cfg.color;

    // 旋转光环
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.t * 1.5);
    ctx.strokeStyle = hexA(col, 0.45);
    ctx.lineWidth = 2;
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 44 + i * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 本体: 立绘
    var img = assets[b.cfg.img];
    if (img) {
      var iw = 116, ih = Math.round(img.height * iw / img.width);
      var alpha = 0.92;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, x - iw / 2, y - ih + 24, iw, ih);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hexA(col, 0.25);
      ctx.beginPath();
      ctx.ellipse(x, y + 26, 46, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // 名字
    ctx.textAlign = 'center';
    ctx.font = '700 15px sans-serif';
    ctx.fillStyle = '#ffe8b0';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText(b.cfg.name, x, b.y - 78);
    ctx.shadowBlur = 0;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = col;
    ctx.fillText(b.cfg.title, x, b.y - 64);
  }
  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), bl = parseInt(h.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + bl + ',' + a + ')';
  }

  function clear() { b = null; }
  function alive() { return !!(b && !b.dead); }
  function isMini() { return !!(b && b.mini); }

  return {
    start: start, update: update, draw: draw, damage: damage, beamHit: beamHit, markSpellDirty: markSpellDirty,
    clear: clear, alive: alive, isMini: isMini,
    hpPct: function() { return b ? Math.max(0, b.hp / (b.segHp * b.phases.length)) : 0; },
    phaseName: phaseName, segName: segName, cfgName: cfgName,
    get timeFrac() {
      return (b && b.phase === 'time' && b.cfg.timeSpell) ? Math.max(0, b.timeT / b.cfg.timeSpell.dur) : 0;
    },
    get segCount() { return b ? b.phases.length : 5; },
    get banner() {
      return (b && b.bannerT > 0)
        ? { kind: b.bannerKind, name: b.bannerName, sub: b.cfg.title, img: b.cfg.img, t: b.bannerT, dur: b.bannerDur }
        : null;
    },
    get lockT() { return b ? b.lockT : 0; },
    get x() { return b ? b.x : -999; }, get y() { return b ? b.y : -999; }
  };
})();
