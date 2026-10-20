(function(){
  'use strict';
  const app=document.getElementById('heartprint-app'), E=window.HeartprintEngine, data=window.HEARTPRINT_DATA;
  const KEY='mms_heartprint_v1';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state,screen='intro',mode='character',pool='female',saved=null,imageReady={},renderToken=0,locked=false,noticeTimer;
  let tableAspect='all',tableSearch='';
  const VISUAL_GROUPS=[['hair_color','发色'],['hair_length','发长'],['hair_style','发型'],['eye_color','瞳色'],
    ['age_visual','外表类型'],['body_type','体型'],['skin','肤色'],['wardrobe','服装'],['accessory','装饰/特征']];
  const CHARACTER_GROUPS=[['personality','性格'],['communication','沟通方式'],['values','价值观'],
    ['role_identity','身份/定位'],['race_identity','种族/形态']];
  function notice(text){document.getElementById('notice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>document.getElementById('notice').textContent='',4000);}
  if(!E||!data?.characters?.length){
    app.innerHTML='<section class="loading-state"><h1>角色卡片没有加载成功</h1><p>请检查网络后刷新页面。若从本地文件打开，请改用本地预览地址。</p><button class="button" id="reload">重新加载</button></section>';
    document.getElementById('reload').onclick=()=>location.reload();return;
  }
  const byId=new Map(data.characters.map(c=>[c.id,c]));
  try{saved=E.validate(JSON.parse(localStorage.getItem(KEY)),data);}catch{}
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(state));saved=state;}
    catch{notice('浏览器未能保存进度，请保持页面打开。');}
  }
  function event(name,extra={}){
    if(['localhost','127.0.0.1',''].includes(location.hostname))return;
    // Only aggregate progress; no individual choices or familiarity are sent.
    window.dataLayer?.push({event:name,heartprint_pool:state?.pool||pool,...extra});
  }
  function render(){
    renderToken++;locked=false;app.setAttribute('aria-busy','false');
    if(screen==='intro')intro();else if(screen==='quiz')quiz();else result();
  }
  function intro(){
    const counts={female:0,male:0,all:data.characters.length};data.characters.forEach(c=>counts[c.pool]++);
    app.innerHTML=`
      <section class="hero">
        <div><p class="eyebrow">PREFERENCE STUDY / VOL. 01</p><h1>每一次心动，<em>都有迹可循。</em></h1>
        <p class="lead">两个角色，选一个更喜欢的。<br>用 50 次选择，写下你的二次元心动说明书。</p>
        <span class="hero-note">不熟悉也没关系，取消勾选就能凭眼缘玩。</span></div>
        <aside class="specimen" aria-label="玩法概览"><div class="specimen-head"><span>THE HEARTPRINT FILE</span><span>No. 001</span></div>
          <div class="specimen-big">50<small>次选择</small></div><h2>你的心动说明书</h2>
          <div class="tag-row"><span class="tag">白毛？</span><span class="tag">傲娇？</span><span class="tag">御姐？</span><span class="tag">熟男？</span></div>
          <p class="specimen-caption">只看外观只记外貌；结合角色会一起看。<br>还没看清的部分，就先留白。</p></aside>
      </section>
      <section class="setup"><div class="setup-top"><div><p class="section-kicker">01 / CHOOSE YOUR CAST</p><h2>先选一个角色池</h2></div><span class="subtle">${counts.all.toLocaleString()} 位角色 · 进度自动保存</span></div>
        <div class="pools">${[['female','女性角色','萝莉 · 少女 · 御姐'],['male','男性角色','正太 · 少年 · 熟男'],['all','全部角色','随心选择，不限题池']].map(([id,title,sub])=>`<button class="pool" data-pool="${id}" aria-pressed="${pool===id}"><strong>${title}</strong><span>${sub}<br>${counts[id]} 位角色</span></button>`).join('')}</div>
        <div class="actions"><button class="button" id="start">开启我的档案 <span aria-hidden="true">↗</span></button>
          ${saved?.history?.length?`<button class="button secondary" id="resume">${saved.done?'查看上次档案':'继续上次'} · ${E.answered(saved)}/50</button>`:''}</div>
        <div class="instructions"><div><strong>01 / 默认结合角色</strong><p>默认把两位角色都当作你了解的；不认识就取消勾选。</p></div>
          <div><strong>02 / 不了解就取消</strong><p>取消任意一方后，这一轮自动只看外观，不会把外观印象当成性格证据。</p></div>
          <div><strong>03 / 没把握，先留白</strong><p>允许跳过、撤回和提前查看。样本少的特征不会硬下结论。</p></div></div>
      </section>`;
    app.querySelectorAll('[data-pool]').forEach(b=>b.onclick=()=>{pool=b.dataset.pool;render();});
    document.getElementById('start').onclick=()=>{
      if(saved?.history?.length&&!confirm('开始新档案会替换本机保存的上次进度。继续吗？'))return;
      state=E.create(pool);screen='quiz';event('heartprint_start');save();render();window.scrollTo(0,0);
    };
    const resume=document.getElementById('resume');if(resume)resume.onclick=()=>{state=E.validate(saved,data);screen=state.done?'result':'quiz';render();window.scrollTo(0,0);};
  }
  function quiz(){
    if(!state.pair)state.pair=E.nextPair(state,data,Math.random,mode||'character');
    if(!state.pair){screen='result';render();return;}save();
    const pair=state.pair.map(id=>byId.get(id)),summary=E.summarize(state,data),n=summary.answered;
    const bothKnown=pair.every(c=>state.known[c.id]!==false);
    mode=bothKnown?'character':'visual';
    imageReady={};
    app.innerHTML=`
      <div class="session-head"><div><p class="section-kicker">THE HEARTPRINT FILE / ${state.pool==='female'?'女性角色':state.pool==='male'?'男性角色':'全部角色'}</p><h1>这一次，谁更让你心动？</h1></div><div class="progress-count">${String(n).padStart(2,'0')} <small>/ 50</small></div></div>
      <div class="progress" role="progressbar" aria-label="已完成选择" aria-valuemin="0" aria-valuemax="50" aria-valuenow="${n}"><div class="progress-fill" style="width:${n*2}%"></div></div>
      <div class="session-meta"><span>外观 ${summary.channels.visual} 次 · 综合 ${summary.channels.character} 次</span><span>已跳过 ${summary.channels.skip} 组 · 不计入 50 次</span></div>
      <section class="mode-section" aria-label="选择依据"><div><p class="mode-title" id="mode-title">这一轮，凭眼缘选。</p><p class="mode-hint" id="mode-hint">只记录外观线索；不了解角色也可以选。</p></div>
        <div class="mode-buttons"><button class="mode-btn" id="mode-visual" aria-pressed="true">只看外观</button><button class="mode-btn" id="mode-character" aria-pressed="false">结合角色</button></div></section>
      <section class="duel" aria-label="本轮角色">${pair.map((c,i)=>`
        <article class="character-card"><div class="portrait"><span class="card-index">${i?'B':'A'}</span><span class="image-status" id="image-status-${c.id}">图片加载中…</span><img data-character="${c.id}" alt="${esc(c.name)}的角色形象" referrerpolicy="no-referrer"></div>
          <div class="card-body"><h2>${esc(c.name)}</h2><p class="source" title="${esc(c.source)}">${esc(c.source||'作品资料待补充')}</p>
            <label class="known-check"><input type="checkbox" data-known="${c.id}" ${state.known[c.id]!==false?'checked':''}>我了解这个角色</label>
            <button class="button light choose" data-choose="${c.id}" disabled>选 ${esc(c.name)}</button></div></article>`).join('')}</section>
      <div class="under-duel"><button class="text-btn" id="skip">选不出／跳过这组</button><button class="text-btn" id="undo" ${!state.history.length?'disabled':''}>撤回上一轮</button>
        <button class="text-btn" id="peek" ${n===0?'disabled':''}>先看看画像</button><button class="text-btn" id="home">保存并返回</button></div>
      <p class="footnote">只展示名字、作品和形象，不提前给性格暗示。<br>角色存在不同造型；图片或信息不符时，请跳过这组。</p>`;
    const token=renderToken;
    app.querySelectorAll('img[data-character]').forEach(img=>{
      const id=Number(img.dataset.character);
      img.onload=()=>{if(token!==renderToken)return;imageReady[id]=true;document.getElementById('image-status-'+id).textContent='';updateMode();};
      img.onerror=()=>{if(token!==renderToken)return;imageReady[id]=false;img.style.display='none';document.getElementById('image-status-'+id).textContent='图片暂时无法加载。可以跳过；若熟悉双方，也可结合角色选择。';updateMode();};
      img.src=byId.get(id).image;
    });
    app.querySelectorAll('[data-known]').forEach(input=>input.onchange=()=>{
      state.known[input.dataset.known]=input.checked;save();
      mode=state.pair.every(id=>state.known[id]!==false)?'character':'visual';
      updateMode();
    });
    document.getElementById('mode-visual').onclick=()=>{mode='visual';updateMode();};
    document.getElementById('mode-character').onclick=()=>{if(state.pair.every(id=>state.known[id]!==false)){mode='character';updateMode();}};
    app.querySelectorAll('[data-choose]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.choose),mode));
    document.getElementById('skip').onclick=()=>choose(null,'skip');
    document.getElementById('undo').onclick=()=>{E.undo(state);save();render();};
    document.getElementById('peek').onclick=()=>{screen='result';render();window.scrollTo(0,0);};
    document.getElementById('home').onclick=()=>{save();screen='intro';render();window.scrollTo(0,0);};
    updateMode();
  }
  function updateMode(){
    const both=state.pair.every(id=>state.known[id]!==false),loaded=state.pair.every(id=>imageReady[id]);
    if(!both&&mode==='character')mode='visual';
    document.getElementById('mode-character').disabled=!both;
    document.getElementById('mode-visual').setAttribute('aria-pressed',String(mode==='visual'));
    document.getElementById('mode-character').setAttribute('aria-pressed',String(mode==='character'));
    document.getElementById('mode-title').textContent=mode==='character'?'这一轮，结合你对角色的了解。'
      :both?'这一轮，只看外观。':'这一轮，凭眼缘选。';
    document.getElementById('mode-hint').textContent=mode==='character'
      ?'记录外貌、性格、沟通、价值观、身份与种族线索；剧情和情怀也可能影响选择。'
      :!both?'只记录外观。取消勾选后，这一轮不会把外观印象当成性格证据。'
      :'这一轮只看外观；也可以切回结合角色。只看外观不会给性格加分。';
    app.querySelectorAll('[data-choose]').forEach(b=>b.disabled=locked||(mode==='visual'?!loaded:!both));
  }
  function choose(id,basis){
    if(locked)return;
    if(basis==='visual'&&!state.pair.every(id=>imageReady[id]))return;
    try{locked=true;E.record(state,id,basis);}catch(error){locked=false;notice(error.message);return;}
    if(state.done){screen='result';event('heartprint_complete',{visual_count:E.summarize(state,data).channels.visual,character_count:E.summarize(state,data).channels.character});}
    save();render();
    // Replacing cards must not leave the next pair cropped above the viewport.
    if(screen==='result')window.scrollTo(0,0);
    else app.scrollIntoView({block:'start'});
  }
  function groupCard(summary,group,label){
    const rows=summary.rows.filter(r=>r.group===group);
    const eligibleAny=rows.filter(r=>r.eligible).sort((a,b)=>b.score-a.score||b.n-a.n);
    const eligible=eligibleAny.filter(r=>r.score>0);
    const partial=rows.filter(r=>r.n>0).sort((a,b)=>b.score-a.score||b.n-a.n)[0];
    if(eligible.length){
      const top=eligible[0];
      return `<article class="group-card"><p class="group-label">${esc(label)}</p><h3>${esc(top.label)}</h3><p class="group-meta">${top.score>0?'+':''}${top.score} · ${top.wins}/${top.n} 次 · ${top.distinct} 位角色</p></article>`;
    }
    if(eligibleAny.length){
      const top=eligibleAny[0];
      return `<article class="group-card muted"><p class="group-label">${esc(label)}</p><h3>暂无明显正向</h3><p class="group-meta">最高：${esc(top.label)}（${top.score} · ${top.wins}/${top.n}）</p></article>`;
    }
    if(partial){
      return `<article class="group-card muted"><p class="group-label">${esc(label)}</p><h3>线索不足</h3><p class="group-meta">目前线索：${esc(partial.label)}（${partial.wins}/${partial.n}）</p></article>`;
    }
    return `<article class="group-card muted"><p class="group-label">${esc(label)}</p><h3>未测到</h3><p class="group-meta">还没有足够的对比</p></article>`;
  }
  function groupSection(summary,kicker,title,groups,note='每个子类单独看；没有足够证据的组会留白。'){
    return `<section class="group-section"><div class="group-heading"><p class="section-kicker">${kicker}</p><h2>${title}</h2><p class="subtle">${esc(note)}</p></div>
      <div class="group-grid">${groups.map(([group,label])=>groupCard(summary,group,label)).join('')}</div></section>`;
  }
  function result(){
    const summary=E.summarize(state,data);
    app.innerHTML=`
      <section class="result-top"><div><p class="eyebrow">YOUR HEARTPRINT / ${state.done?'COMPLETE':'IN PROGRESS'}</p><h1>你的二次元<br>心动说明书。</h1>
        <p class="lead">${state.done?'50 次选择已记录。':'这是目前的阶段画像，随时可以继续。'}<br>有迹可循的留下，还没测到的留白。</p></div><div class="stamp"><strong>${summary.answered}</strong>次选择 / 50</div></section>
      ${groupSection(summary,'01 / VISUAL','外观心动线索',VISUAL_GROUPS,'包含只看外观与结合角色的外貌证据；没有足够证据的组会留白。')}
      ${groupSection(summary,'02 / CHARACTER','熟悉角色的综合偏好',CHARACTER_GROUPS,'只来自结合角色；没有足够证据的组会留白。')}
      <section class="result-section"><p class="section-kicker">THE EVIDENCE</p><h2>偏好特征表</h2>
        <p>每个子类单独看。外观组包含只看外观与结合角色的证据，综合组只来自结合角色。正分表示本次对比中相对更常选中，负分表示相对较少；不等于喜欢或讨厌的概率。“线索不足”不进入主要画像。</p>
        <div class="table-filter"><label>查看 <select id="aspect-filter"><option value="all">所有特征</option><option value="visual">外观</option><option value="character">综合</option></select></label>
        <label>搜索 <input type="search" id="trait-search" placeholder="如：傲娇、白毛" value="${esc(tableSearch)}" maxlength="40"></label><span class="subtle" id="row-count"></span></div>
        <div class="table-wrap"><table><thead><tr><th>特征</th><th>偏好分</th><th>选中 / 有效对比</th><th>不同角色</th><th>证据</th></tr></thead><tbody id="trait-rows"></tbody></table></div>
      </section>
      <details><summary>这份画像怎样得出？</summary><ul>
        <li>只看外观只计外貌；结合角色同时计外貌和角色线索。默认把双方都视为了解；取消勾选任意一方后，这一轮只记录外观。综合偏好不是纯性格实验。</li>
        <li>结果按子类分组：外观再分发色、发长、发型、瞳色、外表类型、体型、肤色、服装、装饰；综合再分性格、沟通、价值观、身份/定位、种族/形态。身份和种族是身份线索，不等于性格。</li>
        <li>本版性格/沟通/价值观使用已复核的核心特征，不是全部 v2 标签；未覆盖的高频项会继续留白。</li>
        <li>同一标签双方都有时，既不加减分，也不计为有效对比；相关的重复标签先合并。</li>
        <li>偏好分 = 100 ×（胜 − 负）÷（有效次数 + 4）。这是带保守修正的指标，不是概率。</li>
        <li>至少 5 次差异对比，且带有该特征的角色至少 3 位，才进入主要画像。这是初版门槛，不代表统计显著。</li>
        <li>未出现的特征是“未测到”。选择结果与遇到的对手有关，不代表某个标签单独导致了你的选择。</li>
        <li>中后段会少量补充验证已有线索，同时保留随机探索；每轮更换两个角色。</li>
      </ul></details>
      <details><summary>角色资料与局限</summary><p>角色基础资料沿用站内 AniList / Bangumi 角色库及东方角色资料；部分作品角色不参与题池。标签含模型辅助整理，尚未全部逐图、逐剧情核实。作品基调不参与计分；有歧义的颜色、年龄与造型暂不计分。身份/种族使用模型辅助标签，样本少时只靠出题曝光，不硬下结论。大叔与老年等分类已分别保留，但未经确认的旧记录不会强行归入。</p>
      <p>所有选择与熟悉度仅保存在此浏览器。结果用于虚构角色偏好娱乐，不推断你的现实人格或性取向。</p></details>
      <div class="actions result-actions">
        ${!state.done?'<button class="button" id="continue">继续选择 <span aria-hidden="true">↗</span></button>':''}
        <button class="button secondary" id="poster">保存画像卡片</button>
        <button class="button secondary" id="export">导出完整记录</button>
        <button class="button secondary" id="result-undo" ${!state.history.length?'disabled':''}>撤回上一轮</button>
        <button class="text-btn" id="restart">返回角色池</button></div>`;
    const filter=document.getElementById('aspect-filter');filter.value=tableAspect;
    filter.onchange=()=>{tableAspect=filter.value;renderRows(summary);};
    document.getElementById('trait-search').oninput=e=>{tableSearch=e.target.value;renderRows(summary);};
    renderRows(summary);
    const cont=document.getElementById('continue');if(cont)cont.onclick=()=>{screen='quiz';render();window.scrollTo(0,0);};
    document.getElementById('result-undo').onclick=()=>{E.undo(state);screen='quiz';save();render();window.scrollTo(0,0);};
    document.getElementById('restart').onclick=()=>{screen='intro';render();window.scrollTo(0,0);};
    document.getElementById('export').onclick=()=>download(JSON.stringify({version:1,createdAt:new Date().toISOString(),state,summary,notes:data.notes},null,2),'心动说明书.json','application/json');
    document.getElementById('poster').onclick=()=>poster(summary);
  }
  function renderRows(summary){
    const groups=tableAspect==='visual'?VISUAL_GROUPS:tableAspect==='character'?CHARACTER_GROUPS:[...VISUAL_GROUPS,...CHARACTER_GROUPS];
    const filtered=summary.rows.filter(r=>(tableAspect==='all'||r.aspect===tableAspect)&&r.label.includes(tableSearch.trim()));
    document.getElementById('row-count').textContent=filtered.length+' 项';
    let html='';
    for(const [group,label] of groups){
      const rows=filtered.filter(r=>r.group===group)
        .sort((a,b)=>Number(b.eligible)-Number(a.eligible)||Number(b.n>0)-Number(a.n>0)||b.score-a.score||b.n-a.n);
      if(!rows.length)continue;
      html+=`<tr class="group-row"><th colspan="5">${esc(label)}</th></tr>`;
      html+=rows.map(r=>`<tr><td><strong>${esc(r.label)}</strong></td>
        <td class="score ${r.score<0?'negative':''}">${r.n?(r.score>0?'+':'')+r.score:'—'}</td><td>${r.n?`${r.wins} / ${r.n}`:'—'}</td><td>${r.distinct||'—'}</td><td class="evidence">${r.evidence}</td></tr>`).join('');
    }
    document.getElementById('trait-rows').innerHTML=html||'<tr><td colspan="5">没有匹配的特征。</td></tr>';
  }
  function download(content,name,type){
    const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function poster(summary){
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1200;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f5f4ed';ctx.fillRect(0,0,900,1200);
    ctx.fillStyle='#345943';ctx.font='20px sans-serif';ctx.fillText('霧雨魔法店 / THE HEARTPRINT FILE',70,90);
    ctx.font='bold 56px sans-serif';ctx.fillText('我的二次元',70,200);ctx.fillText('心动说明书',70,274);
    ctx.font='23px sans-serif';ctx.fillText(`已完成 ${summary.answered} / 50 次选择`,70,340);
    let y=430;
    for(const [aspect,label] of [['visual','外观偏好'],['character','综合偏好']]){
      ctx.fillStyle=aspect==='visual'?'#e8ecdf':'#eaddce';ctx.fillRect(55,y-35,790,240);
      ctx.fillStyle='#25382e';ctx.font='22px sans-serif';ctx.fillText(label,80,y);
      const top=summary.positive.filter(r=>r.aspect===aspect).slice(0,2);
      ctx.font='bold 36px sans-serif';ctx.fillText(top.length?top.map(t=>t.label).join(' · '):'还没看清，先留白。',80,y+70,730);
      ctx.font='18px sans-serif';ctx.fillText(top.length?top.map(t=>`${t.label}：${t.wins}/${t.n} 次选中`).join('；'):'比较次数或涉及角色不足，暂不下结论。',80,y+125,730);
      y+=280;
    }
    ctx.fillStyle='#697166';ctx.font='18px sans-serif';ctx.fillText('标签含待复核资料，结果仅供角色偏好娱乐。',70,1050);
    ctx.fillText('综合偏好可能受剧情与情怀影响，不是心理测评。',70,1085);
    ctx.font='17px sans-serif';ctx.fillText('www.azureflame.cloud/quiz-heartprint.html',70,1140);
    canvas.toBlob(blob=>{if(blob)download(blob,'我的心动说明书.png','image/png');else notice('卡片生成失败，请稍后重试。');});
  }
  render();
})();
