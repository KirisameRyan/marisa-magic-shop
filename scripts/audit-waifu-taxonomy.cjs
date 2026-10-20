// Read-only taxonomy audit. Generates reports; never rewrites characters or tags.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8').replace(/^\uFEFF/, ''));
const taxonomy = read('waifu-tags-v2.json');
const characters = read('waifu-db-all-zh.json');
// action | proposed interpretation | reason/migration restriction
const decisions = `
gentle|改名收窄|温柔|温柔是待人方式，治愈是观众感受；不重复计入 rel_healer。
tsundere|保留|傲娇|需要表面态度与真实关心的反差证据，不能仅凭嘴硬标注。
genki|改名收窄|活泼外向|去掉行动力强的推断；外向不等于勤奋或果断。
airhead|拆分复核|天然呆／冒失|迟钝、天真和动作笨拙不同，旧数据不能直接分配给所有子标签。
kuudere|改名收窄|冷静少言|去掉傲慢含义；与 stoic、comm_silent 属相邻特征，不重复累加。
yandere|改名收窄|极端占有欲（角色设定）|不把普通执着等同病娇；必须有明确剧情证据。
mature|改名收窄|可靠有担当|去掉理性及年龄暗示，成熟外貌不等于可靠。
mysterious|移至背景|神秘背景|信息隐藏属于叙事呈现，不能直接推断待人性格。
comedic|拆分复核|幽默／爱恶作剧|让观众觉得好笑不等于角色爱开玩笑；搞笑作品角色不能自动命中。
cold|拆分复核|冷淡／冷酷|情感疏离和不顾他人不同；删除强大与果断的绑定。
fukuro|改名收窄|表里反差、善于算计|只与内外态度反差对应；与 manipulative 不当成两份独立证据。
chuunibyou|保留|中二设定|只记录明确自我幻想或角色扮演表现，真实拥有异能不算中二。
queen|改名收窄|强势主导|性别中立；与 rel_leader 不重复计分。
imouto|退出核心计分|妹妹感（展示原型）|年龄、性别、依赖和亲属身份混杂；不能据此自动增加依赖标签。
otouto|退出核心计分|弟弟感（展示原型）|与 imouto 同理，保留原始信息供人工复核。
no_expression|合并归类|表情少|只描述可见表达，不推断没有情绪；与 deadpan 的表情部分归一。
hotblooded|拆分复核|热情进取／冲动|热情与缺乏思考不是一回事。
stoic|改名收窄|沉着克制|与冷静少言相关；可保留细标签，核心评分只算一个关联组。
loyal|合并归类|忠诚|并入 values/val_loyalty；合并后每轮只计一次。
playful|拆分复核|爱开玩笑／不拘常规|痞气、幽默和玩世不恭不是同一个维度。
gentleman|改名收窄|礼貌体贴|性别中立；礼貌与体贴也应分别保留证据。
brooding|改名收窄|沉郁|去掉必然有创伤或黑暗过去的假设，不作心理诊断。
ambitious|合并归类|目标与野心|移至动机，与 val_ambition 合并；目标强不必然追逐权力。
eccentric|改名收窄|特立独行|去掉怪人、难以预测等宽泛判断，需具体行为依据。
deadpan|拆分复核|表情少／冷面幽默|表情少不等于幽默；冷幽默需要表达方式证据。
protective|合并归类|重视守护|与 val_protective 合并；不自动推断愿意自我牺牲。
revengeful|合并归类|复仇动机|与 val_revenge 合并，属于剧情动机。
ruthless|改名收窄|手段强硬、不顾代价|不能与果断混用；与 cold 中冷酷部分统一定义。
manipulative|改名收窄|操控他人|必须有利用或控制他人的行为证据，聪明、谋略不自动命中。
honorable|合并归类|重视承诺与荣誉|与 val_honor 合并。
proud|拆分复核|自尊强／傲慢|自尊和贬低他人不同，旧标签需要人工判断。
lazy|改名收窄|懒散怕麻烦|去掉关键时刻可靠的补充，可靠单独标注。
hardworking|改名收窄|勤奋|自律是另一个特征，不能仅凭努力自动推断。
curious|保留|好奇求知|与 val_knowledge 分组，避免同一求知特征重复得分。
shy|改名收窄|害羞|内向不一定紧张，也不等于不善表达。
flirty|拆分复核|爱调情／轻浮|调情、轻浮和社交能力不能合并为一个判断。
serious|拆分复核|认真严肃／严格守规|态度严肃不等于遵守规则。
age_v_loli|合并归类|儿童外观|与 age_v_shota 合并；仅中性外观信息，不生成性化画像。
age_v_shota|合并归类|儿童外观|性别单独记录，不在年龄分类里重复编码。
age_v_teen|保留|少年外观|以展示形态为准；不要从外观反推实际年龄。
age_v_young_adult|保留|青年外观|与成熟气场分离，并定义与少年、成年边界。
age_v_mature|改名收窄|成年外观|去掉气场成熟，避免与可靠、年上感混用。
age_v_elder|拆分复核|中年外观／老年外观|大叔与老年跨度过大，按具体形态复核。
age_a_kouhai|退出核心计分|后辈感|依赖观察者年龄和关系，不能固定推断需要照顾。
age_a_douki|退出核心计分|同辈感|相对用户而变，不适合作为固定人物事实。
age_a_senpai|退出核心计分|前辈感|可作展示原型，不能等同成熟或可靠。
age_p_loli_baba|退出核心计分|实际年龄与外貌差异|去掉贬称；作为背景元数据保留。
age_p_legal_loli|退出核心计分|实际年龄与外貌差异|删除合法化措辞；年龄设定不改变儿童外观，禁作性化依据。
age_p_reverse|退出核心计分|实际年龄与外貌差异|采用独立年龄字段与版本信息，不参与核心偏好加分。
transfer|退出核心计分|转学生|学生子类，主要是剧情背景，不重复增加学生偏好。
class_officer|改名收窄|学生干部|班干部与学生会长可保留细类，不推断领导性格。
warrior|改名收窄|战斗职业|骑士是子类；战斗能力不是职业时需另记。
idol|拆分复核|偶像／演员／歌手|职业不同，不能把会唱歌自动认定为偶像。
mage|拆分复核|魔法使用者／超能力者|区分作品中的能力体系；旧 mage 不可全部映射成魔法。
noble|拆分复核|贵族王室／富裕家庭|财富与贵族身份不等价，去掉性别化大小姐表述。
godly|拆分复核|神明／精灵／妖怪|不能把所有非人类都视作神明；移入种族或存在类型。
healer|拆分复核|治疗能力／宗教身份|巫女、修女不一定有治疗能力。
isekai_resident|移至背景|异世界背景|不直接计入性格偏好；跨作品几乎不具备统一含义。
office_lady|合并归类|公司职员|与 worker 统一，性别单独记录。
worker|改名收窄|公司职员|社会人范围太广，医生与厨师等不必重复打此标签。
maid|改名收窄|家政侍从|女仆与管家可作子类，不从服装推断职业。
non_human_race|移至背景|非人类种族|作为父类，不与精灵、神明等子类重复计分。
wanderer|拆分复核|旅人／漂泊者／冒险者|旅行状态、生活方式与职业不同。
housewife|拆分复核|家庭照料者／擅长家务|身份和技能不同，性别中立。
mentor|拆分复核|教师职业／指导关系|职业与对某人的关系分开，与 rel_mentor 避免双计。
antihero|移至背景|反英雄叙事定位|不能直接推断道德或相处方式。
villain|移至背景|反派叙事定位|依赖作品与时期，反派不必然冷酷。
rival|合并归类|竞争关系|并入关系记录，与 rel_rival 不双计。
tone_romance|改名收窄|恋爱题材|恋爱题材不一定日常。
tone_dark|改名收窄|黑暗沉重|致郁是观众反应，不作为客观心理结果。
tone_comedy|改名收窄|喜剧题材|不要求日常，不推断角色幽默。
tone_scifi|拆分复核|科幻／奇幻|两个独立题材，旧记录需要核对作品。
tone_yuri|改名收窄|女性恋爱题材|女性友谊或强烈羁绊不能直接标为恋爱。
tone_harem|改名收窄|多角恋爱题材|不要求喜剧；如细分需记录关系结构。
tone_music|拆分复核|音乐题材／偶像题材|音乐不必然偶像。
tone_survival|拆分复核|生存题材／死亡游戏|战争或危险环境不自动等于大逃杀。
rel_dependent|退出核心计分|对特定对象的依赖关系|原定义假定角色依赖用户，没有剧情依据；只作为有对象的关系元数据。
rel_equal|退出核心计分|对等关系|不能假定用户与角色是恋人；与战友关系不重复算分。
rel_leader|退出核心计分|引导关系|需明确关系对象，不假定角色会引领用户。
rel_healer|退出核心计分|安抚互动|需剧情互动证据，观众觉得治愈与角色行为分开。
rel_buddy|退出核心计分|伙伴关系|不能假定与用户默契，各自安好没有统一判定标准。
rel_rival|移至背景|竞争关系|记录对手及作品时期，避免直接推断相处偏好。
rel_mentor|移至背景|师徒关系|记录双方身份，一位角色可能同时是学生与导师。
rel_comrade|移至背景|战友关系|与特定对象和共同目标有关，不自动推断亲密偏好。
rel_family|移至背景|亲属／亲情关系|亲属事实与家人般感受不同，需要对象和依据。
comm_frank|改名收窄|直率表达|直率不等于外向或情绪外露。
comm_reserved|改名收窄|含蓄表达|与话少分开，删除走心的主观评价。
comm_snarky|拆分复核|犀利言辞／吐槽幽默|毒舌不一定幽默，吐槽不一定伤人。
comm_silent|保留|寡言|只描述说话频率，不推断温柔陪伴或冷傲。
comm_rational|改名收窄|逻辑清晰|理性表达不等于成熟或功利。
comm_volatile|改名收窄|表达起伏明显|只描述表达，不作情绪障碍判断。
comm_boastful|改名收窄|爱夸口|自信不等于吹嘘。
comm_philosophical|拆分复核|哲理表达／说教|讨论人生不一定是在教训人。
comm_teasing|保留|爱逗弄|与恶作剧、幽默相关，核心分组避免重复加分。
comm_formal|拆分复核|礼貌／正式|礼貌不必然正式，使用敬语也不代表体贴。
val_justice|拆分复核|正义／秩序|角色可能为了正义反抗规则。
val_utilitarian|改名收窄|结果导向|不能解释成理性，更不能直接标成自私；旧数据需要复核。
val_protective|改名收窄|重视守护|保护他人不等于愿意牺牲自己，与 protective 合并。
val_independent|改名收窄|独立自主|与自我中心区分。
val_honor|改名收窄|重视承诺与荣誉|与 honorable 合并；原则需要具体内容。
val_revenge|移至背景|复仇动机|与 revengeful 合并，不当成用户人格结论。
val_ambition|拆分复核|目标驱动／权力追求|宏大目标不等于权力欲；与 ambitious 归一。
val_loyalty|改名收窄|忠诚|归属感与忠诚不同；与 loyal 合并。
val_knowledge|保留|重视求知|与 curious 相关，不能双倍计算一个证据。
hair_white|改名收窄|白／银发|可保留粗分组；灰发不能自动并入。
hair_red|拆分复核|红发／粉发|不同颜色，应按展示图重新标注。
hair_blue|拆分复核|蓝发／青发|不同颜色；统一色板后复核。
hair_green|拆分复核|绿发／灰发|两者明显不等价，不能批量猜测原标签含义。
hair_gradient|移至背景|发色分布方式|渐变、多色与具体颜色正交，移入着色形式。
hair_long|改名收窄|长发|建议超过肩部为长发；与中发边界明确互斥，以展示形态为准。
hair_medium|改名收窄|中发|建议下巴以下至肩部，与短发、长发边界不重叠。
hair_short|改名收窄|短发|建议不超过下巴；光头单独记录，不强填短发。
hair_bob|迁移分类|波波头|属于发型，不属于发长，可同时记录中发或短发。
hair_ponytail|改名收窄|单马尾|侧马尾为子类，细节不足时只保留父类。
hair_hime|拆分复核|姬发式／遮眼刘海|两个不同造型；与 sp_hime_cut 统一来源。
body_petite|拆分复核|矮个／纤细|身高与体态分开，不按性别或年龄判定。
body_slim|改名收窄|纤细|纤细不等于虚弱，不推断身体能力。
body_average|退出核心计分|体型未明确区分|普通没有统一参照，不能把缺失数据补成普通。
body_muscular|改名收窄|肌肉明显|健壮与肌肉明显不完全相同，以可见形态为准。
body_broad|拆分复核|宽肩／魁梧|肩部结构和整体体型分开。
body_busty|退出核心计分|成人体态细项待复核|混合整体丰满与胸部特征，不进入通用或未成年人题池的计分。
body_tall|拆分复核|高个／修长|身高和比例分开记录。
body_chubby|改名收窄|圆润体型|不推断健康状态。
body_loli_height|改名收窄|矮个|未来改中性 ID；矮个不等于儿童或幼态。
skin_pale|改名收窄|浅肤色|按统一图像色板，不绑定气质。
skin_normal|退出核心计分|肤色待核定|普通不是可复现颜色，不自动当成中等肤色。
skin_tanned|拆分复核|小麦肤色／深肤色|跨度大，不从颜色推断种族或健康。
skin_ghostly|改名收窄|极浅肤色|不称病态，不推断健康状态；检查与浅肤色的区分价值。
eye_blue|拆分复核|蓝瞳／青瞳|按展示形态与色板复核。
eye_brown|拆分复核|棕瞳／黑瞳|黑瞳已有独立标签，当前分类重叠。
eye_heterochromia|合并归类|异色瞳|与 sp_heterochromia 合并，颜色另记，避免双计。
eye_sharp|拆分复核|上挑眼型／锐利眼神|结构与瞬时表情分离，与 expr_sharp 去重。
eye_gentle|拆分复核|下垂眼型／温柔眼神|下垂眼不等于性格温柔，与 expr_gentle 去重。
eye_empty|迁移分类|无光眼神|属于表情呈现，与 expr_empty 合并。
eye_round|拆分复核|圆眼／大眼|形状和大小不同。
cloth_uniform|拆分复核|校服／职业制服|职业制服范围更广，不能自动算学生偏好。
cloth_armor|拆分复核|铠甲／战斗服|穿战斗服不一定有铠甲。
cloth_kimono|拆分复核|和服／巫女服|衣着不直接推出宗教身份。
cloth_sexy|退出核心计分|成人服装细项待复核|性感主观，暴露程度需中性定义，不用于通用或未成年人题池。
cloth_elegant|改名收窄|礼服|优雅是主观气质，不等于穿礼服。
cloth_gothic|改名收窄|哥特服饰|穿黑衣不自动算哥特风。
cloth_barefoot|拆分复核|赤足／袜类|无鞋无袜与穿丝袜不是一回事；移入鞋袜细节。
cloth_military|拆分复核|军装／战术服|两者并非完全相同。
cloth_traditional|改名收窄|传统服饰|作为父类，不与和服等子类重复计分。
expr_gentle|合并归类|温柔表情|与眼型分离，不反推温柔性格。
expr_sharp|合并归类|锐利表情|与眼型分离。
expr_empty|改名收窄|无光／淡漠表情|去掉死鱼眼，不能由单图推断长期性格。
expr_crazy|改名收窄|夸张激昂表情|去掉病态，不作心理诊断。
expr_lazy|改名收窄|半睁眼表情|不由表情推断懒散。
expr_bright|改名收窄|明亮笑容|不由单图推断外向性格。
sp_scar|拆分复核|伤疤／绷带|永久痕迹与服饰医疗物品不同。
sp_tattoo|拆分复核|纹身／身体印记|纹身与天生或魔法印记不同。
sp_heterochromia|合并归类|异色瞳|与 eye_heterochromia 只保留一个计分 ID。
sp_vampire_fangs|改名收窄|明显尖牙|吸血鬼尖牙与虎牙可细分；不从尖牙推断种族。
sp_inhuman|移至背景|非人形态|与种族分开，非人种族也可能外观完全人形。
sp_hime_cut|合并归类|姬发式／遮眼刘海待拆分|与 hair_hime 合并后复核，不能重复加分。
sp_maid_headband|改名收窄|女仆头饰|不从头饰推断女仆职业。
sp_mask|改名收窄|面具／面罩|与 sp_muzzle 的口罩部分需界定边界。
sp_mecha_ear|保留|机械耳部结构|机械身体父类与耳部子类避免双计。
sp_blindfold|改名收窄|蒙眼布|眼罩、绷带覆盖需要明确互斥与共存规则。
sp_weapon|移至背景|常携武器|依展示版本；所有武器合一较粗，不推断好斗。
sp_bald|迁移分类|无发|纳入发长的独立状态；其余发色、发型留空而非负例。
sp_muzzle|拆分复核|口罩／竹筒／其他口部装具|用途外形完全不同，不能用于统一偏好计分。
`.trim();
const rules = new Map(decisions.split('\n').map(line => {
  const [id, action, proposed, reason] = line.split('|');
  return [id, {action, proposed, reason}];
}));
const scope = dim => ['series_tone','role','age_paradox','age_aura','relationship'].includes(dim)
  ? '背景或关系辅助，默认不进入核心性格分'
  : dim === 'expression' ? '按展示图片标注，默认只作辅助' : '可进入偏好分，但相关标签需分组';
