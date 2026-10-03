// =============================================
//  类人群星闪耀时 · 数据 + 渲染逻辑
//
//  店主唯一需要编辑的文件就是这个:
//    qq          投稿 QQ
//    background  外星人背景故事(lines 数组, 一段一句)
//                以「开头的行会自动高亮
//    personas    评论角色固定人设(改名字/头像在这里)
//    stories     正文目录(最新一期放最前面)
//    comments    每篇的伪评论区(key = 故事 id)
//
//  正文段落类型 t:
//    h2   小节标题     p   普通段落
//    q    引文/对话    note 灰色旁白
//
//  伪评论 who 取值:
//    'owner' / 'alienA' / 'alienB'  引用 personas 里的人设
//    'npc'                          内联 name + avatar
//    'system'                       系统提示条, 只需 text
//    可选字段: time / likes / pin(置顶)
//
//  两个页面共用本文件:
//    human-stars.html      目录页
//    human-star.html?id=xx 正文页
// =============================================
window.MMS_STARS = {
  // ── 投稿 ──
  qq: '3895418161',

  // ── 全站声明 ──
  disclaimer: '本站收录的所有故事均为完全虚构，如有雷同纯属巧合。',

  // ── 外星人背景故事 ──
  background: {
    code: 'MHS-0001',
    title: '坠落的飞船',
    from: '目击者自述 · 城区主街 · 时间不明',
    level: '已归档',
    lines: [
      '昨天晚上，我走在街上，大街上一个人都没有。天上掉下来一个东西。',
      '不是流星。它在我面前悬了大概半秒，然后一头栽进路边的停车场。',
      '坑里爬出两个外星人。绿帽怪物。其中一个扶着道旁的电线杆子哇哇吐。',
      '另一个晃过来，掏出一块发光的石头给我看，翻译石。上面写着中文。',
      '翻译过来大概是：他们是比邻星来的，对地球好奇，不远万万万里来到这边。',
      '他们那边根本没有「猎奇小故事」这种东西。新闻只有「今天天气正常」「今天配给正常」。',
      '他们俩在抖音上看了两条地球短视频之后，大受震撼，说这不合理，这非常不合理，所有人类作为同一个物种，为何具有如此丰富的多样性？',
      '所以他们俩要收集这种逆天小故事。一天一条。写得越离谱越好，好让他们带回去存档，档案名叫「类人群星闪耀时」。',
      '不给也行。他们回程的舱里有一个合适我的空位置。进去就关舱门，出来的时候已经不在地球户口本上了。',
      '我答应了。创立了这个网站，专门帮他们收集逆天小故事。',
      '「相较于文明，荒诞才是常态。所以他们的夜晚，永远不缺故事。」外星人如是说。'
    ]
  },

  // ── 评论角色固定人设 ──
  personas: {
    owner:  { name: '店主', avatar: '🧹', badge: '站长',       cls: 'owner', from: '地球' },
    alienA: { name: '佐格', avatar: '🛸', badge: '外星观察员', cls: 'alien', from: '比邻星 b' },
    alienB: { name: '图鲁', avatar: '👽', badge: '外星观察员', cls: 'alien', from: '比邻星 b' }
  },

  // ── 正文目录 ──
  stories: [
    {
      id: 'hs-001',
      no: 'A01',
      date: '2026-10-01',
      tag: '群聊见闻',
      title: 'Z先生异闻录',
      brief: '他给自己捏了个「穷困女大学生」人设，最后被一张快递单给单杀了。',
      read: '约 6 分钟',
      body: [
        { t: 'h2', x: '零 · 前言' },
        { t: 'p',  x: '作为Z世代及以后的年轻孩子们，对于网络诈骗一词想必不陌生，而我们今天要讲的这个故事，虽说也该归因于此类，却不尽相同。' },

        { t: 'h2', x: '一 · 缘起' },
        { t: 'p',  x: 'Z 生在一个普通的农民家庭。父母感情不和，他很小的时候离了婚，此后跟着母亲生活。母亲对他颇为严格，什么事都不许他做，从小到大几乎没碰过手机。' },
        { t: 'p',  x: '于是他变得怯懦、内向。成绩不算出众，但也够他上一所大学。' },
        { t: 'p',  x: '故事从这里开始。' },
        { t: 'p',  x: '大学宿舍四人间，室友性格各异。Z 起初还算合群，偶尔一起吃饭，讨论功课。但相较于无聊乏味的现实生活，他更偏爱此前从未见过的——网络上的热闹。' },
        { t: 'p',  x: '他开始混迹各种网络社群。起初只是旁观：看别人互相吹捧，互相攻击。' },
        { t: 'p',  x: '某天他灵光一现：自己为什么不能成为别人口中的风云人物？' },
        { t: 'p',  x: '他这辈子从没享受过关注，那就在互联网上享受一次。' },
        { t: 'p',  x: '于是他换了一个新群。' },

        { t: 'h2', x: '二 · 另一个人设' },
        { t: 'p',  x: '这一次，他给自己选了一张完全不同的身份：一个瘦弱的、不善言辞的宅女。' },
        { t: 'p',  x: '声音软，语气怯，偶尔用一些半通不通、半日半中的句子说「瓦达西……要闹了」。' },
        { t: 'p',  x: '他时不时分享自己不幸的原生家庭，讲室友如何排挤他，把自己描述成一个可怜巴巴的、长期被霸凌的女孩子。' },
        { t: 'p',  x: '互联网最不缺的就是炫压抑的宅男。这个群很快接受了他。' },
        { t: 'p',  x: '管理员对他分外照顾，偶尔给他发个红包。群里的空气也渐渐被他影响。谁要是不顺着他，就会被送上一飞机票。' },
        { t: 'p',  x: '他自己也热爱装穷，时不时开口，说自己没钱生活、吃不起饭，要一点生活费。若有人真的给了，他便心安理得地收下，然后继续扮演那个需要被保护的人。' },

        { t: 'h2', x: '三 · 金币刷得太慢' },
        { t: 'p',  x: '不过他很快觉得，「原生家庭不幸、被霸凌、身无分文的可怜宅女」这套组合还不够用。' },
        { t: 'note', x: '以这个速度爆金币，还是太慢了。' },
        { t: 'p',  x: '于是他开始换一种打法：搞rsq。' },
        { t: 'p',  x: '每天不厌其烦地描述自己今天穿了什么、甚至买了条黑丝袜穿上发在群里。晚上躲在被子里“一个人寂寞难耐！”，偷偷做一些R18的事情（恕不展开叙述）。' },
        { t: 'p',  x: '他把这些事情形容得声情并茂，格外生动。这就深深吸引了一些本就压抑的小楚南的目光。' },
        { t: 'p',  x: '除此之外，他还给自己发明了一套自造的中日结合的口头禅——' },
        { t: 'q',  x: '「瓦达西……要闹了。」' },
        { t: 'p',  x: '没人知道这六个字合在一起是什么意思。他说是日语，语义完全不通。但配上那种怯生生的语气，莫名其妙地对小楚南们有了杀伤力。' },
        { t: 'p',  x: '他们被一点点点燃。有人开始主动接近他，私下聊天、嘘寒问暖，甚至寄东西给他。' },

        { t: 'h2', x: '四 · 不断投喂' },
        { t: 'p',  x: '某天，一位网友私信他：刚发了工资，可以帮他买瓶洗发水，他钱在另一个软件里取不出来。' },
        { t: 'p',  x: '他回得飞快：「谢谢哥哥，我今天就买。」' },
        { t: 'p',  x: '当天下午，一张付款截图发进群里。' },
        { t: 'note', x: '18.88 元。备注：洗发水 + 运费。' },
        { t: 'p',  x: '渐渐的，给他赚钱投喂成了常态，他也颇享受这个过程，但是一切命运的馈赠，都有它的代价。' },

        { t: 'h2', x: '五 · 倒垃圾' },
        { t: 'p',  x: '从这时起，他开始频繁地攻击自己的原生家庭。' },
        { t: 'p',  x: '讲他的“生物爹”如何刻薄，讲家里如何不给他生活费，又是如何家暴他的。' },
        { t: 'p',  x: '骂累了就转向室友：说自己被孤立、被针对、被从房间里赶出去。' },
        { t: 'q',  x: '「我不想报警。」' },
        { t: 'q',  x: '「算了，反正我走了就好了。」' },
        { t: 'q',  x: '「反正也没有人真的关心我。」' },
        { t: 'p',  x: '刚开始，大家还可怜他，或是安慰，或是转点零花钱。' },
        { t: 'p',  x: '但长此以往，就变味了，大家越来越觉得这个人的动机不纯。是不是过于要画面？是不是另有所图？' },

        { t: 'h2', x: '六 · 快递地址' },
        { t: 'p',  x: '终于，一个网友在群里发了一句：' },
        { t: 'q',  x: '「他上次让我寄的洗发水，我查了单号。」' },
        { t: 'p',  x: '下面贴出一张面单截图。' },
        { t: 'p',  x: '收件地址写得很完整：某学校 xx栋学生公寓。' },
        { t: 'q',  x: '「我怎么查到，这个地址是男生公寓？」' },
        { t: 'p',  x: '群聊几乎炸了' },
        { t: 'q',  x: '「我们这些天，是在看一个男的演女大学生？」' },
        { t: 'p',  x: '受害者有的报警，有的觉得羞耻忍气吞声，最后群主站了出来，要求钱和礼物一一退还。' },
        { t: 'p',  x: '有人翻出他自己发过的转账记录，一笔一笔核。有一部分已经花掉了，他说他会补上。' },

        { t: 'h2', x: '七 · 故事终局' },
        { t: 'p',  x: 'Z离开了，群里没有人再提过Z的网名。' },
        { t: 'p',  x: '但「瓦达西，要闹了」留了下来，成了那个群最长寿的梗。时刻警醒着想要网恋的后人。' },
        { t: 'p',  x: '后来有人给他拉回来，问他为什么这么干。' },
        { t: 'p',  x: '他的回答只有一句：' },
        { t: 'q',  x: '「我不知道怎么和人处好关系。所以只好编一个故事。」' },
        { t: 'p',  x: '说完这句，他又退群了。' }
      ]
    }
  ],

  // ── 伪评论区(纯展示, 结构上无法提交) ──
  comments: {
    'hs-001': [
      { who: 'owner',  pin: true, time: '2026-10-01 23:40', likes: 41,   text: '网恋有风险。转账需谨慎。' },
      { who: 'alienA', time: '2026-10-02 03:12', likes: 9999, text: '相较于骗钱的 Z，我更想知道心甘情愿掏钱的都是什么人。' },
      { who: 'npc', name: '不吃香菜', avatar: '🥬', time: '2026-10-02 09:07', likes: 7, text: '啊？我就是给他买洗发水那个。' },
      { who: 'alienB', time: '2026-10-03 01:11', likes: 8888, text: '该个体的行为模式已录入第 7 星区珍稀案例库。备注：其虚构身份的持续时间，超过本星球一次公转周期的五分之一。建议归类为「长期沉浸型」。' },
      { who: 'alienA', time: '2026-10-03 04:20', likes: 7777, text: '驳回上一条归类。补充观察：其在身份暴露后，口癖仍保留使用价值，已收录入本星球语言库，编号 HZ-77。批准：舱位暂缓执行。' },
      { who: 'npc', name: '匿名观测者', avatar: '🕴', time: '2026-10-03 22:15', likes: 3, text: '所以他最后那句是真心的，还是习惯性的？' },
      { who: 'system', text: '本评论区为虚构内容。点赞不会上传任何数据，也无法提交评论。' }
    ]
  }
};

