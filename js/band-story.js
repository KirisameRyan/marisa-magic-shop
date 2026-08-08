/* =============================================
   乐队人生 · 剧情引擎
   27 节点 · 16 结局 · 存档/隐藏结局/结局特效
   ============================================= */
(function () {
  'use strict';

  var KEY = 'band_story_v1';
  var ENDS_KEY = 'band_story_ends';
  var FAIL_ENDS = ['tuiquan', 'duli', 'langan', 'chaojia', 'moon', 'live', 'taixing'];
  var GOLD_ENDS = { dingliu: 1, potian: 1, yuanshen: 1, shenren: 1 };
  var DANGER_ENDS = { moon: 1, live: 1, taixing: 1 };

  var state = { g: 'm', node: 'n0', flag: 0 };

  function loadEnds() {
    try { return JSON.parse(localStorage.getItem(ENDS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveEnds(keys) {
    try { localStorage.setItem(ENDS_KEY, JSON.stringify(keys)); } catch (e) {}
  }
  function loadState() {
    try { state = JSON.parse(localStorage.getItem(KEY) || '{"g":"m","node":"n0","flag":0}'); }
    catch (e) { state = { g: 'm', node: 'n0', flag: 0 }; }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function clearState() {
    state = { g: 'm', node: 'n0', flag: 0 };
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ═══ 剧情数据 ═══ */

  var NODES = {
    /* ── 第一幕 · 落榜 ── */
    n0: {
      type: 'emotion', act: '第一幕 · 落榜', title: '命运的滑音',
      body: [
        '出成绩那天，你刷新了三次网页。前两次，加载失败。',
        '第三次页面终于出来，你的手停在鼠标上，没点下去。',
        '<b>【未录取】</b>',
        '客厅很安静。你妈坐在那儿，没骂你，就问了一句：<br>"以后怎么办？"',
        '这句话比骂你难受。',
        '晚上你躺床上刷手机，同学们都在发录取通知书。只有你的聊天框，安静得像没人住过。',
        '你翻身，床底露出一角——一把买回来一年、弹过次数两只手数得过来的吉他。',
        '你把它拿出来，擦了擦灰。',
        '反正人生已经偏轨了。<br>那为什么不能偏得更彻底一点？'
      ],
      choices: [
        { label: '🎸 组一支乐队，去当摇滚明星', next: 'n_a1' },
        { label: '🎧 钻研术力口，把音乐变成代码', next: 'n_b1' }
      ]
    },

    /* ── 第二幕 · 术力口线 ── */
    n_b1: {
      type: 'event', act: '第二幕 · 术力口', title: '自学成才',
      body: [
        '你连夜下载了 VOCALOID 编辑器。第一周调出来的音，邻居以为你家养了只电子鸭。',
        '第二周，那只鸭子学会了唱歌。',
        '一个月后，作品发布。播放量 38——其中 20 是你自己刷的。'
      ],
      choices: [
        { label: '🔥 坚持，调到自己满意为止', next: 'n_b2b' },
        { label: '🏷️ 把设备挂二手平台卖了', next: 'n_b2a' }
      ]
    },
    n_b2a: {
      type: 'event', act: '第二幕 · 术力口', title: '二手平台奇遇',
      body: [
        '来取货的是个戴耳机的中二少年。他看看你的设备，看看你，嗤了一声：',
        '"就这水平还玩术力口？"',
        '你愣在原地。',
        '少年走后很久，你盯着那台调音台，忽然问了自己一句：',
        '"我怎么在搞术力口？"',
        '这句话像一记耳光，抽得你耳根发烫。'
      ],
      choices: [
        { label: '🤝 忍了，卖完收工', next: 'END:tuiquan' },
        { label: '🔥 激怒——老子这就去组乐队给你看', next: 'n_a3' }
      ]
    },
    n_b2b: {
      type: 'choice', act: '第二幕 · 术力口', title: '坚持到底',
      body: [
        '三个月，你调出一首像样的歌。B站破百那天你在出租屋尖叫，邻居报了警。',
        '你成了朋友里唯一会调音的人。你决定：组个乐队。'
      ],
      choices: [
        { label: '🎤 找得到成员，一起玩', next: 'n_b3' },
        { label: '🚪 找了一圈没人理', next: 'END:duli' }
      ]
    },
    n_b3: {
      type: 'choice', act: '第二幕 · 术力口', title: '找到队友',
      body: [
        '鼓手是你高中同学，贝斯手是网吧捡的，主唱是楼下奶茶店小妹。',
        '第一次排练结束，你俩对视：这波能火吗？'
      ],
      choices: [
        { label: '💼 当专职工作，稳扎稳打', next: 'END:dingliu' },
        { label: '🌊 炒一波，追泼天流量', next: 'END:potian' }
      ]
    },

    /* ── 第三幕 · 入门 ── */
    n_a1: {
      type: 'event', act: '第三幕 · 入门', title: '系统学习',
      body: [
        '你妈嘴上骂你，手却塞了你五百块："去找个老师好好学。"',
        '城南琴行，老师傅叼着烟，听完你弹的《小星星》，沉默了一会儿：',
        '"还行，没把吉他弹成二胡__G__。"'
      ],
      choices: [
        { label: '📖 认真学完每一节课', next: 'n_a2' },
        { label: '🏃 学两节就跑路', next: 'END:tuiquan' }
      ]
    },
    n_a2: {
      type: 'choice', act: '第三幕 · 入门', title: '关门弟子',
      body: [
        '最后一节课，老师傅把烟掐了："留下来，跟我学三年，手艺全传你。"',
        '你听得出来，他不是在开玩笑。'
      ],
      choices: [
        { label: '🙏 留下，继承衣钵', next: 'END:deyi' },
        { label: '🚪 谢绝老师，出去组乐队', next: 'n_a3' }
      ]
    },
    n_a3: {
      type: 'event', act: '第三幕 · 入门', title: '组乐队',
      body: [
        '你在本地音乐群发帖：《招队友，认真搞乐队，不要求水平，有兴趣就来。》',
        '一天，没人。三天，没人。你准备删帖。',
        '第七天，有人私聊："你们还缺会敲三角铁的吗？"',
        '你沉默五秒，回了个字：缺。',
        '后来他成了你乐队第一任鼓手。所有传奇开始的时候，好像都挺荒唐。'
      ],
      choices: [
        { label: '🤝 全员到齐，开始排练', next: 'n_a4' },
        { label: '💀 三个月零报名', next: 'END:duli' }
      ]
    },

    /* ── 第四幕 · 排练 ── */
    n_a4: {
      type: 'emotion', act: '第四幕 · 排练', title: '第一次排练',
      body: [
        '你们租了个地下室，两小时两百块，贵得像演唱会场地。',
        '第一首歌，三秒，停。',
        '鼓手问速度多少，你说不知道。贝斯手问调呢，你说不知道。',
        '空气安静了几秒。',
        '可排练结束，四个人走出地下室，在路灯下站了一会儿，各回各家。',
        '你走出两条街，手机响了。',
        '是鼓手："下周还排吗？"',
        '你回了一个字：排。',
        '接下来的日子，你打算——'
      ],
      choices: [
        { label: '🎯 把每次排练当 Live 来练', next: 'n_a5' },
        { label: '😴 摸鱼，全靠队友带', next: 'END:langan' },
        { label: '🎶 队友天天说"多练练休止符"（就是不练），你忍不了', next: 'n_a6' }
      ]
    },
    n_a5: {
      type: 'choice', act: '第四幕 · 排练', title: '顶流之路',
      body: [
        '你们在当地酒吧演了几场，视频被传上网，评论区开始刷"顶流"。',
        '你在后台刷手机，两条路摆在面前——'
      ],
      choices: [
        { label: '💼 一场一场接商演，当专职工作', next: 'END:dingliu' },
        { label: '🌊 接住泼天流量，炒作走红', next: 'END:potian' }
      ]
    },

    /* ── 第五幕 · 解散与重组 ── */
    n_a6: {
      type: 'emotion', act: '第五幕 · 解散与重组', title: '解散之后',
      body: [
        '散伙饭。贝斯手把一根断弦插进啤酒瓶："到此为止了，兄弟们。"',
        '你喝完最后一杯，窗外的夜色很深。'
      ],
      choices: [
        { label: '♻️ 重组，坚持搞下去', next: 'n_a7' },
        { label: '🎧 单干，做独立音乐', next: 'END:duli' },
        { label: '🛌 不搞了，散就散吧', next: 'END:chaojia' }
      ]
    },
    n_a7: {
      type: 'choice', act: '第五幕 · 解散与重组', title: '签约厂牌',
      body: [
        '重组后的乐队被你逼出了新风格。一家厂牌找上门，合同厚得像复习资料。',
        '第一张专辑发行——'
      ],
      choices: [
        { label: '📈 反响不错，趁热打铁', next: 'n_a9' },
        { label: '📉 石沉大海', next: 'n_a8' }
      ]
    },
    n_a8: {
      type: 'event', act: '第五幕 · 解散与重组', title: '反响平平',
      body: [
        '专辑扑了。厂牌开始给脸色，键盘手又拿起了手机。',
        '你把自己关在排练室，写了一晚上歌。'
      ],
      choices: [
        { label: '🔥 继续发，不信邪', next: 'n_a9' },
        { label: '💔 分歧越来越大', next: 'n_a10' }
      ]
    },
    n_a9: {
      type: 'emotion', act: '第五幕 · 解散与重组', title: '巡演',
      body: [
        '三线城市的小 Livehouse，台下二十个人，你唱得比谁都用力。',
        '人慢慢多起来。有人把你唱歌的视频剪了发网上，标题是《这支乐队火了》。'
      ],
      choices: [
        { label: '🚐 继续巡演，冲泼天流量', next: 'n_a12' },
        { label: '💔 队内出现分歧', next: 'n_a10' }
      ]
    },
    n_a10: {
      type: 'choice', act: '第五幕 · 解散与重组', title: '出现分歧',
      body: [
        '有人说要加键盘，有人说要搞民谣，鼓手想去做直播。你劝了三天，散了。',
        '排练室的灯灭了。'
      ],
      choices: [
        { label: '🎧 一个人做独立音乐', next: 'END:duli' },
        { label: '🎓 白天教琴，晚上写歌', next: 'END:jiaoshi' },
        { label: '🏪 开一家乐器行，安度余生', next: 'END:laobeizi' }
      ]
    },

    /* ── 第六幕 · 巅峰与坠落 ── */
    n_a12: {
      type: 'event', act: '第六幕 · 巅峰与坠落', title: '滚圈元神',
      body: [
        '你们红了，红得离谱——热搜、综艺、代言，B 站全站推送。',
        '业内给你们起了个外号："滚圈元神"。',
        '翻译过来就是：名声远远超过实力，还红得发紫的当红乐队。',
        '观众一边骂"就这？"一边买票，评论区一边刷"元神！"一边说"真不值"。',
        '你在领奖台上笑得很傻，台下闪光灯亮成一片。',
        '你隐约听见一声裂响——不知道是舞台，还是名声。'
      ],
      choices: [
        { label: '🧗 继续冲', next: 'n_a11' },
        { label: '🏁 见好就收', next: 'END:pingdan' }
      ]
    },
    n_a11: {
      type: 'choice', act: '第六幕 · 巅峰与坠落', title: '泼天流量 · 暴雷',
      body: [
        '热搜、综艺、代言，流量砸得你有点晕。',
        '直到有一天——'
      ],
      choices: [
        { label: '📱 刷到豆瓣月亮组的扒皮帖，上千楼', next: 'n_a13', flag: 1 },
        { label: '🎤 演唱会舞台垮了，视频传遍全网', next: 'n_a13', flag: 2 },
        { label: '🚓 队友的事上了法制新闻', next: 'n_a13', flag: 3 }
      ]
    },
    n_a13: {
      type: 'emotion', act: '第六幕 · 巅峰与坠落', title: '暴雷之后',
      body: [
        '代言解约，巡演取消，队友互相甩锅。你把自己关在排练室三天。',
        '第三天晚上，你把窗帘拉开，给手机充上电。'
      ],
      choices: [
        { label: '♻️ 重组改名，重新开始', next: 'END:shenren' },
        { label: '🤝 找经纪人，求他再拉一把', next: 'n_a14' },
        { label: '🛌 解散，认命了', next: 'END:byflag' }
      ]
    },
    n_a14: {
      type: 'event', act: '第六幕 · 巅峰与坠落', title: '独立乐队',
      body: [
        '经纪人帮你拉的那档巡演，办了三天就黄了。',
        '厂牌跑了，经纪人最后一个电话是"下次别找我"。',
        '你自己拉了个小车，在街头演出。一晚挣了八十七块，请自己吃了顿烧烤，还剩十二。'
      ],
      choices: [
        { label: '🔥 没钱也要坚持', next: 'n_a15' },
        { label: '🎓 白天去琴行当老师', next: 'END:jiaoshi' }
      ]
    },
    n_a15: {
      type: 'emotion', act: '第六幕 · 巅峰与坠落', title: '最后的坚持',
      body: [
        '三年后。小酒馆，台下五个人，你唱得很认真。',
        '唱完，一个人走过来："兄弟，唱得真好。明天还来吗？"',
        '你看了看那把琴——琴颈上有一道裂痕，是搬家时磕的。你没修，它一直弹得好好的。'
      ],
      choices: [
        { label: '🏠 接受平淡，把日子过下去', next: 'END:pingdan' },
        { label: '🚀 不，我还要再拼一次', next: 'END:summerOrShen' }
      ]
    }
  };

  var ENDINGS = {
    tuiquan: {
      title: '设备已挂 9 成新，只弹过两次', fail: true,
      body: [
        '你把琴挂上二手平台，标题：《9成新，只弹过两次》。',
        '滚圈有个说法：摇滚乐手的第一桶金，是卖掉设备。',
        '三天后卖出，买家是楼下琴行老师傅的孙子。',
        '你攥着到账的钱，第一次觉得，自己好像正式踏入滚圈了——以退圈的方式。',
        '确认收货的提示音响起时，你忽然觉得，这声音和出分那天的安静有点像。'
      ],
      ach: 1, happy: 2, abs: 3, quote: '卖得挺快，说明行情还行。'
    },
    duli: {
      title: '一个人就是一支乐队', fail: true,
      body: [
        '你一个人写歌、编曲、录音、混音，发了二十七首歌，总播放九十八次。',
        '你知道里面有四十七次是你妈刷的。她学会了切换小号，每条还评论："儿子写得真好。"',
        '你嫌她尴尬，让她别刷了。',
        '但后来你发现，那四十七次，成了你坚持下去的理由。',
        '世界上第一个认真听你歌的人，可能是那个嘴上骂你的人。'
      ],
      ach: 2, happy: 3, abs: 1, quote: '妈粉也是粉。'
    },
    deyi: {
      title: '关门弟子的传说',
      body: [
        '老师傅把压箱底的手艺全传给你，走之前，把琴行留给了你。',
        '现在城南琴行门口挂着一块匾：关门弟子，琴比命长。',
        '偶尔有年轻人来学琴，你叼着烟："先弹首小星星给我听听。"'
      ],
      ach: 3, happy: 4, abs: 1, quote: '这行当传了三代人了，你师父在天有灵。'
    },
    dingliu: {
      title: '当专职工作的顶流',
      body: [
        '你把乐队当成一份工作：周一开会，周二排练，周三商演，周四综艺，周末连轴转。',
        '没有绯闻，不迟到，准时交税——圈内最稳的顶流。',
        '只有经纪人知道，你排练室墙上挂着当年那把琴。',
        '琴弦锈了，你没换过。你怕换了，就忘了它原来什么声音。'
      ],
      ach: 5, happy: 3, abs: 1, quote: '稳定型选手，行业楷模，就是有点无聊。'
    },
    potian: {
      title: '泼天的流量，接住了',
      body: [
        '热搜上你的名字挂了三天。黑红也是红，商演价格翻了二十倍。',
        '夜深人静，你翻到当年那条评论："就这水平还玩术力口？"',
        '你笑了笑，点了举报。'
      ],
      ach: 4, happy: 2, abs: 4, quote: '流量是泼来的，也是泼走的。'
    },
    langan: {
      title: '只有你在认真练习', fail: true,
      body: [
        '你从来不发火。队友摸鱼，你看在眼里，没说过一句。',
        '三年后你们还在排练室。鼓手刷抖音，贝斯手看手机，键盘手在睡觉。',
        '只有你在认真练习。',
        '最后一场演出，台下三个人。你在台上唱得声嘶力竭。',
        '这是你一个人的乐队。'
      ],
      ach: 2, happy: 2, abs: 3, quote: '认真的人最孤独，也最该走。'
    },
    chaojia: {
      title: '一直练休止符很舒服', fail: true,
      body: [
        '排练第三个月。鼓手迟到一小时，贝斯手弹两分钟就刷手机，键盘手说："音乐需要呼吸。"',
        '你问他们：还排不排？',
        '"排啊，"贝斯手打了个哈欠，"先练练休止符嘛，休息也是创作的一部分。"',
        '天天休止符。一个乐队，练了三个月休止符。',
        '那天你把谱子拍在桌上："这乐队，我不排了。"',
        '多年后接受采访，主持人问你最后悔什么。',
        '你说："最后悔没跟着一起练休止符。"',
        '起码那样，乐队还能多活几年。'
      ],
      ach: 2, happy: 2, abs: 5, quote: '这不是梗，这是艺术。'
    },
    yuanshen: {
      title: '元神归位',
      body: [
        '你在小酒馆又唱了三年。小酒馆变成大 Livehouse，台下五个人变成五千人。',
        '票卖光，黄牛加价，热搜常客。业内又开始叫你"元神"。',
        '这次你没躲，你在台上把这句话念了出来：',
        '"感谢大家来看一支名不副实的乐队。"',
        '台下欢呼声更大了。',
        '你笑了笑，把吉他举过头顶。',
        '原来红到一定程度，烂也是一种卖点。',
        '这就是滚圈元神。'
      ],
      ach: 5, happy: 2, abs: 5, quote: '元神者，名声与实力之差也。'
    },
    shenren: {
      title: '重组改名，神人归来',
      body: [
        '你重组乐队，改名换姓，从地下重新开始。',
        '一年后，新歌冲上热榜。没人知道你就是当年那个翻车的顶流——除了楼下老师傅。',
        '他在琴行门口放了一挂鞭炮。'
      ],
      ach: 4, happy: 3, abs: 4, quote: '人生如戏，改名换姓也是技术。'
    },
    jiaoshi: {
      title: '两头跑',
      body: [
        '白天你在琴行教小朋友弹《小星星》，晚上在出租屋写歌。',
        '收入四千，房租一千五，梦想免费。',
        '但你教出一个拿省奖的学生。他毕业那天抱着琴哭了，你也差点哭了。'
      ],
      ach: 3, happy: 4, abs: 1, quote: '小星星传下去，就不算输。'
    },
    pingdan: {
      title: '平平淡淡才是真（真）',
      body: [
        '一份普通工作，一把用了十年的吉他，周五晚上和几个老朋友在公园合奏。',
        '你妈说："早知道你现在这样，当初就不该给你报吉他班。"',
        '但路过的人都会停下来听一会儿。',
        '你弹的是当年那首，只有二十个人听过的歌。'
      ],
      ach: 2, happy: 4, abs: 1, quote: '真的。括号（真）没骗你。'
    },
    moon: {
      title: '被挂的人，没一个正常的', fail: true,
      body: [
        '你火了以后，豆瓣有个组开始扒你。',
        '那个组叫月亮组，滚圈黑料集中地，里面挂着各种乐手的黑料，没一个正常的。',
        '那帖子已经上千楼：旧账、聊天截图、匿名爆料，真真假假全挂在那儿。',
        '澄清？没用的，没人听。',
        '那晚你想明白一件事：在滚圈，被月亮组挂过，才算正式出道。',
        '但你已经没有不出道的机会了。'
      ],
      ach: 3, happy: 1, abs: 4, quote: '月亮组比月亮还亮，照妖镜实锤。'
    },
    live: {
      title: 'live 事故', fail: true,
      body: [
        '演唱会第二天，视频刷爆全网——不是因为唱得多好，是舞台垮了。',
        '你在病床上刷评论。有一条写着："人没事就好，歌真的难听。"',
        '你笑了。笑着笑着，眼泪出来了。'
      ],
      ach: 3, happy: 1, abs: 4, quote: '舞台塌了，心也塌了。'
    },
    taixing: {
      title: '太刑了', fail: true,
      body: [
        '队友在后台干的事上了法制新闻。你是队长，被 404 得干干净净。',
        '你删光所有社交软件，回老家，把吉他挂上墙。',
        '偶尔半夜，你还是会梦见排练室那盏灯。'
      ],
      ach: 3, happy: 1, abs: 5, quote: '这不是抽象，这是法条。'
    },
    laobeizi: {
      title: '老辈子',
      body: [
        '三十年后，你开了家乐器行，门口挂着"老辈子琴行"。',
        '一个毛头小子进来要买二手吉他。你叼着烟看他，像极了当年的老师傅：',
        '"小伙子，先弹首小星星给我听听。"',
        '他弹得很烂，但眼神很亮。',
        '你看到了十八岁的自己。'
      ],
      ach: 2, happy: 5, abs: 3, quote: '小星星是个圈，你终于站到了圈的另一头。'
    },
    summer: {
      title: '十八岁的夏天', secret: true,
      body: [
        '很多年以后，你已经不是那个想当明星的十八岁少年。',
        '没有万人体育场，没有热搜，没多少人记得你的名字。',
        '但某个夏夜，你坐在街角，弹起十八岁写的第一首歌。',
        '一个路过的小孩停下来："叔叔，这是什么歌？"',
        '你愣了一下，笑了：',
        '"一个笨蛋十八岁的时候写的。"',
        '那个笨蛋，曾经就是你。',
        '他把琴抱得那么紧，像抱着整个夏天。'
      ],
      ach: 2, happy: 5, abs: 2, quote: '这个夏天，值了。'
    }
  };

  function resolveEnd(next) {
    if (next === 'END:summerOrShen') {
      var ends = loadEnds();
      var failCount = ends.filter(function (k) { return FAIL_ENDS.indexOf(k) >= 0; }).length;
      return failCount >= 3 ? 'summer' : 'yuanshen';
    }
    if (next === 'END:byflag') {
      return state.flag === 2 ? 'live' : (state.flag === 3 ? 'taixing' : 'moon');
    }
    return next.replace('END:', '');
  }

  /* ═══ 渲染 ═══ */

  var app, fx;

  function stars(n) {
    return new Array(n + 1).join('★') + new Array(6 - n).join('☆');
  }

  function viewOpen() {
    var hasSave = false;
    try { hasSave = !!localStorage.getItem(KEY); } catch (e) {}
    var resumeBtn = hasSave ?
      '<button class="btn btn-resume" id="btnResume">▶ 继续上次（第 ' + actOf(state.node) + '）</button>' : '';
    app.innerHTML =
      '<div class="open-card">' +
        '<div class="logo">🎸</div>' +
        '<h1 class="title">乐队人生</h1>' +
        '<p class="subtitle">18 岁，高考落榜，你决定把人生押给一把吉他</p>' +
        '<p class="sub2">20 个节点 · 16 种结局 · 滚圈黑话浓度预警</p>' +
        '<div class="gender-row">' +
          '<button class="gender-card' + (state.g === 'm' ? ' sel' : '') + '" data-g="m"><span>♂</span>男</button>' +
          '<button class="gender-card' + (state.g === 'f' ? ' sel' : '') + '" data-g="f"><span>♀</span>女</button>' +
        '</div>' +
        '<button class="btn btn-start" id="btnStart">开始我的乐队人生 →</button>' +
        resumeBtn +
        '<a class="home-link" href="index.html">← 返回魔法店</a>' +
      '</div>';
    var gs = app.querySelectorAll('.gender-card');
    for (var i = 0; i < gs.length; i++) {
      gs[i].addEventListener('click', function () {
        state.g = this.getAttribute('data-g');
        for (var j = 0; j < gs.length; j++) gs[j].classList.toggle('sel', gs[j] === this);
      });
    }
    app.querySelector('#btnStart').addEventListener('click', function () {
      clearState();
      state.g = app.querySelector('.gender-card.sel') ? app.querySelector('.gender-card.sel').getAttribute('data-g') : 'm';
      saveState();
      track();
      renderNode('n0');
    });
    var rs = app.querySelector('#btnResume');
    if (rs) rs.addEventListener('click', function () { track(); renderNode(state.node); });
  }

  function actOf(nodeId) {
    var n = NODES[nodeId];
    return n ? n.act : '第六幕 · 巅峰与坠落';
  }

  function track() {
    try { trackStart('band_take'); } catch (e) {}
  }

  function renderNode(id) {
    var n = NODES[id];
    if (!n) { viewEnd('duli'); return; }
    state.node = id;
    saveState();
    app.innerHTML =
      '<div class="story-card" id="storyCard">' +
        '<div class="act-bar">' + esc(n.act) + ' · <b>' + esc(n.title) + '</b>' +
          '<button class="restart-btn" id="btnRestart" title="重新开始">↺</button>' +
        '</div>' +
        '<div class="story-body" id="storyBody"></div>' +
        '<div class="story-choices" id="storyChoices"></div>' +
      '</div>';
    var body = app.querySelector('#storyBody');
    var choices = app.querySelector('#storyChoices');
    app.querySelector('#btnRestart').addEventListener('click', function () {
      if (confirm('放弃当前进度，重新开始？')) { clearState(); viewOpen(); }
    });
    var lines = n.body.slice();
    for (var i = 0; i < lines.length; i++) {
      lines[i] = lines[i].replace('__G__', state.g === 'f' ? '，丫头' : '');
    }
    if (n.type === 'emotion') {
      var idx = 0;
      function step() {
        var old = body.querySelector('.more-btn');
        if (old) old.remove();
        var p = document.createElement('p');
        p.className = 'sline';
        p.innerHTML = lines[idx];
        body.appendChild(p);
        requestAnimationFrame(function () { p.classList.add('in'); });
        idx++;
        if (idx >= lines.length) {
          if (body.querySelector('.more-btn')) body.querySelector('.more-btn').remove();
          renderChoices(choices, n.choices);
        } else {
          var mb = document.createElement('button');
          mb.className = 'more-btn';
          mb.textContent = '继续 ↓';
          body.appendChild(mb);
          mb.addEventListener('click', function () { step(); });
        }
      }
      step();
    } else {
      for (var k = 0; k < lines.length; k++) {
        var pk = document.createElement('p');
        pk.className = 'sline';
        pk.innerHTML = lines[k];
        body.appendChild(pk);
        requestAnimationFrame(function (el) { return function () { el.classList.add('in'); }; }(pk));
      }
      renderChoices(choices, n.choices);
    }
    window.scrollTo(0, 0);
  }

  function renderChoices(box, choices) {
    for (var i = 0; i < choices.length; i++) {
      (function (c) {
        var b = document.createElement('button');
        b.className = 'opt-btn';
        b.innerHTML = c.label;
        b.addEventListener('click', function () {
          if (c.flag) state.flag = c.flag;
          if (c.next.indexOf('END:') === 0) {
            viewEnd(resolveEnd(c.next));
          } else {
            renderNode(c.next);
          }
        });
        box.appendChild(b);
      })(choices[i]);
    }
  }

  function viewEnd(key) {
    var e = ENDINGS[key];
    if (!e) e = ENDINGS.duli;
    var ends = loadEnds();
    if (ends.indexOf(key) < 0) { ends.push(key); saveEnds(ends); }
    fxEnding(key);
    var failCount = ends.filter(function (k) { return FAIL_ENDS.indexOf(k) >= 0; }).length;
    var badge = '第 ' + ends.length + ' / 16 个结局' +
      (e.secret ? '<span class="b-secret">✦ 隐藏真结局</span>' : '') +
      '<span class="b-fail">已历失败 ×' + failCount + '</span>';
    var lines = e.body.map(function (l) { return '<p>' + l + '</p>'; }).join('');
    app.innerHTML =
      '<div class="end-card ' + (e.secret ? 'secret' : '') + '">' +
        '<div class="end-flag">' + (e.secret ? '✦ 真结局 ✦' : '结局') + '</div>' +
        '<h1 class="end-title">' + esc(e.title) + '</h1>' +
        '<div class="end-body">' + lines + '</div>' +
        '<div class="score-card">' +
          '<div class="score-cell"><span class="s-label">成就</span><span class="s-stars">' + stars(e.ach) + '</span></div>' +
          '<div class="score-cell"><span class="s-label">幸福</span><span class="s-stars">' + stars(e.happy) + '</span></div>' +
          '<div class="score-cell"><span class="s-label">离谱</span><span class="s-stars">' + stars(e.abs) + '</span></div>' +
        '</div>' +
        '<div class="end-quote">「' + esc(e.quote) + '」</div>' +
        '<div class="end-badge">' + badge + '</div>' +
        '<div class="end-actions">' +
          '<button class="btn btn-main" id="btnShare">📋 分享我的结局</button>' +
          '<button class="btn btn-ghost" id="btnAgain">↺ 再玩一次</button>' +
          '<button class="btn btn-ghost" id="btnHome">🏠 返回魔法店</button>' +
        '</div>' +
        resultFooterHTML({ notice: '乐队人生 · 20 节点 16 结局 · 还有 1 个隐藏真结局等你解锁' }) +
      '</div>';
    app.querySelector('#btnShare').addEventListener('click', function () { shareEnding(key); });
    app.querySelector('#btnAgain').addEventListener('click', function () { clearState(); viewOpen(); });
    app.querySelector('#btnHome').addEventListener('click', function () { window.location.href = 'index.html'; });
    window.scrollTo(0, 0);
  }

  function shareEnding(key) {
    var e = ENDINGS[key];
    var txt = '我打出了【' + e.title + '】结局！' +
      '成就' + e.ach + '★ / 幸福' + e.happy + '★ / 离谱' + e.abs + '★ ——' +
      '「' + e.quote + '」\n乐队人生 · 霧雨魔法店 https://www.azureflame.cloud/band-story.html';
    function done() {
      var t = document.createElement('div');
      t.className = 'toast';
      t.textContent = '已复制，快去炫耀吧';
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add('show'); }, 10);
      setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    } else { fallbackCopy(txt); done(); }
  }
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  /* ═══ 结局特效 ═══ */

  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function fxEnding(key) {
    document.body.classList.remove('fx-danger');
    if (reduced) return;
    if (key === 'summer') fxSummer();
    else if (GOLD_ENDS[key]) fxGold();
    else if (DANGER_ENDS[key]) document.body.classList.add('fx-danger');
  }

  /* 夏夜星空 + 萤火虫 */
  function fxSummer() {
    fx.innerHTML = '<canvas id="summerFx"></canvas>';
    var cv = fx.querySelector('#summerFx');
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var stars = [];
    var flies = [];
    var W = cv.width, H = cv.height;
    for (var i = 0; i < 90; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: Math.random() * 1.2 + 0.2, p: Math.random() });
    }
    for (var j = 0; j < 60; j++) {
      flies.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1.2, ph: Math.random() * 6.28, sp: 0.03 + Math.random() * 0.04
      });
    }
    var t = 0;
    function frame() {
      t++;
      ctx.clearRect(0, 0, W, H);
      for (var s = 0; s < stars.length; s++) {
        var st = stars[s];
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.02 + st.p * 9));
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.28); ctx.fill();
      }
      for (var f = 0; f < flies.length; f++) {
        var fl = flies[f];
        fl.x += fl.vx; fl.y += fl.vy;
        if (fl.x < 0 || fl.x > W) fl.vx *= -1;
        if (fl.y < 0 || fl.y > H) fl.vy *= -1;
        var a = 0.35 + 0.65 * Math.abs(Math.sin(t * fl.sp + fl.ph));
        ctx.globalAlpha = a;
        ctx.fillStyle = '#f6e27a';
        ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, 6.28); ctx.fill();
        ctx.globalAlpha = a * 0.4;
        ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r * 2.6, 0, 6.28); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    var raf = requestAnimationFrame(frame);
    window.addEventListener('resize', function () {
      cv.width = window.innerWidth; cv.height = window.innerHeight; W = cv.width; H = cv.height;
    });
  }

  /* 金粉飘落 */
  function fxGold() {
    for (var i = 0; i < 26; i++) {
      var d = document.createElement('div');
      d.className = 'gold-p';
      d.style.left = Math.random() * 100 + '%';
      d.style.animationDelay = (Math.random() * 4) + 's';
      d.style.animationDuration = (3 + Math.random() * 3) + 's';
      d.style.fontSize = (8 + Math.random() * 10) + 'px';
      d.textContent = Math.random() < 0.5 ? '✦' : '✧';
      fx.appendChild(d);
    }
  }

  /* ═══ 启动 ═══ */

  function init() {
    app = document.getElementById('app');
    fx = document.getElementById('fx');
    loadState();
    viewOpen();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
