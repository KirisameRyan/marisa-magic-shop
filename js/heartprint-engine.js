(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.HeartprintEngine=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1, TARGET=50;
  const groupLabels={hair_color:'发色',hair_length:'发长',hair_style:'发型',age_visual:'外表类型',
    body_type:'体型',skin:'肤色',eye_color:'瞳色',wardrobe:'服装',accessory:'装饰/特征',
    personality:'性格',communication:'沟通方式',values:'价值观',role_identity:'身份/定位',race_identity:'种族/形态'};
  function create(pool='female') {
    return {version:VERSION,pool,history:[],known:{},pair:null,done:false};
  }
  function answered(state){return state.history.filter(h=>h.mode!=='skip').length;}
  function validate(saved,data){
    if(!saved||saved.version!==VERSION||!['female','male','all'].includes(saved.pool)||!Array.isArray(saved.history)||saved.history.length>2000)return null;
    const byId=new Map(data.characters.map(c=>[c.id,c]));
    const allowed=id=>byId.has(id)&&(saved.pool==='all'||byId.get(id).pool===saved.pool);
    for(const h of saved.history) {
      if(!h||!['visual','character','skip'].includes(h.mode)||!allowed(h.a)||!allowed(h.b)||h.a===h.b)return null;
      if(h.mode!=='skip'&&![h.a,h.b].includes(h.winner))return null;
      if(h.mode==='character'&&h.bothKnown!==true)return null;
    }
    if(saved.pair&&(!Array.isArray(saved.pair)||saved.pair.length!==2||!saved.pair.every(allowed)||saved.pair[0]===saved.pair[1]))return null;
    const clean=create(saved.pool);
    clean.history=saved.history.map(h=>({a:h.a,b:h.b,winner:h.winner,mode:h.mode,bothKnown:h.bothKnown===true}));
    for(const [id,value] of Object.entries(saved.known||{}))if(byId.has(Number(id))&&typeof value==='boolean')clean.known[id]=value;
    clean.pair=saved.pair;clean.done=!!saved.done||answered(clean)>=TARGET;
    return clean;
  }
  function record(state,winner,mode) {
    if(state.done||!state.pair||!['visual','character','skip'].includes(mode))throw Error('本轮不能提交');
    const [a,b]=state.pair,bothKnown=state.known[a]!==false&&state.known[b]!==false;
    if(mode!=='skip'&&![a,b].includes(winner))throw Error('请选择本轮角色');
    if(mode==='character'&&!bothKnown)throw Error('双方都了解时才能记录综合偏好');
    state.history.push({a,b,winner:mode==='skip'?null:winner,mode,bothKnown});
    state.pair=null;state.done=answered(state)>=TARGET;
  }
  function undo(state){
    const last=state.history.pop();if(!last)return false;
    state.pair=[last.a,last.b];state.done=false;return true;
  }
  function summarize(state,data){
    const byId=new Map(data.characters.map(c=>[c.id,c]));
    const stats=Object.fromEntries(data.definitions.map(d=>[d.id,{...d,wins:0,losses:0,n:0,characters:new Set(),examples:new Set()}]));
    const channels={visual:0,character:0,skip:0};
    for(const h of state.history){
      channels[h.mode]++;
      if(h.mode==='skip')continue;
      const a=byId.get(h.a),b=byId.get(h.b);
      const winner=h.winner===a.id?a:b,loser=h.winner===a.id?b:a;
      const ws=new Set(winner.traits),ls=new Set(loser.traits);
      for(const d of data.definitions){
        if(h.mode==='visual'&&d.aspect!=='visual')continue;
        if(!winner.knownGroups.includes(d.group)||!loser.knownGroups.includes(d.group))continue;
        const w=ws.has(d.id),l=ls.has(d.id);
        if(w===l)continue; // Shared traits are neither a vote nor an exposure.
        const s=stats[d.id];s.n++;
        if(w)s.wins++;else s.losses++;
        const carrier=w?winner:loser;
        s.characters.add(carrier.id);
        if(w)s.examples.add(carrier.name);
      }
    }
    const poolChars=data.characters.filter(c=>state.pool==='all'||c.pool===state.pool);
    const poolSize=Math.max(1,poolChars.length);
    const rows=Object.values(stats).map(s=>{
      const distinct=s.characters.size;
      const carriers=poolChars.reduce((count,c)=>count+(c.traits.includes(s.id)?1:0),0);
      return {...s,characters:[...s.characters],examples:[...s.examples].slice(0,3),distinct,
        score:Math.round(100*(s.wins-s.losses)/(s.n+4)),
        eligible:s.n>=5&&distinct>=3,
        baseRate:carriers/poolSize,
        rarity:1-carriers/poolSize,
        evidence:s.n===0?'未测到':s.n<5||distinct<3?'线索不足':'可作参考'};
    });
    return {channels,rows,answered:channels.visual+channels.character,
      positive:rows.filter(r=>r.eligible&&r.score>0).sort((a,b)=>b.score-a.score||b.n-a.n)};
  }
  function nextPair(state,data,random=Math.random,focusAspect='character'){
    if(state.done||answered(state)>=TARGET)return null;
    const pool=data.characters.filter(c=>(state.pool==='all'||c.pool===state.pool)&&c.image);
    if(pool.length<2)return null;
    const counts=new Map(),previous=new Set();
    for(const h of state.history){counts.set(h.a,(counts.get(h.a)||0)+1);counts.set(h.b,(counts.get(h.b)||0)+1);previous.add([h.a,h.b].sort((a,b)=>a-b).join(':'));}
    const take=arr=>arr[Math.min(arr.length-1,Math.floor(random()*arr.length))];
    // Prefer new characters. Never let a favourite stay on-screen as a champion.
    let available=pool.filter(c=>!counts.has(c.id));
    if(available.length<2) {
      const min=Math.min(...pool.map(c=>counts.get(c.id)||0));
      available=pool.filter(c=>(counts.get(c.id)||0)<=min+1);
    }
    let first;
    let focusId=null;
    if(answered(state)>=12&&random()<0.35){
      const rows=summarize(state,data).rows;
      const primary=rows.filter(s=>s.aspect===focusAspect&&s.n>0&&!s.eligible&&s.score>0);
      const fallback=rows.filter(s=>s.n>0&&!s.eligible&&s.score>0);
      const candidates=primary.length?primary:fallback;
      candidates.sort((a,b)=>b.rarity-a.rarity||a.n-b.n);
      const focus=candidates[0];
      const matched=focus?available.filter(c=>c.traits.includes(focus.id)):[];
      if(matched.length){first=take(matched);focusId=focus.id;}
    }
    // Early rounds favour the more familiar part of the catalogue, with exploration.
    if(!first){
      const early=available.slice().sort((a,b)=>b.favourites-a.favourites).slice(0,180);
      first=take(answered(state)<10&&random()<0.6?early:available);
    }
    const pairKey=(id,other)=>[id,other].sort((a,b)=>a-b).join(':');
    let others=available.filter(c=>c.id!==first.id&&!previous.has(pairKey(c.id,first.id)));
    if(focusId){
      const different=others.filter(c=>!c.traits.includes(focusId));
      if(different.length)others=different;
    }
    if(!others.length)others=pool.filter(c=>c.id!==first.id&&!previous.has(pairKey(c.id,first.id)));
    if(focusId&&others.length){
      const different=others.filter(c=>!c.traits.includes(focusId));
      if(different.length)others=different;
    }
    if(!others.length)return null;
    // Mixed pool also includes same-gender comparisons; gender itself never scores.
    if(state.pool==='all'&&random()<0.75){
      const same=others.filter(c=>c.pool===first.pool);if(same.length)others=same;
    }
    const second=take(others);
    return random()<0.5?[first.id,second.id]:[second.id,first.id];
  }
  return {VERSION,TARGET,groupLabels,create,validate,answered,record,undo,summarize,nextPair};
});
