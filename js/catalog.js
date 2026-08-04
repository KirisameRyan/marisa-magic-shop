// =============================================
//  霧雨魔法店 · 全站目录唯一数据源
//  主页卡片 / 汉堡菜单 / 搜索 都从这里生成
//  新增页面只需在这里加一条
// =============================================
window.MMS_CATALOG = {
  // ── 🎮 小游戏 ──
  games: [
    { href: 'marisa_dash.html',     emoji: '🧹', name: '魔理沙快跑',   tag: '三通道飞行跑酷',     color: 'green', desc: '↑↓ 切换通道躲避蘑菇和妖精。擦弹连击触发爆发，冲刺撞碎一切障碍。触屏+键盘双支持。' },
    { href: 'marisa_survivor.html', emoji: '⭐', name: '魔理沙幸存者', tag: '幸存者like',         color: 'purple', desc: '攻击全自动，只管走位！收集P点升级，17 种强化卡三选一，在琪露诺大军里活下去。' },
    { href: 'marisa_landlord.html', emoji: '⛩️', name: '魔理沙的赛钱危机', tag: 'Roguelike 老虎机构筑', color: 'red', desc: '灵梦上门收租了！转动祈愿转盘，58 种符号自由构筑：幽幽子吃料理永久成长，琪露诺冻青蛙……撑过 12 次收租！' },
    { href: 'street_survival.html', emoji: '🌃', name: '流浪模拟器',   tag: '街头生存模拟',       color: 'blue', desc: '你是李明，兜里剩 8 块钱。每天早中晚三个时段，打工、翻垃圾、乞讨……突发事件随时降临，活到攒够 1000 元那天。' },
    { href: 'demo_roulette.html',   emoji: '🔫', name: '轮盘赌局',     tag: '双人心理博弈',       color: 'gold', desc: '一把左轮六枚弹膛。装弹、留话、朝谁开枪？三局两胜，挑战 AI 或匹配真人，读完对面再扣扳机。' }
  ],
  // ── 🔥 热门测试 ──
  hot: [
    { href: 'waifu-test.html',  emoji: '💕', name: '测测你的二次元老婆', tag: '二次元鉴定', color: 'gold',   desc: '20 道题，鉴定你命中注定的二次元老婆——放心，抽到的都是「好女孩」。⭐ 隐藏彩蛋等你发现。' },
    { href: 'quiz-animal.html', emoji: '🐾', name: '测一测你的灵魂动物', tag: '灵魂测试',   color: 'purple', desc: '回答日常问题，匹配与你灵魂最契合的动物。不管怎么选都是蛆。' },
    { href: 'quiz-lolicon.html', emoji: '💘', name: '测测你的隐藏人格属性', tag: '人格分析', color: 'pink', desc: '24道题 · 赛博心理学引擎。表面是性格测试，结果可能让你意想不到。' },
    { href: 'quiz-internet.html', emoji: '🌐', name: '测一测你是哪位抽象圈大手子', tag: '人物鉴定', color: 'purple', desc: '26 道灵魂问题，精准扫描你的网络人格。还有隐藏人物等你发现。' }
  ],
  // ── 🆕 最新上线 ──
  latest: [
    { href: 'quiz-jiahao.html',   emoji: '🖤', name: '测测你的嘉豪程度', tag: '嘉豪检测', color: 'dark', desc: '25 道灵魂检测 · 五维雷达图。从普通人到自在极意豪——看看你距离嘉豪还有多远。' },
    { href: 'quiz-major.html',    emoji: '🏗️', name: '张雪峰八道题帮你选专业', tag: '专业测评', color: 'gold', desc: '8 道生涯规划题 · AI 精准匹配。张雪峰老师看了都说好。' },
    { href: 'quiz-waifu-2.html',  emoji: '💀', name: '测测你的二次元老婆', tag: '抽象鉴定', color: 'red', desc: '12 道专业人格测试，赛博心理学引擎精准匹配。结果可能让你怀疑人生。' },
    { href: 'quiz-waifu-3.html',  emoji: '🔮', name: '测测你的二次元老婆 · 正式版', tag: '正式鉴定', color: 'purple', desc: '14 维标签 × 500 角色数据库 × 4 层筛选。真正的灵魂匹配，TOP 5 排名。' },
    { href: 'quiz-nolove.html',   emoji: '💔', name: '测测你未来的对象在哪里', tag: '姻缘占卜', color: 'red', desc: '10 道题 · 赛博月老深度检索。太阳系、银河系、平行宇宙全搜了一遍——结果只有一个。' },
    { href: 'pig-test.html',      emoji: '🐷', name: '测测你是什么种类的猪猪', tag: '猪猪鉴定', color: 'lime', desc: '长按汲取猪元素，1 秒鉴定你的猪格。34 种猪猪等你来当。' },
    { href: 'quiz-region.html',   emoji: '🗺️', name: '测测你是哪里人', tag: '地域鉴定', color: 'blue', desc: '按下按钮，答案可能让你飞起来。中国人能飞，不是中国人……你自己看吧。' },
    { href: 'quiz-drowning.html', emoji: '🌊', name: '暑期防溺水安全调查', tag: '安全问卷', color: 'red', desc: '全国统一安全教育问卷 · 10 题 · 30 秒完成。认真答题，注意安全。' }
  ],
  // ── 📚 更多测试 ──
  more: [
    { href: 'quiz-touhou.html',          emoji: '🏮', name: '测一测你最像哪个东方人物', tag: '幻想入り', color: 'gold', desc: '穿越幻想乡，找到你的另一个自己。16 位角色，16 道问题。' },
    { href: 'quiz-anime-world.html',     emoji: '🗺️', name: '测测你的二次元灵魂故乡', tag: '二次元鉴定', color: 'purple', desc: '16 道题 · 16 个世界 · 表面测地域，结果却是你灵魂归属的二次元。' },
    { href: 'quiz-anime-hero.html',      emoji: '⚔️', name: '测一测你最像哪个动漫男主', tag: '番剧鉴定', color: 'pink', desc: '8 道灵魂问题，匹配你的主角人格。热血？天才？还是隐藏最终boss？' },
    { href: 'gaokao.html',               emoji: '🎓', name: '高考出分模拟器', tag: '分数模拟', color: 'red', desc: '输入姓名考号，查查你的高考成绩。随机生成各科分数 + 录取结果。纯属娱乐。' },
    { href: 'bingo.html',                emoji: '🎯', name: '社会指数宾果', tag: '宾果挑战', color: 'pink', desc: '25 格社恐鉴定，点亮一条线就实锤。12 条线 · 8 档评级 · 96 条随机评语。' },
    { href: 'quiz-internet-identity.html', emoji: '🪪', name: '测测你的互联网身份', tag: '身份鉴定', color: 'blue', desc: '20 道题 · 7 大维度 · 14 种身份。乐子人、地雷女……还有专属雷达图。' },
    { href: 'quiz-fruit.html',           emoji: '🧠', name: '测测你最爱什么水果', tag: '读心术', color: 'lime', desc: '六个问题，读心术看穿你的水果之魂。结果保证真实。' },
    { href: 'quiz-food.html',            emoji: '🍽️', name: '今天吃什么？', tag: '美食推荐', color: 'pink', desc: '不知道今天吃什么？我来帮你选。转盘抽取 or 智能问答，两种模式任选。' },
    { href: 'quiz-food-care.html',       emoji: '🍲', name: '对症下菜', tag: '食疗占卜', color: 'gold', desc: '18 道题，魔法店对症给你下一道菜。表面是吃的，里面是什么……测完才知道。' },
    { href: 'quiz-math2026.html',        emoji: '🧠', name: '标准智力测试', tag: '认知评估', color: 'blue', desc: '数学逻辑、空间推理、数理思维等综合维度。单选+多选 · 满分 58 分。' },
    { href: 'quiz-hometown.html',        emoji: '🏠', name: '测测你的灵魂故乡', tag: '地域鉴定', color: 'gold', desc: '20 道题 · 28 个地域 · 8 维画像。找到你DNA里那个回不去的故乡。' },
    { href: 'quiz-otokonoko.html',       emoji: '💅', name: '测测你的男娘指数', tag: '男娘鉴定', color: 'pink', desc: '16 道灵魂拷问 · 4 大维度分析。测完跳出 100 分——先别慌，看看真实得分再说。' },
    { href: 'quiz-sexual.html',          emoji: '⚠️', name: '测测你的X压抑程度', tag: 'X压抑评估', color: 'red', desc: '12 道灵魂拷问 · 3 大维度分析。测完跳出 100 分——先别慌，看看真实得分再说。' },
    { href: 'quiz-deepspace.html',       emoji: '💘', name: '测测你在《恋与深空》的本命', tag: '乙女鉴定', color: 'pink', desc: '15 道深度问题 · 精准匹配你的深空恋人。抽到谁就是谁，不准不要钱。' },
    { href: 'quiz-isekai.html',          emoji: '🚛', name: '转生异世界·职业诊断', tag: '异世界转生', color: 'purple', desc: '被卡车撞了？神明给你选职业！12 道题匹配你的异世界专属职业。' }
  ],
  // ── 🧰 实用工具 ──
  tools: [
    { href: 'collect.html',  emoji: '📝', name: '建议新彩蛋人物', tag: '彩蛋征集', color: 'gold', desc: '想让谁加入高考模拟器的隐藏彩蛋？来提名，店主会挑合适的加进去。' },
    { href: 'feedback.html', emoji: '💬', name: '帮助我们改进网站', tag: '网站反馈', color: 'lime', desc: '有什么想对我们说的？新测试想法、bug反馈、建议都行。每条都会看。' }
  ],
  // ── 🔗 外部链接(仅汉堡菜单) ──
  links: [
    { href: 'https://space.bilibili.com/1029138222', emoji: '🅱', text: 'B站频道', ext: true }
  ]
};