// =============================================
//  渲染
// =============================================
(function () {
  var DATA = window.MMS_STARS;
  if (!DATA) return;

  var READ_KEY = 'human_stars_read_v1';
  var LIKE_KEY = 'human_stars_likes_v1';
  var list = DATA.stories || [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function ls(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function getRead() { return ls(READ_KEY, {}); }
  function markRead(id) { var r = getRead(); r[id] = 1; lsSet(READ_KEY, r); }
  function getLikes() { return ls(LIKE_KEY, {}); }

  // 轻提示(复用 common.css 的 .mms-toast 样式)
  function toast(msg) {
    var old = document.getElementById('mmsToast');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var t = document.createElement('div');
    t.id = 'mmsToast';
    t.className = 'mms-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 2000);
  }

  function isBgHL(line) { return line.charAt(0) === '「'; }

  // 页脚(免责声明 + 投稿)
  function footHTML() {
    return '<div class="hs-foot">' +
      '<div class="hs-disc">' + esc(DATA.disclaimer) + '</div>' +
      '<div class="hs-qq">看到好的故事？<b>加店主 QQ ' + esc(DATA.qq) + '</b> 投稿</div>' +
      '</div>';
  }

  // ── 伪评论区 ──
  function personaOf(c) {
    if (c.who === 'system') return { cls: 'system' };
    var ps = DATA.personas || {};
    var p = ps[c.who];
    if (p) return p;
    return {
      name: c.name || '匿名观测者',
      avatar: c.avatar || '👤',
      badge: c.badge || '',
      cls: 'npc',
      from: c.from || '地球'
    };
  }

  function commentsHTML(sid) {
    var arr = (DATA.comments || {})[sid] || [];
    var likes = getLikes();

    var h = '<div class="cm-section" id="comments">' +
      '<div class="cm-head">' +
        '<span class="cm-title">🛸 观测记录</span>' +
        '<span class="cm-sync"><i></i>信号同步中</span>' +
        '<span class="cm-count">' + arr.length + ' 条</span>' +
      '</div>';

    if (!arr.length) {
      h += '<div class="cm-empty">本档案暂无观测记录。</div>';
    } else {
      h += '<div class="cm-list">';
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        var p = personaOf(c);

        if (p.cls === 'system') {
          h += '<div class="cm-item cm-system">' + esc(c.text) + '</div>';
          continue;
        }

        var key = sid + ':' + i;
        var liked = !!likes[key];
        var n = (c.likes || 0) + (liked ? 1 : 0);

        h += '<div class="cm-item cm-' + p.cls + '">' +
          '<div class="cm-ava">' + esc(p.avatar) + '</div>' +
          '<div class="cm-main">' +
            '<div class="cm-meta">' +
              '<span class="cm-name">' + esc(p.name) + '</span>' +
              (p.badge ? '<span class="cm-badge cm-badge-' + p.cls + '">' + esc(p.badge) + '</span>' : '') +
              (c.pin ? '<span class="cm-pin">置顶</span>' : '') +
              '<span class="cm-time">' + esc(c.time || '') + '</span>' +
            '</div>' +
            '<p class="cm-text">' + esc(c.text) + '</p>' +
            '<div class="cm-act">' +
              '<button class="cm-like' + (liked ? ' on' : '') + '" type="button" data-key="' + esc(key) + '" data-base="' + (c.likes || 0) + '" title="点了不会上传任何数据">' +
                '<span class="cm-arrow">▲</span><span class="cm-n">' + n + '</span>' +
              '</button>' +
              '<span class="cm-loc">来自' + esc(p.from || '地球') + '</span>' +
            '</div>' +
            (p.cls === 'alien' ? '<div class="cm-trans">* 翻译石直译，语义可能存在偏差</div>' : '') +
          '</div>' +
        '</div>';
      }
      h += '</div>';
    }

    h += '<div class="cm-form">' +
      '<div class="cm-fake-input" id="cmFakeInput">评论功能已损坏 · 提交键已被拆走</div>' +
      '<button class="cm-fake-send" id="cmFakeSend" type="button" disabled>发送</button>' +
    '</div>' +
    '<div class="cm-hint">本评论区为纯展示的虚构内容，无法提交。<br>投稿请加店主 QQ ' + esc(DATA.qq) + '</div>';

    h += '</div>';
    return h;
  }

  function bindComments() {
    var i;

    var likeBtns = document.querySelectorAll('.cm-like');
    for (i = 0; i < likeBtns.length; i++) {
      likeBtns[i].addEventListener('click', function () {
        var key = this.getAttribute('data-key');
        var base = parseInt(this.getAttribute('data-base'), 10) || 0;
        var m = getLikes();
        var on = !m[key];
        if (on) m[key] = 1; else delete m[key];
        lsSet(LIKE_KEY, m);
        this.classList.toggle('on', on);
        var nEl = this.querySelector('.cm-n');
        if (nEl) nEl.textContent = base + (on ? 1 : 0);
      });
    }

    function nope() {
      toast('提交键已被送往比邻星。投稿请加店主 QQ ' + DATA.qq);
    }
    var fi = document.getElementById('cmFakeInput');
    var fs = document.getElementById('cmFakeSend');
    if (fi) fi.addEventListener('click', nope);
    if (fs) fs.addEventListener('click', nope);
  }

  // ── 正文页滚动词缀: 进度条 + 吸顶迷你标题 ──
  function mountChrome(s) {
    if (document.getElementById('rdBar')) return;

    var bar = document.createElement('div');
    bar.className = 'rd-bar';
    bar.id = 'rdBar';
    bar.innerHTML = '<i></i>';

    var mini = document.createElement('div');
    mini.className = 'rd-mini';
    mini.id = 'rdMini';
    mini.innerHTML = '<span class="rm-no">' + esc(s.no) + '</span>' +
      '<span class="rm-t">' + esc(s.title) + '</span>';

    document.body.appendChild(bar);
    document.body.appendChild(mini);

    var fill = bar.firstChild;
    var ticking = false;

    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var p = max > 8 ? window.scrollY / max : 0;
      p = Math.max(0, Math.min(1, p));
      fill.style.width = (p * 100).toFixed(2) + '%';

      var head = document.querySelector('.st-head');
      var trig = head ? (head.offsetTop + head.offsetHeight - 48) : 220;
      mini.classList.toggle('show', window.scrollY > trig);
      bar.classList.toggle('show', window.scrollY > 8);
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  // ── 目录页 ──
  function renderIndex() {
    var app = document.getElementById('app');
    if (!app || app.getAttribute('data-hs') !== 'index') return;

    var bg = DATA.background;
    var read = getRead();
    var i;

    var h = '';

    h += '<div class="hs-head">' +
      '<div class="hs-badge">🛸 霧雨魔法店 · 特别收录</div>' +
      '<h1>类人群星闪耀时</h1>' +
      '<p class="hs-sub">一天一条逆天小故事。<br>不定期更新 · 数量取决于那两个家伙的耐心</p>' +
    '</div>';

    h += '<div class="hs-disc-bar">' + esc(DATA.disclaimer) + '</div>';

    if (bg) {
      h += '<details class="dossier" open>' +
        '<summary>' +
          '<span class="ds-dot"></span>' +
          '<span class="ds-t">事件档案 ' + esc(bg.code) + '</span>' +
          '<span class="ds-a">' + esc(bg.title) + '</span>' +
          '<span class="ds-arrow">▾</span>' +
        '</summary>' +
        '<div class="ds-meta">' +
          '<span>来源：' + esc(bg.from) + '</span>' +
          '<span>状态：' + esc(bg.level) + '</span>' +
          '<span class="ds-stamp">' + esc(bg.level) + '</span>' +
        '</div>' +
        '<div class="ds-body">';
      for (i = 0; i < bg.lines.length; i++) {
        h += '<p' + (isBgHL(bg.lines[i]) ? ' class="hl"' : '') + '>' + esc(bg.lines[i]) + '</p>';
      }
      h += '</div>' +
        '<div class="ds-sign">—— 记录人：店主 · 街边电线杆下</div>' +
      '</details>';
    }

    h += '<div class="toc-head"><span>📂 收录目录</span><span class="toc-n">' + list.length + ' 篇</span></div>';

    if (!list.length) {
      h += '<div class="toc-empty">档案正在整理中……</div>';
    } else {
      h += '<div class="toc">';
      for (i = 0; i < list.length; i++) {
        var s = list[i];
        var isRead = !!read[s.id];
        h += '<a class="toc-item' + (isRead ? ' is-read' : '') + '"' +
          ' data-no="' + esc(s.no) + '"' +
          ' style="animation-delay:' + Math.min(i * 70, 420) + 'ms"' +
          ' href="human-star.html?id=' + encodeURIComponent(s.id) + '">' +
          '<div class="ti-top">' +
            '<span class="ti-no">' + esc(s.no) + '</span>' +
            '<span class="ti-tag">' + esc(s.tag) + '</span>' +
            '<span class="ti-date">' + esc(s.date) + '</span>' +
            (isRead ? '<span class="ti-ck">✓ 已读</span>' : '') +
          '</div>' +
          '<h3 class="ti-title">' + esc(s.title) + '</h3>' +
          '<p class="ti-brief">' + esc(s.brief) + '</p>' +
          '<div class="ti-foot">' + esc(s.read || '') + '<span class="ti-go">阅读全文 →</span></div>' +
        '</a>';
      }
      h += '</div>';
    }

    h += '<div class="hs-apply">' +
      '<div class="ap-t">📨 投稿通道</div>' +
      '<p class="ap-d">你有没有见过更离谱的？<br>那种听完想报警但又说不清哪里离谱的。</p>' +
      '<div class="ap-qq">店主 QQ<b>' + esc(DATA.qq) + '</b></div>' +
      '<div class="ap-note">私聊时备注「故事 + 你的ID」，我挑得上的当天就收。</div>' +
    '</div>';

    h += footHTML();
    app.innerHTML = h;
  }

  // ── 正文页 ──
  function renderStory() {
    var app = document.getElementById('app');
    if (!app || app.getAttribute('data-hs') !== 'story') return;

    var id = new URLSearchParams(location.search).get('id') || '';
    var idx = -1, i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) { idx = i; break; }
    }

    if (idx === -1) {
      document.title = '档案不存在 · 类人群星闪耀时';
      app.innerHTML =
        '<div class="hs-head">' +
          '<div class="hs-badge">🛸 霧雨魔法店 · 特别收录</div>' +
          '<h1>档案不存在</h1>' +
          '<p class="hs-sub">编号 <b>' + esc(id || '空') + '</b> 不在本店收录范围内。<br>可能是那两个家伙把它带走了。</p>' +
        '</div>' +
        footHTML() +
        '<a class="hs-back" href="human-stars.html">← 返回目录</a>';
      return;
    }

    var s = list[idx];
    markRead(s.id);
    document.title = s.no + ' ' + s.title + ' · 类人群星闪耀时';

    var h = '';
    h += '<div class="st-bar"><a href="human-stars.html">← 目录</a><span class="st-count">' + (idx + 1) + ' / ' + list.length + '</span></div>';

    h += '<div class="st-head">' +
      '<div class="st-meta"><span class="st-no">' + esc(s.no) + '</span><span class="st-tag">' + esc(s.tag) + '</span><span class="st-date">' + esc(s.date) + '</span></div>' +
      '<h1>' + esc(s.title) + '</h1>' +
      '<p class="st-brief">' + esc(s.brief) + '</p>' +
    '</div>';

    h += '<div class="hs-disc-bar">' + esc(DATA.disclaimer) + '</div>';

    h += '<div class="st-body">';
    var leadDone = false;
    for (i = 0; i < s.body.length; i++) {
      var b = s.body[i];
      if (b.t === 'h2') {
        h += '<h2>' + esc(b.x) + '</h2>';
      } else if (b.t === 'q') {
        h += '<blockquote>' + esc(b.x) + '</blockquote>';
      } else if (b.t === 'note') {
        h += '<p class="st-note">' + esc(b.x) + '</p>';
      } else {
        var lead = '';
        if (!leadDone && b.x.length >= 24) { lead = ' class="st-lead"'; leadDone = true; }
        h += '<p' + lead + '>' + esc(b.x) + '</p>';
      }
    }
    h += '</div>';

    h += commentsHTML(s.id);

    h += '<div class="st-nav">';
    if (idx > 0) {
      h += '<a class="st-nav-btn" href="human-star.html?id=' + encodeURIComponent(list[idx - 1].id) + '"><span class="sb-dir">← 上一篇</span><span class="sb-t">' + esc(list[idx - 1].title) + '</span></a>';
    } else {
      h += '<span class="st-nav-btn dis"><span class="sb-dir">← 上一篇</span><span class="sb-t">已经是第一篇了</span></span>';
    }
    if (idx < list.length - 1) {
      h += '<a class="st-nav-btn" href="human-star.html?id=' + encodeURIComponent(list[idx + 1].id) + '"><span class="sb-dir">下一篇 →</span><span class="sb-t">' + esc(list[idx + 1].title) + '</span></a>';
    } else {
      h += '<span class="st-nav-btn dis"><span class="sb-dir">下一篇 →</span><span class="sb-t">后面还在编</span></span>';
    }
    h += '</div>';

    h += footHTML();
    h += '<a class="hs-back" href="human-stars.html">← 返回类人群星闪耀时</a>';

    app.innerHTML = h;

    bindComments();
    mountChrome(s);
  }

  function boot() {
    renderIndex();
    renderStory();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();