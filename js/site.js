(function(){
 'use strict';
 const lib=window.MMS_LIBRARY;if(!lib)return;
 const $=id=>document.getElementById(id),view=document.body.dataset.view||'home';
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function header(){return `<a class="skip-link" href="#main">跳到主要内容</a><header class="site-header"><a class="site-brand" href="index.html"><i class="fa-solid fa-star" aria-hidden="true"></i><span>霧雨魔法店<small>KIRISAME / LITTLE CURIOSITIES</small></span></a><nav aria-label="主导航">${Object.entries(lib.categories).map(([key,c])=>`<a href="${key}.html" ${view===key?'aria-current="page"':''}>${c.name}</a>`).join('')}</nav><a class="header-account" href="mine.html">我的小店 <i class="fa-regular fa-user" aria-hidden="true"></i></a></header>`;}
 function footer(){return `<footer class="site-footer"><div>魔法之森边缘的一间小店。营业时间不定，有趣的事一直在。<br>趣味测试仅供娱乐；故事为虚构创作。</div><div><a href="feedback.html">反馈建议</a><a href="leaderboard.html">排行榜</a><a href="https://space.bilibili.com/1029138222" target="_blank" rel="noopener noreferrer">B站</a><a href="https://github.com/KirisameRyan/marisa-magic-shop" target="_blank" rel="noopener noreferrer">源码</a></div></footer>`;}
 $('siteHeader').innerHTML=header();$('siteFooter').innerHTML=footer();
 function home(){
  const categories=$('categories');categories.innerHTML=Object.entries(lib.categories).map(([key,c],i)=>`<a class="category-card" href="${key}.html"><span class="cat-top"><i class="fa-solid ${c.icon}" aria-hidden="true"></i><span class="number">0${i+1} / ${lib.items.filter(x=>x.category===key).length} 件作品</span></span><h3>${c.name}</h3><p>${c.description}</p><span class="cat-link">去看看 →</span></a>`).join('');
  const featured=lib.items.filter(x=>x.featured&&!x.href.startsWith('zyms/')).slice(0,3);$('featuredList').innerHTML=featured.map((item,i)=>`<a class="work-row" href="${escape(item.href)}"><span class="row-no">0${i+1}</span><div><h3>${escape(item.name)}</h3><p>${escape(item.desc)}</p><span class="row-tag">${lib.categories[item.category].name} / ${escape(item.tag)}</span></div><span class="arrow" aria-hidden="true">↗</span></a>`).join('');
  $('siteSearch').onsubmit=e=>{e.preventDefault();const q=$('homeQuery').value.trim();location.href='explore.html'+(q?'?q='+encodeURIComponent(q):'');};
 }
 function directory(){
  const info=lib.categories[view]||{name:'全部作品',english:'THE COMPLETE SHELF',description:'按用途寻找作品，也可以输入名字或关键词。'};
  $('directoryTitle').textContent=info.name;$('directoryEnglish').textContent=info.english;$('directoryDescription').textContent=info.description;document.title=info.name+' · 霧雨魔法店';
  const perPage=9,base=view==='explore'?lib.items:lib.items.filter(x=>x.category===view);let debounce;
  function read(){const p=new URLSearchParams(location.search);return {q:(p.get('q')||'').slice(0,100),tag:p.get('tag')||'',category:p.get('category')||'',page:Math.max(1,parseInt(p.get('page'),10)||1)};}
  function href(state){const p=new URLSearchParams();for(const [k,v]of Object.entries(state))if(v&&!(k==='page'&&v===1))p.set(k,v);return location.pathname+(p.size?'?'+p:'');}
  function update(patch){const state={...read(),...patch};history.pushState(null,'',href(state));render();}
  function render(){let state=read();const category=lib.categories[state.category]?state.category:'';const scoped=base.filter(x=>!category||x.category===category);const tags=[...new Set(scoped.map(x=>x.tag))];if(!tags.includes(state.tag))state.tag='';
   $('query').value=state.q;$('categoryFilter').hidden=view!=='explore';$('categoryFilter').value=category;
   const results=scoped.filter(x=>(!state.tag||x.tag===state.tag)&&(!state.q||(x.name+' '+x.desc+' '+x.tag).toLowerCase().includes(state.q.toLowerCase())));const pageCount=Math.max(1,Math.ceil(results.length/perPage));state.page=Math.min(state.page,pageCount);history.replaceState(null,'',href({...state,category}));
   $('tagFilters').innerHTML=['',...tags].map(t=>`<button type="button" data-tag="${escape(t)}" aria-pressed="${t===state.tag}">${escape(t||'全部主题')}</button>`).join('');$('resultCount').textContent=`${results.length} 件作品 / ${state.page} · ${pageCount}`;
   $('workGrid').innerHTML=results.slice((state.page-1)*perPage,state.page*perPage).map((x,i)=>`<a class="work-card" href="${escape(x.href)}"><div class="work-top"><span class="work-type">${escape(lib.categories[x.category].english)} / ${String((state.page-1)*perPage+i+1).padStart(2,'0')}</span>${x.badge?`<span class="badge">${escape(x.badge)}</span>`:''}</div><h2>${escape(x.name)}</h2><p>${escape(x.desc)}</p><span class="work-bottom"><span>${escape(x.tag)}</span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span></a>`).join('');
   $('emptyState').hidden=results.length>0;$('workGrid').hidden=results.length===0;$('pagination').innerHTML=pageCount>1?Array.from({length:pageCount},(_,i)=>`<a href="${escape(href({...state,page:i+1,category}))}" ${state.page===i+1?'aria-current="page"':''} aria-label="第 ${i+1} 页">${i+1}</a>`).join(''):'';
  }
  $('categoryFilter').innerHTML='<option value="">所有分类</option>'+Object.entries(lib.categories).map(([k,c])=>`<option value="${k}">${c.name}</option>`).join('');$('categoryFilter').onchange=e=>update({category:e.target.value,tag:'',page:1});
  $('query').oninput=e=>{clearTimeout(debounce);const value=e.target.value;debounce=setTimeout(()=>update({q:value,page:1}),180);};$('tagFilters').onclick=e=>{const b=e.target.closest('[data-tag]');if(b)update({tag:b.dataset.tag,page:1});};$('pagination').onclick=e=>{const a=e.target.closest('a');if(!a||e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();history.pushState(null,'',a.href);render();$('resultsStart').scrollIntoView({block:'start'});};window.addEventListener('popstate',render);render();
 }
 if(view==='home')home();else directory();
})();
