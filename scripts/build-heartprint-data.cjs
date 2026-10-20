// Build a conservative scoring view. Original v2 records remain untouched.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = n => JSON.parse(fs.readFileSync(path.join(root, 'data', n), 'utf8'));
const BLOCKED_SERIES = /Boku no Hero Academia|My Hero Academia|我的英雄学院|僕のヒーローアカデミア/i;
const rawDb = read('waifu-db-all-zh.json');
const selected = read('selected-characters-v2.json');
const selectedChars = selected.characters || selected;
const excludedCharacters = selectedChars.filter(c => BLOCKED_SERIES.test(c.source_anime || '')).length;
const db = rawDb.filter(c => !BLOCKED_SERIES.test(c.source || ''));
const definitions = [];
const mappings = new Map();
function add(id, label, group, aspect, sources = []) {
  definitions.push({ id, label, group, aspect });
  for (const source of sources) {
    if (!mappings.has(source)) mappings.set(source, []);
    const list = mappings.get(source);
    if (!list.includes(id)) list.push(id);
  }
}
const visual = (id, label, group, sources = []) => add(id, label, group, 'visual', sources);
const character = (id, label, group, sources = []) => add(id, label, group, 'character', sources);
for (const [id,label] of [['black','黑发'],['white','白毛／银发'],['blonde','金发'],['purple','紫发'],['brown','棕发']])
  visual('hair_'+id,label,'hair_color',['hair_color/hair_'+id]);
for (const [id,label] of [['red','红发'],['pink','粉发'],['blue','蓝发'],['cyan','青发'],['green','绿发'],['gray','灰发']])
  visual('hair_'+id,label,'hair_color'); // Old compound colors require review.
for (const [id,label] of [['short','短发'],['medium','中发'],['long','长发'],['none','光头']])
  visual('length_'+id,label,'hair_length',id==='none'?['special/sp_bald']:['hair_length/hair_'+id]);
for (const [id,label] of [['twintail','双马尾'],['ponytail','单马尾'],['braid','编发'],['bun','盘发'],['curl','卷发']])
  visual('style_'+id,label,'hair_style',['hair_style/hair_'+id]);
visual('style_bob','波波头','hair_style',['hair_length/hair_bob']);
for (const [id,label] of [['loli','萝莉'],['shota','正太'],['shoujo','少女'],['shounen','少年'],
  ['young_female','青年女性'],['young_male','青年男性'],['oneesan','御姐'],['mature_male','熟男'],
  ['uncle','大叔'],['older_female','年长女性'],['elder_male','老年男性'],['elder_female','老年女性']])
  visual('age_'+id,label,'age_visual');
for (const [id,label] of [['slim','纤细'],['muscular','肌肉型'],['chubby','圆润'],['short','矮个']])
  visual('body_'+id,label,'body_type',['body_type/'+(id==='short'?'body_loli_height':'body_'+id)]);
visual('skin_light','浅肤色','skin',['skin/skin_pale']);
for (const [id,label] of [['red','红瞳'],['green','绿瞳'],['purple','紫瞳'],['gold','金瞳'],['black','黑瞳']])
  visual('eye_'+id,label,'eye_color',['eye_color/eye_'+id]);
visual('heterochromia','异色瞳','accessory',['eye_color/eye_heterochromia','special/sp_heterochromia']);
for (const [id,label] of [['maid','女仆装'],['casual','休闲装'],['suit','西装'],['sportswear','运动服']])
  visual('cloth_'+id,label,'wardrobe',['wardrobe/cloth_'+id]);
for (const [id,label] of [['nekomimi','兽耳'],['tail','尾巴'],['horn','角'],['wings','翅膀'],['elf_ear','精灵耳'],
  ['mecha','机械／义体'],['glasses','眼镜'],['ahoge','呆毛'],['maid_headband','女仆头饰'],['eyepatch','眼罩'],
  ['hat','帽子'],['mecha_ear','机械耳']])
  visual(id,label,'accessory',['special/sp_'+id]);
