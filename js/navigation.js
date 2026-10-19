(function(){
 'use strict';
 const root=new URL('../',document.currentScript.src),link=href=>new URL(href,root).href;
 const style=document.createElement('link');style.rel='stylesheet';style.href=link('css/navigation.css');document.head.append(style);
 function anchor(href,label){const a=document.createElement('a');a.href=link(href);a.textContent=label;return a;}
 function render(){const library=window.MMS_LIBRARY,target=document.getElementById('shopNav');if(!target)return true;if(!library)return false;
  const current=decodeURIComponent(location.pathname).split('/').pop(),item=library.items.find(x=>x.href.split('/').pop()===current);
  const nav=document.createElement('nav');nav.className='shop-bar';nav.setAttribute('aria-label','网站导航');const brand=anchor('index.html','霧雨魔法店');brand.className='brand';nav.append(brand);
  const links=document.createElement('div');links.className='nav-links';for(const [key,category]of Object.entries(library.categories)){const a=anchor(key+'.html',category.name);if(item?.category===key||current===key+'.html')a.setAttribute('aria-current','page');links.append(a);}nav.append(links);
  const button=document.createElement('button');button.id='hamburger';button.className='hamburger';button.setAttribute('aria-label','打开分类菜单');button.setAttribute('aria-controls','navOverlay');button.setAttribute('aria-expanded','false');button.innerHTML='<span></span><span></span><span></span>';nav.append(button);
  const overlay=document.createElement('div');overlay.className='nav-overlay';overlay.id='navOverlay';overlay.hidden=true;
  for(const [key,category]of Object.entries(library.categories)){const heading=document.createElement('div');heading.className='nav-section';heading.textContent=category.name;overlay.append(heading,anchor(key+'.html','查看全部 '+category.name+' →'));for(const entry of library.items.filter(x=>x.category===key&&x.featured).slice(0,2))overlay.append(anchor(entry.href,entry.name));}
  const heading=document.createElement('div');heading.className='nav-section';heading.textContent='小店服务';overlay.append(heading,anchor('explore.html','搜索全部作品'),anchor('mine.html','我的小店'),anchor('feedback.html','反馈建议'));
  function close(){overlay.hidden=true;overlay.classList.remove('show');button.classList.remove('open');button.setAttribute('aria-expanded','false');}
  function toggle(){const show=overlay.hidden;overlay.hidden=!show;overlay.classList.toggle('show',show);button.classList.toggle('open',show);button.setAttribute('aria-expanded',String(show));}
  window.toggleNav=toggle;button.onclick=toggle;document.addEventListener('click',e=>{if(!overlay.contains(e.target)&&!button.contains(e.target))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden){close();button.focus();}});
  target.replaceWith(nav,overlay);return true;
 }
 if(!render()){let attempts=0;const timer=setInterval(()=>{if(render()||++attempts>100)clearInterval(timer);},50);}
})();
