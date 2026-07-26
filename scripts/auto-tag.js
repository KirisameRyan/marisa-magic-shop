// =============================================
//  角色智能预标注引擎
//  基于角色描述关键词 + 已知作品模式，自动加权打分后选标签
//  输出: data/waifu-db.json
// =============================================

const fs = require('fs');
const path = require('path');

const CHARS_FILE = path.join(__dirname, '..', 'data', 'anilist-characters.json');
const TAGS_FILE = path.join(__dirname, '..', 'data', 'waifu-tags.json');
const DB_FILE = path.join(__dirname, '..', 'data', 'waifu-db.json');

const chars = JSON.parse(fs.readFileSync(CHARS_FILE, 'utf-8'));
const taxonomy = JSON.parse(fs.readFileSync(TAGS_FILE, 'utf-8'));

// ── 关键词规则: 每个标签对应一组英文/日文关键词 ──
const keywordRules = {
  // 性格
  gentle: [/kind/i, /gentle/i, /caring/i, /compassion/i, /warm/i, /soft/i, /healing/i, /motherly/i, /polite/i],
  tsundere: [/tsundere/i, /harsh.*kind/i, /cold.*warm/i, /blunt/i, /doesn.*show.*feeling/i, /embarrass/i],
  genki: [/energetic/i, /cheerful/i, /lively/i, /bright/i, /enthusias/i, /hyper/i, /upbeat/i],
  airhead: [/airhead/i, /clumsy/i, /forgetful/i, /spacey/i, /naive/i, /simple.*minded/i, /ditzy/i, /dense/i],
  kuudere: [/quiet/i, /emotionless/i, /expressionless/i, /stoic/i, /reserved/i, /calm/i, /silent/i, /cool/i],
  yandere: [/yandere/i, /obsess/i, /possess/i, /dangerous.*love/i, /psychotic/i, /kill.*love/i],
  mature: [/mature/i, /reliable/i, /responsible/i, /motherly/i, /elder.*sister/i, /onee.*san/i],
  mysterious: [/myster/i, /secret/i, /unknown.*past/i, /enigmatic/i, /hidden/i],
  comedic: [/comedic/i, /funny/i, /joke/i, /chaotic/i, /random/i, /troll/i, /prank/i],
  cold: [/cold/i, /ruthless/i, /cruel/i, /merciless/i, /strict/i, /cold.*hearted/i, /aloof/i],
  fukuro: [/manipulat/i, /calculating/i, /scheming/i, /deceptive.*sweet/i, /hidden.*side/i],
  chuunibyou: [/chuunibyou/i, /delusion/i, /fantasy.*real/i, /eighth.*grade/i],
  queen: [/dominant/i, /command/i, /queen/i, /bossy/i, /control/i, /superior/i],
  imouto: [/little.*sister/i, /younger.*sister/i, /imouto/i, /clingy/i, /spoil/i],
  no_expression: [/no.*emotion/i, /blank.*face/i, /poker.*face/i, /emotionless/i, /robotic/i],

  // 外表年龄
  age_v_loli: [/child/i, /young.*girl/i, /elementary/i, /loli/i, /petite.*young/i, /small.*girl/i],
  age_v_mature: [/adult/i, /woman/i, /mature.*woman/i, /older/i, /grown/i, /lady/i],

  // 年龄气质
  age_a_kouhai: [/junior/i, /younger/i, /kouhai/i, /underclassman/i, /student.*young/i],
  age_a_senpai: [/senior/i, /older/i, /senpai/i, /wise/i, /experience/i, /mentor/i],

  // 年龄悖论
  age_p_loli_baba: [/thousand.*year/i, /centur/i, /immortal.*young/i, /ancient.*appearance/i, /elf.*mage/i],

  // 身份
  student: [/student/i, /school/i, /class/i, /grade/i, /academy/i],
  transfer: [/transfer.*student/i, /new.*school/i],
  class_officer: [/president/i, /class.*rep/i, /student.*council/i, /committee/i],
  warrior: [/warrior/i, /fighter/i, /sword/i, /combat/i, /soldier/i, /military/i, /knight/i, /mercenar/i],
  idol: [/idol/i, /singer/i, /performer/i, /stage/i, /music/i, /entertain/i],
  mage: [/magic/i, /witch/i, /wizard/i, /sorcer/i, /spell/i, /caster/i, /mage/i],
  noble: [/princess/i, /noble/i, /royal/i, /aristocrat/i, /heiress/i, /rich.*family/i],
  godly: [/god/i, /goddess/i, /deity/i, /spirit/i, /angel/i, /divine/i, /holy.*being/i, /immortal/i],
  assassin: [/assassin/i, /killer/i, /hitman/i, /mercenar/i, /ninja/i, /spy/i],
  healer: [/heal/i, /nurse/i, /doctor/i, /shrine.*maiden/i, /miko/i, /priest/i],
  isekai_resident: [/isekai/i, /another.*world/i, /fantasy.*world/i],
  scientist: [/scientist/i, /researcher/i, /genius/i, /experiment/i, /lab/i],
  detective: [/detective/i, /investigat/i, /myster/i, /solve.*case/i],
  office_lady: [/office/i, /workplace/i, /salary/i, /corporat/i, /job/i],
  maid: [/maid/i, /servant/i, /butler/i],
  non_human_race: [/elf/i, /demon/i, /vampire/i, /dragon/i, /beast/i, /fairy/i, /oni/i, /yokai/i, /spirit/i],
  wanderer: [/wander/i, /travel/i, /adventurer/i, /journey/i],
  housewife: [/housewife/i, /cook/i, /homemak/i, /domestic/i],

  // 作品基调
  tone_battle: [/battle/i, /fight/i, /combat/i, /action/i, /war/i],
  tone_romance: [/romance/i, /love.*story/i, /romantic/i, /dating/i],
  tone_dark: [/dark/i, /horror/i, /tragedy/i, /death/i, /psychological/i, /violent/i],
  tone_healing: [/slice.*life/i, /healing/i, /heartwarm/i, /wholesome/i],
  tone_comedy: [/comedy/i, /funny/i, /gag/i, /parody/i, /humor/i],
  tone_scifi: [/sci.*fi/i, /future/i, /mecha/i, /space/i, /technology/i],
  tone_historical: [/histor/i, /samurai/i, /feudal/i, /ancient/i, /period/i],
  tone_yuri: [/yuri/i, /girl.*love/i, /shoujo.*ai/i],
  tone_harem: [/harem/i, /multiple.*girl/i],
  tone_sports: [/sport/i, /competition/i, /race/i, /tournament/i, /athletic/i],
  tone_music: [/music/i, /band/i, /orchestra/i, /concert/i, /instrument/i],
  tone_survival: [/survival/i, /death.*game/i, /kill.*game/i],

  // 相处模式
  rel_dependent: [/depend/i, /need.*protect/i, /rely/i, /support.*her/i],
  rel_equal: [/equal/i, /partner/i, /together/i, /companion/i],
  rel_leader: [/strong.*woman/i, /lead/i, /guide/i, /dominant.*female/i],
  rel_healer: [/heal.*heart/i, /comfort/i, /warm.*presence/i],
  rel_buddy: [/casual/i, /easygoing/i, /laid.*back/i],

  // 说话方式
  comm_frank: [/blunt/i, /outspoken/i, /straightforward/i, /frank/i, /direct/i],
  comm_reserved: [/reserved/i, /quiet/i, /gentle.*speak/i, /soft.*spoken/i],
  comm_snarky: [/sarcastic/i, /snarky/i, /witty/i, /tease/i, /cynical/i],
  comm_silent: [/silent/i, /quiet.*rarely.*speak/i, /wordless/i],
  comm_sweet: [/cute.*voice/i, /sweet.*voice/i, /soft.*speak/i, /adorable.*speak/i],
  comm_rational: [/logical/i, /ration/i, /analytic/i, /intelligent.*speak/i],
  comm_volatile: [/mood.*swing/i, /emotion.*unstable/i, /up.*down/i],

  // 价值观
  val_justice: [/justice/i, /righteous/i, /protect.*weak/i, /fair/i],
  val_freedom: [/freedom/i, /free.*spirit/i, /independen/i, /free.*will/i],
  val_kindness: [/kind/i, /compassionate/i, /selfless/i, /altruistic/i],
  val_utilitarian: [/pragmatic/i, /calculating/i, /utilitarian/i, /efficient/i],
  val_protective: [/protect/i, /sacrifice/i, /guard/i, /devoted/i],
  val_independent: [/independent/i, /self.*sufficient/i, /own.*path/i],

  // 发色
  hair_black: [/black.*hair/i, /raven.*hair/i, /dark.*hair/i],
  hair_white: [/white.*hair/i, /silver.*hair/i, /platinum.*hair/i],
  hair_blonde: [/blonde/i, /blond/i, /golden.*hair/i, /yellow.*hair/i],
  hair_red: [/red.*hair/i, /pink.*hair/i, /crimson.*hair/i, /scarlet.*hair/i],
  hair_blue: [/blue.*hair/i, /cyan.*hair/i, /azure.*hair/i],
  hair_purple: [/purple.*hair/i, /violet.*hair/i],
  hair_green: [/green.*hair/i],
  hair_brown: [/brown.*hair/i, /brunette/i, /chestnut.*hair/i],
  hair_long: [/long.*hair/i],
  hair_short: [/short.*hair/i],
  hair_twintail: [/twintail/i, /twin.*tail/i, /pigtail/i],
  hair_ponytail: [/ponytail/i, /pony.*tail/i],
  hair_bob: [/bob.*cut/i, /bob.*hair/i],
  hair_bun: [/bun.*hair/i, /hair.*bun/i],
  hair_braid: [/braid/i, /plaited.*hair/i],
  hair_curl: [/curl.*hair/i, /wavy.*hair/i, /curly.*hair/i],

  // 身材
  body_petite: [/flat.*chest/i, /small.*chest/i, /petite/i, /flat.*bust/i],
  body_busty: [/large.*chest/i, /big.*breast/i, /busty/i, /voluptuous/i],
  body_loli_height: [/short.*stature/i, /small.*statue/i, /tiny/i, /petite.*height/i],
  body_tall: [/tall/i, /height.*above/i],
  skin_pale: [/pale.*skin/i, /fair.*skin/i, /white.*skin/i, /porcelain.*skin/i],
  skin_tanned: [/tanned/i, /dark.*skin/i, /brown.*skin/i, /tan.*skin/i],
  skin_ghostly: [/ghostly.*pale/i, /deathly.*pale/i],

  // 瞳色
  eye_red: [/red.*eye/i, /crimson.*eye/i, /scarlet.*eye/i],
  eye_blue: [/blue.*eye/i, /sapphire.*eye/i, /azure.*eye/i],
  eye_green: [/green.*eye/i, /emerald.*eye/i],
  eye_purple: [/purple.*eye/i, /violet.*eye/i, /amethyst/i],
  eye_gold: [/gold.*eye/i, /golden.*eye/i, /amber.*eye/i, /yellow.*eye/i],
  eye_brown: [/brown.*eye/i, /dark.*eye/i],
  eye_empty: [/empty.*eye/i, /lifeless.*eye/i, /dull.*eye/i, /deadpan/i],

  // 特殊特征
  sp_nekomimi: [/cat.*ear/i, /nekomimi/i, /catgirl/i],
  sp_tail: [/tail/i],
  sp_horn: [/horn/i, /oni.*horn/i],
  sp_wings: [/wings/i, /winged/i],
  sp_elf_ear: [/elf.*ear/i, /pointed.*ear/i, /elf.*girl/i],
  sp_mecha: [/cyborg/i, /android/i, /robot/i, /mecha/i, /artificial/i],
  sp_scar: [/scar/i, /bandage/i],
  sp_glasses: [/glasses/i, /spectacles/i],
  sp_heterochromia: [/heterochromia/i, /different.*color.*eye/i],
  sp_ahoge: [/ahoge/i, /cowlick/i],
  sp_vampire_fangs: [/fang/i, /vampire/i],
  sp_inhuman: [/monster/i, /slime/i, /alien/i],
  sp_eyepatch: [/eyepatch/i, /eye.*patch/i],
};