const rows = [];
for (const dim of taxonomy.dimensions) for (const tag of dim.tags) {
  const rule = rules.get(tag.id) || {
    action:'保留', proposed:tag.name,
    reason: dim.id === 'series_tone'
      ? '保留为作品元数据，不从作品题材推断角色性格。'
      : '概念可保留；需统一判定标准、记录来源，并限定展示版本。'
  };
  rows.push({
    dimension:dim.id, dimension_name:dim.name, id:tag.id,
    current_name:tag.name, current_definition:tag.desc || null,
    occurrences:characters.filter(c=>(c.tags[dim.id]||[]).some(t=>t.id===tag.id)).length,
    ...rule, scoring_scope:scope(dim.id)
  });
}
const actualIds = new Set(rows.map(r=>r.id));
for(const id of rules.keys()) if(!actualIds.has(id)) throw Error('Unknown audit id '+id);
const violations = [];
for(const c of characters) for(const d of taxonomy.dimensions) {
  const a=c.tags[d.id]||[];
  if(d.max && a.length>d.max) violations.push({id:c.id,name:c.name,dimension:d.id,count:a.length,max:d.max,tags:a.map(t=>t.id)});
}
const overlaps = [
  ['loyal','val_loyalty'],['protective','val_protective'],
  ['revengeful','val_revenge'],['ambitious','val_ambition'],
  ['honorable','val_honor'],['eye_heterochromia','sp_heterochromia'],
  ['hair_hime','sp_hime_cut']
].map(([a,b])=>({a,b,characters:characters.filter(c=>{
  const ids=new Set(Object.values(c.tags).flat().map(t=>t.id));return ids.has(a)&&ids.has(b);
}).length}));
const summary = {characters:characters.length,dimensions:taxonomy.dimensions.length,
  tags:rows.length,missing_definitions:rows.filter(r=>!r.current_definition).length,
  actions:rows.reduce((o,r)=>(o[r.action]=(o[r.action]||0)+1,o),{}),
  limit_violations:violations.length};
