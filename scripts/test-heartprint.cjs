const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const E=require('../js/heartprint-engine.js');
const definitions=[
  {id:'shared',label:'共同',aspect:'visual',group:'hair'},
  {id:'white',label:'白发',aspect:'visual',group:'hair'},
  {id:'black',label:'黑发',aspect:'visual',group:'hair'},
  {id:'gentle',label:'温柔',aspect:'character',group:'personality'}
];
const characters=[
  {id:1,pool:'female',name:'A',image:'a',traits:['shared','white','gentle'],knownGroups:['hair','personality']},
  {id:2,pool:'female',name:'B',image:'b',traits:['shared','black'],knownGroups:['hair','personality']},
  {id:3,pool:'male',name:'C',image:'c',traits:[],knownGroups:[]}
];
const fixture={definitions,characters};
const unknown=E.create('all');unknown.pair=[1,2];unknown.known={1:false,2:false};
assert.throws(()=>E.record(unknown,1,'character'));
const defaults=E.create('all');defaults.pair=[1,2];E.record(defaults,1,'character');
assert.equal(defaults.history.length,1);assert.equal(defaults.history[0].bothKnown,true);
let s=E.create('all');s.pair=[1,2];E.record(s,1,'visual');
let r=E.summarize(s,fixture);
assert.equal(r.rows.find(t=>t.id==='shared').n,0,'shared tags are not exposures');
assert.equal(r.rows.find(t=>t.id==='white').score,20);
assert.equal(r.rows.find(t=>t.id==='black').score,-20);
assert.equal(r.rows.find(t=>t.id==='gentle').n,0,'visual choice cannot imply personality');
s.pair=[1,2];s.known={1:true,2:true};E.record(s,1,'character');
r=E.summarize(s,fixture);
assert.equal(r.rows.find(t=>t.id==='white').n,2,'combined choices count appearance');
assert.equal(r.rows.find(t=>t.id==='gentle').n,1);
s.pair=[1,3];E.record(s,1,'visual');
assert.equal(E.summarize(s,fixture).rows.find(t=>t.id==='white').n,2,'unknown is not negative evidence');
const combinedOnly=E.create('all');combinedOnly.pair=[1,2];E.record(combinedOnly,1,'character');
const combinedSummary=E.summarize(combinedOnly,fixture);
assert.equal(combinedSummary.rows.find(t=>t.id==='white').n,1,'combined choice counts appearance');
assert.equal(combinedSummary.rows.find(t=>t.id==='gentle').n,1,'combined choice counts character');
s.pair=[1,2];E.record(s,null,'skip');assert.equal(E.answered(s),3);
assert.equal(E.summarize(s,fixture).channels.skip,1);
assert(E.undo(s));assert.deepEqual(s.pair,[1,2]);
assert.equal(E.summarize(s,fixture).channels.skip,0);
const repeated=E.create('female');for(let i=0;i<10;i++){repeated.pair=[1,2];E.record(repeated,1,'visual');}
assert.equal(E.summarize(repeated,fixture).rows.find(t=>t.id==='white').eligible,false,'one character repeated is not independent coverage');
assert(E.validate(s,fixture));assert.equal(E.validate({...s,pair:[1,999]},fixture),null);
assert.equal(E.validate({...s,history:[{a:1,b:2,mode:'character',winner:1,bothKnown:false}]},fixture),null);
const focusDefs=[{id:'rare',label:'稀有',aspect:'character',group:'personality'},{id:'common',label:'常见',aspect:'character',group:'personality'}];
const focusChars=Array.from({length:12},(_,i)=>({id:i+1,pool:'female',name:'F'+(i+1),image:'x',
  traits:i===0?['rare']:['common'],knownGroups:['personality'],favourites:0}));
const focusState=E.create('female');
focusState.history=[{a:1,b:2,winner:1,mode:'character',bothKnown:true}];
for(let i=0;i<11;i++){const a=2+(i%11),b=2+((i+1)%11);focusState.history.push({a,b,winner:a,mode:'character',bothKnown:true});}
const focusPair=E.nextPair(focusState,{definitions:focusDefs,characters:focusChars},()=>0,'character');
assert(focusPair.includes(1),'focus should pick a carrier');
const focusOpponent=focusChars.find(c=>c.id===(focusPair[0]===1?focusPair[1]:focusPair[0]));
assert(!focusOpponent.traits.includes('rare'),'focus opponent should not carry the trait');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync('data/heartprint-db.js','utf8'),sandbox);
const data=JSON.parse(JSON.stringify(sandbox.window.HEARTPRINT_DATA));
assert.equal(data.characters.length,998);
assert.equal(new Set(data.characters.map(c=>c.id)).size,998);
assert(!data.characters.some(c=>/Boku no Hero Academia|My Hero Academia|我的英雄学院|僕のヒーローアカデミア/i.test(c.source)));
for(const group of ['personality','communication','values','role_identity','race_identity'])
  assert(data.definitions.some(d=>d.group===group),'missing group '+group);
assert(data.characters.some(c=>c.traits.some(t=>t.startsWith('race_'))));
const ids=new Set(data.definitions.map(t=>t.id));
assert.equal(ids.size,data.definitions.length);
for(const c of data.characters)for(const t of c.traits)assert(ids.has(t));
assert(!data.definitions.some(d=>d.group==='series_tone'));
for(const id of ['age_loli','age_shota','age_oneesan','age_mature_male','age_uncle','age_elder_male'])assert(ids.has(id));
const saitama=data.characters.find(c=>c.id===73935);
assert(saitama.traits.includes('length_none'));assert(!saitama.knownGroups.includes('hair_color'));
const chika=data.characters.find(c=>c.id===121103);
assert(!chika.traits.includes('hair_red'),'compound red/pink must not be guessed');
for(const c of data.characters)assert.equal(c.traits.length,new Set(c.traits).size);
for(const pool of ['female','male','all']){
  const run=E.create(pool),seen=new Set();
  for(let i=0;i<50;i++){
    run.pair=E.nextPair(run,data);
    assert(run.pair&&run.pair[0]!==run.pair[1]);
    for(const id of run.pair){assert(!seen.has(id),'characters should not repeat in 50 rounds');seen.add(id);}
    assert(run.pair.every(id=>pool==='all'||data.characters.find(c=>c.id===id).pool===pool));
    const winner=run.pair[i%2];
    if(i%2){run.pair.forEach(id=>run.known[id]=true);E.record(run,winner,'character');}
    else E.record(run,winner,'visual');
    const restored=E.validate(JSON.parse(JSON.stringify(run)),data);assert(restored);
    assert.deepEqual(E.summarize(restored,data),E.summarize(run,data));
  }
  assert(run.done);assert.equal(E.answered(run),50);assert.equal(E.nextPair(run,data),null);
  assert(E.undo(run));assert(!run.done);assert.equal(E.answered(run),49);
}
console.log('Heartprint checks passed: scoring channels, shared/unknown tags, evidence, restore, undo, 3 pools × 50 rounds.');