// ── 系列已知模式 ──
const seriesTraits = {
  'Re:Zero kara Hajimeru Isekai Seikatsu': { tone: 'tone_dark' },
  'Re:Zero': { tone: 'tone_dark' },
  'Shingeki no Kyojin': { tone: 'tone_dark' },
  'Chainsaw Man': { tone: 'tone_dark' },
  'Jujutsu Kaisen': { tone: 'tone_battle' },
  'Demon Slayer': { tone: 'tone_battle' },
  'Kimetsu no Yaiba': { tone: 'tone_battle', historical: true },
  'Sousou no Frieren': { tone: 'tone_healing', wanderer: true },
  'Frieren': { tone: 'tone_healing', wanderer: true },
  'Kaguya-sama': { tone: 'tone_romance', comedy: true },
  'Kaguya-sama wa Kokurasetai': { tone: 'tone_romance', comedy: true },
  'Steins;Gate': { tone: 'tone_scifi', mystery: true },
  'Violet Evergarden': { tone: 'tone_healing' },
  'Kusuriya no Hitorigoto': { tone: 'tone_historical', mystery: true },
  'Bocchi the Rock': { tone: 'tone_music' },
  'K-ON!': { tone: 'tone_music' },
  'Oshi no Ko': { tone: 'tone_dark', idol: true },
  'Made in Abyss': { tone: 'tone_dark' },
  'Genshin Impact': { tone: 'tone_scifi' },
  'Sword Art Online': { tone: 'tone_scifi', battle: true },
  'Date A Live': { tone: 'tone_harem' },
  'The Quintessential Quintuplets': { tone: 'tone_harem' },
  'Gotoubun': { tone: 'tone_harem' },
  'Fate': { tone: 'tone_battle' },
  'One Piece': { tone: 'tone_battle' },
  'Naruto': { tone: 'tone_battle' },
  'Bleach': { tone: 'tone_battle' },
  'Hunter': { tone: 'tone_battle' },
  'Love Live': { tone: 'tone_music', idol: true },
  'Madoka': { tone: 'tone_dark', magical_girl: true },
  'Mahou Shoujo Madoka': { tone: 'tone_dark' },
  'Spy x Family': { tone: 'tone_romance', comedy: true },
  'Komi-san': { tone: 'tone_romance', comedy: true },
  'My Dress-Up Darling': { tone: 'tone_romance' },
  'Sono Bisque Doll': { tone: 'tone_romance' },
  'Horimiya': { tone: 'tone_romance' },
  'Toradora': { tone: 'tone_romance' },
  'Bunny Girl Senpai': { tone: 'tone_romance', mystery: true },
  'Seishun Buta Yarou': { tone: 'tone_romance', mystery: true },
  'Monogatari': { tone: 'tone_mystery' },
  'Death Note': { tone: 'tone_mystery', dark: true },
  'Danganronpa': { tone: 'tone_survival' },
  'Mirai Nikki': { tone: 'tone_survival', dark: true },
  'Konosuba': { tone: 'tone_comedy', isekai: true },
  'Code Geass': { tone: 'tone_battle', dark: true },
  'Overlord': { tone: 'tone_battle', dark: true },
  'Hataraku Maou-sama': { tone: 'tone_comedy' },
  'Tensei Shitara Slime': { tone: 'tone_scifi', isekai: true },
  'Hyouka': { tone: 'tone_mystery' },
  'Charlotte': { tone: 'tone_scifi' },
  'Angel Beats': { tone: 'tone_dark' },
  'Clannad': { tone: 'tone_healing' },
  'Anohana': { tone: 'tone_healing' },
  'Your Lie in April': { tone: 'tone_healing', music: true },
  'Shigatsu wa Kimi no Uso': { tone: 'tone_healing', music: true },
  'Sakurasou': { tone: 'tone_romance' },
  'Boku wa Tomodachi': { tone: 'tone_romance' },
  'Yahari Ore': { tone: 'tone_romance' },
  'Oregairu': { tone: 'tone_romance' },
  'Saenai Heroine': { tone: 'tone_romance' },
  'Guilty Crown': { tone: 'tone_dark' },
  'Darling in the Franxx': { tone: 'tone_battle', dark: true },
  'Neon Genesis Evangelion': { tone: 'tone_dark', scifi: true },
  'Cowboy Bebop': { tone: 'tone_scifi' },
  'Fullmetal Alchemist': { tone: 'tone_battle' },
  'Tokyo Ghoul': { tone: 'tone_dark' },
  'No Game No Life': { tone: 'tone_scifi', isekai: true },
  'Youjo Senki': { tone: 'tone_battle', dark: true },
  'The Saga of Tanya': { tone: 'tone_battle', dark: true },
  'Shield Hero': { tone: 'tone_battle', dark: true, isekai: true },
  'Tate no Yuusha': { tone: 'tone_battle', dark: true, isekai: true },
  'Mushoku Tensei': { tone: 'tone_scifi', isekai: true },
  'Cyberpunk': { tone: 'tone_scifi', dark: true },
  '86': { tone: 'tone_scifi', dark: true, battle: true },
  'AOT': { tone: 'tone_dark' },
  'Vinland Saga': { tone: 'tone_battle', historical: true },
  'Lycoris Recoil': { tone: 'tone_yuri', battle: true },
  'Bloom Into You': { tone: 'tone_yuri' },
  'Yagate Kimi ni Naru': { tone: 'tone_yuri' },
  'A Place Further': { tone: 'tone_healing' },
  'Yuru Camp': { tone: 'tone_healing' },
  'Non Non Biyori': { tone: 'tone_healing' },
  'Nichijou': { tone: 'tone_comedy' },
  'Danshi Koukousei': { tone: 'tone_comedy' },
  'Asobi Asobase': { tone: 'tone_comedy' },
  'Grand Blue': { tone: 'tone_comedy' },
  'One Punch Man': { tone: 'tone_comedy', battle: true },
  'Mob Psycho': { tone: 'tone_comedy', battle: true },
  'Food Wars': { tone: 'tone_sports', comedy: true },
  'Shokugeki': { tone: 'tone_sports', comedy: true },
  'Haikyuu': { tone: 'tone_sports' },
  'Kuroko': { tone: 'tone_sports' },
  'Blue Lock': { tone: 'tone_sports' },
  'Initial D': { tone: 'tone_sports' },
  'Toaru': { tone: 'tone_battle', scifi: true },
  'Railgun': { tone: 'tone_battle', scifi: true },
  'Index': { tone: 'tone_battle', scifi: true },
  'Akame ga Kill': { tone: 'tone_dark', battle: true },
  'Kill la Kill': { tone: 'tone_battle', comedy: true },
  'Gurren Lagann': { tone: 'tone_battle', scifi: true },
  'Evangelion': { tone: 'tone_dark', scifi: true },
  'Eva': { tone: 'tone_dark', scifi: true },
  'Black Butler': { tone: 'tone_historical', dark: true },
  'Kuroshitsuji': { tone: 'tone_historical', dark: true },
  'Black Lagoon': { tone: 'tone_dark' },
  'Hellsing': { tone: 'tone_dark' },
  'Psycho-Pass': { tone: 'tone_dark', scifi: true },
  'Ghost in the Shell': { tone: 'tone_scifi' },
  'Serial Experiments Lain': { tone: 'tone_dark', scifi: true },
  'Elfen Lied': { tone: 'tone_dark' },
  'Higurashi': { tone: 'tone_dark', mystery: true },
  'Umineko': { tone: 'tone_dark', mystery: true },
  'Another': { tone: 'tone_dark', mystery: true },
};