const result={scope:'标签体系审查，不是逐角色事实核验；不修改生产数据库。',summary,rows,violations,overlaps};
fs.writeFileSync(path.join(root,'data/waifu-tags-audit.json'),JSON.stringify(result,null,2)+'\n');
const md=[
  '# 二次元角色标签逐项审查',
  '',
  '审查对象：当前 v2 标签体系及 1022 位角色中的使用情况。逐项审查分类语义、重叠与计分适用性；未核实每个角色的原作事实，也未改写现有数据库。',
  '',
  '## 结论',
  '',
  `共 ${summary.dimensions} 类、${summary.tags} 个标签；${summary.missing_definitions} 个没有单独定义；${summary.limit_violations} 处角色分类数量超限。`,
  '',
  '“乐子搞事”混合了幽默、恶作剧和喜剧效果，应停用旧含义并重新标注，不可直接全量迁移为“幽默”。',
  '',
  '50 轮测试不适合对全部 209 个标签作稳定断言。建议底层保留细属性，首版核心画像选约 30—50 个经复核的特征，并按有效对比次数决定是否展示；这是产品设计起点，不是统计保证。',
  '',
  '## 计分与迁移规则',
  '',
  '- 外貌按具体展示图/角色版本标注；不同形态不混在同一条记录。',
  '- 性格须有行为证据，不能由发色、眼神或作品题材反推。',
  '- 职业、种族、剧情定位、能力分开；背景与关系不自动进入核心性格分。',
  '- 父子标签、近义标签及跨类别重复标签按同一证据组计算，不能累计放大。',
  '- 拆分必须复核旧角色，不能把旧复合标签同时复制给每个新标签。',
  '- 缺失、未知、不适用分开保存；无发不等于“不喜欢所有发色”。',
  '- 固定数值 confidence 不是准确率；记录每项来源与审核状态，局部修正不算整角色审核。',
  '- 通用角色偏好测试不对未成年人生成性化身体或关系画像。',
  '',
  '## 当前类别',
  '',
  '| 类别 | 标签数 | 默认用途 |',
  '|---|---:|---|',
  ...taxonomy.dimensions.map(d=>`| ${d.name} (${d.id}) | ${d.tags.length} | ${scope(d.id)} |`),
  '',
  '## 审查动作统计',
  '',
  ...Object.entries(summary.actions).map(([k,v])=>`- ${k}：${v} 项。`),
  '',
  '## 全部标签审查'
];
for(const d of taxonomy.dimensions){
  md.push('',`### ${d.name} (${d.id})`,'','| 原标签 / ID | 角色数 | 处理 | 建议含义 | 原因与迁移约束 |','|---|---:|---|---|---|');
  for(const r of rows.filter(r=>r.dimension===d.id))md.push(`| ${r.current_name} / ${r.id} | ${r.occurrences} | ${r.action} | ${r.proposed} | ${r.reason}${r.current_definition?'':' 当前缺少单独定义。'} |`);
}
md.push('','## 重复特征同时命中情况','','| 标签对 | 同时命中的角色数 |','|---|---:|',...overlaps.map(o=>`| ${o.a} + ${o.b} | ${o.characters} |`));
md.push('','## 超出当前分类数量限制的记录','','这些记录可能是版本混合、重复或分类上限不合理，需要逐条复核，不能自动截断。','','| 角色 | 类别 | 数量/上限 | 标签 |','|---|---|---|---|',...violations.map(v=>`| ${v.name} (${v.id}) | ${v.dimension} | ${v.count}/${v.max} | ${v.tags.join(', ')} |`));
fs.writeFileSync(path.join(root,'data/waifu-tags-audit.md'),md.join('\n')+'\n');
console.log(JSON.stringify({summary,overlaps},null,2));
