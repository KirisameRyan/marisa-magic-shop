// Canvas-first tool rail and mode-specific, repeatable guided lessons.
(()=>{
 const sidebar=document.querySelector('.sidebar'),workspace=$('photo-workspace');
 let mode=retroStudio.active,tool=null,pixelInfo={frames:0},pendingLesson=false,lessonMode=null,lessonIndex=0;
 const names={source:'素材',style:'风格',adjust:'调节',layers:'文字',export:'导出'};
 const icons={source:'image',style:'wand-magic-sparkles',adjust:'sliders',layers:'layer-group',export:'download'};
 const rail=document.createElement('nav');rail.id='toolRail';rail.className='tool-rail';rail.setAttribute('aria-label','创作工具栏');
 rail.innerHTML=Object.keys(names).map(key=>`<button data-tool="${key}" aria-label="${names[key]}工具" title="${names[key]}" aria-expanded="false" aria-controls="toolPanel"><i class="fa-solid fa-${icons[key]}" aria-hidden="true"></i><span>${names[key]}</span></button>`).join('');document.body.append(rail);
 const modeNav=document.querySelector('.studio-modes');document.querySelector('.topbar').insertBefore(modeNav,document.querySelector('.unified-actions'));
 const help=document.createElement('button');help.id='toolTutorial';help.innerHTML='<i class="fa-regular fa-circle-question" aria-hidden="true"></i><span>教程</span>';document.querySelector('.unified-actions').prepend(help);
 sidebar.id='toolPanel';sidebar.classList.add('tool-panel');sidebar.dataset.mobile='all';sidebar.setAttribute('aria-label','工具参数');sidebar.hidden=true;document.body.append(sidebar);
 const oldChildren=[...sidebar.children];const panelHeader=document.createElement('div');panelHeader.className='tool-panel-heading';panelHeader.innerHTML='<h2 id="toolTitle">素材</h2><button id="closeTool" aria-label="收起工具面板"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
 const body=document.createElement('div');body.className='tool-body';sidebar.replaceChildren(panelHeader,body);
 const panes={};for(const key of Object.keys(names)){const pane=document.createElement('section');pane.className='tool-pane';pane.dataset.pane=key;pane.setAttribute('aria-label',names[key]+'选项');pane.hidden=true;body.append(pane);panes[key]=pane;}
 const move=(selector,pane)=>{const node=document.querySelector(selector);if(node)pane.append(node);return node;};
 panes.source.innerHTML='<p class="tool-intro">放入自己的照片，或先试试内置场景。照片在本机处理。</p><div id="sourceImport"></div><h3>内置场景</h3>';
 $('sourceImport').append($('unifiedUpload'));move('.scene-select',panes.source);panes.source.append($('photoToPixel'));const pixelDemos=document.createElement('div');pixelDemos.className='pixel-source-demos';pixelDemos.innerHTML='<h3>内置动图</h3><button data-pixel-demo="synth">落日飞车</button><button data-pixel-demo="slime">勇者与史莱姆</button>';panes.source.append(pixelDemos);pixelDemos.onclick=event=>{const demo=event.target.closest('[data-pixel-demo]')?.dataset.pixelDemo;if(demo)retroStudio.openExample('pixel',{demo});};const photoSend=$('photoToPixel');photoSend.onclick=async()=>{await retroStudio.toPixel();begin('pixel');};
 move('.preset-header',panes.style);move('#presets',panes.style);move('.variant-section',panes.style);
 const quick=oldChildren.find(x=>x.classList.contains('quick-section'));panes.style.prepend(quick);move('#macros',panes.adjust);move('.advanced-section',panes.adjust);
 const layers=oldChildren.find(x=>x.classList.contains('layers-section'));panes.layers.append(layers);$('layersDetails').open=true;
 for(const details of panes.adjust.querySelectorAll('details'))details.open=false;
 const recipe=oldChildren.find(x=>x.classList.contains('recipe'));panes.export.append(recipe);move('#save',panes.export);
 const exportRow=oldChildren.find(x=>x.classList.contains('export-row'));panes.export.append(exportRow);panes.export.append($('unifiedFormat'),$('unifiedExport'));
 const pixelExport=document.createElement('p');pixelExport.className='pixel-export-help';pixelExport.textContent='PNG 保存当前帧；GIF 保存动画。放大倍数、序列帧和色板数据在下方高级导出中。';panes.export.append(pixelExport);const returnPhoto=document.createElement('button');returnPhoto.id='pixelToPhoto';returnPhoto.textContent='当前帧继续调色 / 添加文字';returnPhoto.onclick=()=>$('retroReturn').click();panes.export.append(returnPhoto);
 panes.export.append(document.querySelector('.studio-credit'));
 const nativePixel=document.createElement('button');nativePixel.id='pixelAdvancedExport';nativePixel.textContent='动画尺寸与高级导出';panes.export.append(nativePixel);
 // The old controls remain callable, but their duplicate button groups are no longer visible.
 const oldActions=document.querySelector('.memory-actions');const canvasActions=document.createElement('div');canvasActions.className='canvas-actions';canvasActions.append($('undo'),$('redo'));document.querySelector('.viewport').append(canvasActions);oldActions.hidden=true;
 const discarded=document.createElement('div');discarded.hidden=true;for(const node of oldChildren)if(node.parentNode!==body&&!node.closest('.tool-pane'))discarded.append(node);document.body.append(discarded);
 guideButton.onclick=()=>start(mode);help.onclick=()=>start(mode);$('closeTool').onclick=()=>{stop(false);open(null);};
 for(const button of discarded.querySelectorAll('[data-mobile]'))button.onclick=()=>open(button.dataset.mobile==='layers'?'layers':button.dataset.mobile==='style'?'style':'adjust');
 const lesson=document.createElement('section');lesson.id='lessonCard';lesson.className='lesson-card';lesson.hidden=true;lesson.setAttribute('aria-label','交互教程');lesson.innerHTML='<div class="lesson-top"><span id="lessonProgress"></span><button id="lessonSkip">跳过教程</button></div><h3 id="lessonTitle" tabindex="-1"></h3><p id="lessonText"></p><label><input id="lessonRemember" type="checkbox">以后跳过此模式教程</label><div class="lesson-actions"><button id="lessonPrevious">上一步</button><button class="primary" id="lessonNext">下一步</button></div>';document.body.append(lesson);
 const photoSteps=[
  ['source','放入一张照片','点击「导入图片 / GIF」选择照片，或选择内置场景。画布支持拖入图片；无需上传到服务器。'],
  ['style','先挑一种感觉','选择梦核、旧核、怪核或胶片。缩略图是当前照片的实际效果；调整「效果混合」可以减弱滤镜。'],
  ['adjust','再调光、色彩与局部','先用四个主控调整方向。需要细调时再展开各组参数；局部遮罩可以只处理画面的一部分。数值框也能直接输入。'],
  ['layers','加上自己的印记','点击「添加文字」，然后在画布上拖动文字位置。日期、边框和图层与滤镜一起编辑；换预设不会删除文字。'],
  ['export','保存这一帧','选择导出尺寸，再点击「导出作品」保存 PNG。配方保存风格和图层，不包含原照片。工具栏再次点击即可收起，让画布铺满。']
 ];
 const pixelSteps=[
  ['source','从照片或动图开始','可以直接导入图片或 GIF。先用内置落日动图体验：下面的步骤会带你依次选择主机、调细节和导出。'],
  ['style','主机决定像素的性格','在主机下拉框试试 Game Boy 四色或 FC / NES。它们会改变分辨率和可用颜色；这一步先凭画面选喜欢的风格。'],
  ['adjust','抖动是在用少量颜色画过渡','选择 Bayer 4×4，再调低或调高抖动强度，观察天空和阴影的网格变化。亮度、对比度先少量调整；硬件约束收在高级设置里。'],
  ['layers','先调一帧，再生成整段动画','播放、暂停和拖动时间轴可选择参考帧。调参数后先预览这一帧，满意后点「渲染全部帧」，把参数应用到整段 GIF。'],
  ['export','当前帧还是整段动画？','PNG 保存眼前这一帧；GIF 保存动画。导出 GIF 会先应用未完成的参数。放大倍数只把像素放大，不会补回照片细节。']
 ];
 function list(){return (lessonMode==='pixel'?pixelSteps:photoSteps).filter(step=>!(lessonMode==='pixel'&&pixelInfo.frames===1&&step[0]==='layers'));}
 function message(type,extra={}){if(type==='tool')extra={...extra,layout:matchMedia('(max-width:760px)').matches?'mobile':'desktop',drawerHeight:Math.round(innerHeight*(innerHeight<=650?.48:.44)),panelSize:matchMedia('(max-width:760px)').matches?innerWidth:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-size'))};const frame=$('engine-pixel');frame?.contentWindow.postMessage({channel:'memory-signal-retro-v1',mode:'pixel',type,...extra},'*');}
 function lessonHeight(){const height=lesson.hidden?0:Math.ceil(lesson.getBoundingClientRect().height);document.documentElement.style.setProperty('--lesson-height',height+'px');if(mode==='pixel')message('tool',{tool:document.body.classList.contains('pixel-local-tool')?tool:null,lessonHeight:height});}
 new ResizeObserver(lessonHeight).observe(lesson);
 function open(key){tool=key;document.body.dataset.tool=key||'';document.body.classList.toggle('tool-open',!!key);sidebar.hidden=!key||(mode==='pixel'&&!['source','export'].includes(key));$('toolTitle').textContent=key==='layers'&&mode==='pixel'?'动画':names[key]||'';
  for(const [name,pane]of Object.entries(panes))pane.hidden=name!==key;for(const button of rail.querySelectorAll('[data-tool]')){const selected=button.dataset.tool===key;button.setAttribute('aria-expanded',String(selected));button.classList.toggle('active',selected);if(button.dataset.tool==='layers')button.classList.toggle('has-pending',mode==='pixel'&&!!pixelInfo.pending);button.querySelector('span').textContent=button.dataset.tool==='layers'&&mode==='pixel'?'动画':names[button.dataset.tool];button.setAttribute('aria-label',(button.dataset.tool==='layers'&&mode==='pixel'?'动画':names[button.dataset.tool])+'工具');}
  document.body.classList.toggle('pixel-local-tool',mode==='pixel'&&['style','adjust','layers'].includes(key));
  $('unifiedFormat').hidden=mode!=='pixel';pixelExport.hidden=mode!=='pixel';nativePixel.hidden=mode!=='pixel';returnPhoto.hidden=mode!=='pixel';recipe.hidden=mode==='pixel';$('save').hidden=mode==='pixel';exportRow.hidden=mode==='pixel';
  if(mode==='pixel')message('tool',{tool:['source','export'].includes(key)?null:key,lessonHeight:lesson.hidden?0:lesson.getBoundingClientRect().height});
 }
 function showStep(){const steps=list();lessonIndex=Math.min(lessonIndex,steps.length-1);const [key,title,text]=steps[lessonIndex];open(key);lesson.hidden=false;document.body.classList.add('lesson-active');$('lessonProgress').textContent=(lessonMode==='pixel'?'8-BIT':'影像')+' 教程 · '+(lessonIndex+1)+' / '+steps.length;$('lessonTitle').textContent=title;$('lessonText').textContent=text;$('lessonPrevious').disabled=lessonIndex===0;$('lessonNext').textContent=lessonIndex===steps.length-1?'完成，开始创作':'下一步';rail.querySelectorAll('.tour-highlight').forEach(x=>x.classList.remove('tour-highlight'));rail.querySelector('[data-tool="'+key+'"]').classList.add('tour-highlight');lessonHeight();$('lessonTitle').focus({preventScroll:true});}
 function stop(complete=false){if(lessonMode&&(complete||$('lessonRemember').checked)){try{localStorage.setItem('memory-signal-tour-'+(lessonMode||mode)+'-v3','1');}catch{}}lessonMode=null;pendingLesson=false;lesson.hidden=true;document.body.classList.remove('lesson-active');rail.querySelectorAll('.tour-highlight').forEach(x=>x.classList.remove('tour-highlight'));lessonHeight();}
 function start(which=mode){if(welcome.open)finishWelcome();if(which!==mode)retroStudio.selectMode(which);endTour();lessonMode=which;lessonIndex=0;$('lessonRemember').checked=false;if(which==='pixel'&&!retroStudio.ready.includes('pixel')){pendingLesson=true;open('source');return;}showStep();}
 function begin(which=mode){let completed=false;try{completed=localStorage.getItem('memory-signal-tour-'+which+'-v3')==='1';}catch{}if(!completed)start(which);else open(null);}
 rail.onclick=event=>{const key=event.target.closest('[data-tool]')?.dataset.tool;if(!key)return;if(lessonMode)stop(false);open(tool===key?null:key);};$('lessonSkip').onclick=()=>{stop(false);open(null);};$('lessonPrevious').onclick=()=>{if(lessonIndex>0){lessonIndex--;showStep();}};$('lessonNext').onclick=()=>{if(lessonIndex===list().length-1){stop(true);open(null);}else{lessonIndex++;showStep();}};
 nativePixel.onclick=()=>{open('export');sidebar.hidden=true;document.body.classList.add('pixel-local-tool','tool-open');document.body.dataset.tool='export';message('tool',{tool:'export',lessonHeight:0});};
 window.addEventListener('memory-signal-mode',event=>{if(lessonMode)stop(false);mode=event.detail.mode;open(null);});
 window.addEventListener('memory-signal-close-tool',()=>{stop(false);open(null);});window.addEventListener('resize',lessonHeight);
 window.addEventListener('memory-signal-pixel-info',event=>{pixelInfo=event.detail;rail.querySelector('[data-tool=layers]').classList.toggle('has-pending',mode==='pixel'&&!!pixelInfo.pending);if(pendingLesson){pendingLesson=false;showStep();}if(mode==='pixel')lessonHeight();});
 window.addEventListener('memory-signal-pixel-ready',()=>{if(pendingLesson){pendingLesson=false;showStep();}else if(mode==='pixel')open(tool);});
 modeNav.addEventListener('click',event=>{if(event.target.closest('[data-engine]'))begin(mode);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!welcome.open){if(lessonMode)stop(false);open(null);help.focus();}});
 // Keep the original six-step guide available for old integrations, while all visible help uses this lesson.
 window.studioTools={open,start,begin,stop,info:()=>pixelInfo,get tool(){return tool;},get lesson(){return lessonMode?{mode:lessonMode,index:lessonIndex,steps:list().length}:null;}};
 open(null);
})();