function matchSeries(series, trait) {
  for (const [key, val] of Object.entries(seriesTraits)) {
    if (series.toLowerCase().includes(key.toLowerCase())) {
      return val[trait] || false;
    }
  }
  return false;
}

function getTagsForChar(char) {
  const desc = char.description || '';
  const name = char.name || '';
  const source = char.source_anime || '';
  const native = char.name_native || '';
  const allText = [name, native, source, desc].join(' ');

  const tags = {};
  const dims = taxonomy.dimensions;

  for (const dim of dims) {
    tags[dim.id] = [];
    for (const tag of dim.tags) {
      const rules = keywordRules[tag.id];
      if (!rules) continue;

      let score = 0;
      for (const re of rules) {
        if (re.test(allText)) score++;
      }

      // 系列匹配加权
      if (dim.id === 'series_tone') {
        if (tag.id === 'tone_battle' && matchSeries(source, 'battle')) score += 3;
        if (tag.id === 'tone_dark' && matchSeries(source, 'dark')) score += 3;
        if (tag.id === 'tone_healing' && matchSeries(source, 'tone_healing')) score += 3;
        if (tag.id === 'tone_comedy' && matchSeries(source, 'comedy')) score += 3;
        if (tag.id === 'tone_romance' && matchSeries(source, 'tone_romance')) score += 3;
        if (tag.id === 'tone_scifi' && matchSeries(source, 'scifi')) score += 3;
        if (tag.id === 'tone_historical' && matchSeries(source, 'historical')) score += 3;
        if (tag.id === 'tone_mystery' && matchSeries(source, 'mystery')) score += 3;
        if (tag.id === 'tone_music' && matchSeries(source, 'music')) score += 3;
        if (tag.id === 'tone_survival' && matchSeries(source, 'survival')) score += 3;
        if (tag.id === 'tone_yuri' && matchSeries(source, 'yuri')) score += 3;
      }

      if (dim.id === 'role') {
        if (tag.id === 'wanderer' && matchSeries(source, 'wanderer')) score += 3;
        if (tag.id === 'idol' && matchSeries(source, 'idol')) score += 3;
        if (tag.id === 'isekai_resident' && matchSeries(source, 'isekai')) score += 3;
      }

      if (score > 0) {
        const entry = { id: tag.id };
        // 性格维度加 level
        if (dim.id === 'personality' && score >= 2) {
          entry.level = Math.min(1, score / 4);
        }
        tags[dim.id].push(entry);
      }
    }
  }

  // ── 保底规则 ──
  // 默认年龄感 = 少女型
  if (tags.age_visual.length === 0) {
    tags.age_visual.push({ id: 'age_v_teen' });
  }
  // 默认同龄感
  if (tags.age_aura.length === 0) {
    tags.age_aura.push({ id: 'age_a_douki' });
  }

  return tags;
}

function buildDb() {
  const db = [];
  for (const char of chars) {
    db.push({
      id: char.id,
      name: char.name,
      name_native: char.name_native,
      image: char.image,
      description: char.description,
      source_anime: char.source_anime,
      source_type: char.source_type,
      favourites: char.favourites,
      tags: getTagsForChar(char)
    });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  console.log(`Done. ${db.length} characters -> ${DB_FILE}`);

  // 统计
  let totalTags = 0; let maxTags = 0; let minTags = Infinity; let zeroTags = 0;
  for (const c of db) {
    let n = 0; for (const dim in c.tags) n += c.tags[dim].length;
    totalTags += n;
    if (n > maxTags) maxTags = n;
    if (n < minTags) minTags = n;
    if (n === 0) zeroTags++;
  }
  console.log(`Avg tags/char: ${(totalTags/db.length).toFixed(1)}, Max: ${maxTags}, Min: ${minTags}, Zero: ${zeroTags}`);
}

buildDb();