// Keep familiar fandom terminology. Sources expressing the same trait share one ID.
for (const [id,label,sources] of [
  ['gentle','温柔',['personality/gentle']],
  ['tsundere','傲娇',['personality/tsundere']],
  ['genki','元气',['personality/genki']],
  ['kuudere','冷淡寡言',['personality/kuudere','personality/stoic','communication/comm_silent']],
  ['yandere','病娇',['personality/yandere']],
  ['reliable','可靠担当',['personality/mature']],
  ['fukuhara','腹黑',['personality/fukuro']],
  ['chuunibyou','中二',['personality/chuunibyou']],
  ['queen','强势主导',['personality/queen']],
  ['no_expression','三无／表情少',['personality/no_expression']],
  ['brooding','阴郁',['personality/brooding']],
  ['lazy','懒散',['personality/lazy']],
  ['hardworking','努力型',['personality/hardworking']],
  ['shy','害羞',['personality/shy']]
]) character(id,label,'personality',sources);
for (const [id,label,sources] of [
  ['frank','直率',['communication/comm_frank']],
  ['reserved','含蓄',['communication/comm_reserved']],
  ['sweet','甜系表达',['communication/comm_sweet']],
  ['rational','理性表达',['communication/comm_rational']],
  ['teasing','爱逗弄',['communication/comm_teasing']]
]) character(id,label,'communication',sources);
for (const [id,label,sources] of [
  ['loyal','忠诚',['personality/loyal','values/val_loyalty']],
  ['protective','守护型',['personality/protective','values/val_protective']],
  ['honorable','重承诺与荣誉',['personality/honorable','values/val_honor']],
  ['curious','好奇求知',['personality/curious','values/val_knowledge']],
  ['kind','善良利他',['values/val_kindness']],
  ['free','自由不羁',['values/val_freedom']],
  ['independent','独立自主',['values/val_independent']]
]) character(id,label,'values',sources);
for (const [id,label,sources] of [
  ['student','学生',['role/student']],
  ['class_officer','学生干部',['role/class_officer']],
  ['transfer','转学生',['role/transfer']],
  ['warrior','战斗职业',['role/warrior']],
  ['mage','魔法使/术师',['role/mage']],
  ['noble','贵族/王室',['role/noble']],
  ['leader','领袖/队长',['role/leader']],
  ['wanderer','旅人/漂泊者',['role/wanderer']],
  ['assassin','刺客/杀手',['role/assassin']],
  ['detective','侦探/调查员',['role/detective']],
  ['antihero','反英雄',['role/antihero']],
  ['villain','反派',['role/villain']],
  ['athlete','运动员',['role/athlete']],
  ['idol','偶像/艺人',['role/idol']],
  ['worker','职场人',['role/office_lady','role/worker']],
  ['scientist','科学家/研究员',['role/scientist']],
  ['healer','治疗者/巫女',['role/healer']],
  ['mentor','导师/老师',['role/mentor']],
  ['hunter','猎人/赏金猎人',['role/hunter']],
  ['maid','女仆/侍从',['role/maid']],
  ['housewife','主妇/家庭型',['role/housewife']],
  ['chef','厨师',['role/chef']],
  ['doctor','医生/医护',['role/doctor']],
  ['rival','对手/宿敌',['role/rival']]
]) character(id,label,'role_identity',sources);
for (const [id,label,sources] of [
  ['race_nekomimi','猫娘/兽耳',['special/sp_nekomimi']],
  ['race_beast_tail','尾巴/兽人',['special/sp_tail']],
  ['race_horn','角/鬼龙',['special/sp_horn']],
  ['race_wings','翅膀/天使恶魔',['special/sp_wings']],
  ['race_elf','精灵',['special/sp_elf_ear']],
  ['race_vampire','吸血鬼/尖牙',['special/sp_vampire_fangs']],
  ['race_mecha','机械/义体',['special/sp_mecha','special/sp_mecha_ear']],
  ['race_inhuman','人外/非人',['role/non_human_race','special/sp_inhuman']],
  ['race_divine','神明/超自然',['role/godly']]
]) character(id,label,'race_identity',sources);
// Mapping semantics are disclosed in the audit; no generated descriptions are used.
const excluded = new Set(['series_tone','relationship','age_aura','age_paradox','expression']);
const ageMap = {
  age_v_loli: 'age_loli', age_v_shota: 'age_shota',
  age_v_teen: {female:'age_shoujo',male:'age_shounen'},
  age_v_young_adult: {female:'age_young_female',male:'age_young_male'},
  age_v_mature: {female:'age_oneesan',male:'age_mature_male'}
};
const unknownReasons = new Map();
const converted = db.map(c => {
  const ids = new Set(), blocked = new Set(), pending = [];
  for (const [dim, tags] of Object.entries(c.tags)) {
    if (excluded.has(dim)) continue;
    for (const t of tags) {
      if (dim === 'age_visual') {
        const map = ageMap[t.id];
        const id = typeof map === 'string' ? map : map?.[c.pool];
        if (id) ids.add(id);
        else {
          pending.push(dim + '/' + t.id);
          blocked.add(dim);
          unknownReasons.set(dim + '/' + t.id, (unknownReasons.get(dim + '/' + t.id) || 0) + 1);
        }
        continue;
      }
      const mapped = mappings.get(dim + '/' + t.id) || [];
      if (mapped.length) {
        for (const id of mapped) ids.add(id);
      } else {
        pending.push(dim + '/' + t.id);
        // A compound label isn't evidence of absence in that visual category.
        if (['hair_color','eye_color','skin'].includes(dim)) blocked.add(dim);
        unknownReasons.set(dim + '/' + t.id, (unknownReasons.get(dim + '/' + t.id) || 0) + 1);
      }
    }
  }
  if(ids.has('length_none')) {
    for(const d of definitions) if(['hair_color','hair_length','hair_style'].includes(d.group) && d.id!=='length_none') ids.delete(d.id);
    blocked.add('hair_color'); blocked.add('hair_style');
  }
  for(const group of ['hair_length','age_visual','skin']) {
    if(definitions.filter(d=>d.group===group&&ids.has(d.id)).length>1) blocked.add(group);
  }
  // Conflicted categories are not used for scoring until a human resolves them.
  const traits=[...ids].filter(id=>!blocked.has(definitions.find(d=>d.id===id).group));
  return {id:c.id,name:c.name,native:c.name_native||'',source:c.source_anime||'',image:c.image,pool:c.pool,
    favourites:c.favourites||0,traits,
    knownGroups:[...new Set(traits.map(id=>definitions.find(d=>d.id===id).group))],
    needsReview:!!c.tag_meta?.needs_review||pending.length>0||blocked.size>0};
});
const report={
  schemaVersion:1,
  notes:['性格标签是已有资料中的近似线索，不是逐条核验后的事实。',
    '作品基调、关系假设与身份不计入性格分；身份与种族单独作为身份线索。',
    '我的英雄学院角色已从题池排除。',
    '种族标记同时用于视觉装饰和身份/种族；结合角色同时计外貌和角色线索。',
    '共有标签抵消；模糊颜色和冲突外观不猜测迁移；样本不足只靠出题曝光补充，不加稀有分。',
    '萝莉和正太独立保留；仅作中性角色偏好，不作性化解释。',
    '数据库未逐图校验；角色多形态与图片可能不一致，试玩时可报错或跳过。'],
  counts:{characters:converted.length,definitions:definitions.length,activeDefinitions:definitions.filter(d=>converted.some(c=>c.traits.includes(d.id))).length,excludedCharacters},
  unresolved:[...unknownReasons].map(([source,count])=>({source,count})),
  definitions,characters:converted
};
fs.writeFileSync(path.join(root,'data/heartprint-db.js'),'window.HEARTPRINT_DATA = '+JSON.stringify(report)+';\n');
fs.writeFileSync(path.join(root,'data/heartprint-migration-report.json'),JSON.stringify({...report,characters:undefined},null,2)+'\n');
console.log(report.counts);
