// Dock native 8-bit controls into the shared tool categories. The canvas keeps center stage.
(()=>{
 const q=id=>document.getElementById(id),notify=(type,extra={})=>parent.postMessage({channel:'memory-signal-retro-v1',mode:'pixel',type,...extra},'*');
 const aside=document.createElement('aside');aside.id='pixelTools';aside.innerHTML='<div class="pixel-tool-heading"><h2 id="pixelToolTitle">风格</h2><button id="pixelCloseTool" aria-label="收起参数">×</button></div><div id="pixelToolBody"></div>';document.body.append(aside);
 const pages={};for(const key of ['style','adjust','layers','export']){const page=document.createElement('div');page.dataset.msPane=key;page.className='pixel-tool-page';q('pixelToolBody').append(page);pages[key]=page;}
 const move=(id,page)=>{const node=q(id);if(node)page.append(node);return node;};
 move('secHardwareCard',pages.style);
 const details=document.createElement('details');details.className='pixel-advanced';details.innerHTML='<summary>高级：属性块与主机规格</summary>';pages.style.append(details);move('proClashContainer',details);
 const hardware=q('secHardwareCard');for(const child of [...hardware.children])if(child!==hardware.firstElementChild&&child!==q('selectSystem')&&!child.contains(q('selectSystem')))details.append(child);
 const spec=q('specPalVal')?.closest('.bg-retro-bg');if(spec)details.append(spec);
 move('secDitherCard',pages.adjust);move('secAdjustCard',pages.adjust);
 const palette=document.createElement('details');palette.className='pixel-advanced';palette.innerHTML='<summary>高级：检查色板与颜色距离</summary>';pages.adjust.append(palette);move('secPalInspectorCard',palette);
 const metric=q('selectColorMetric')?.parentElement;if(metric&&metric!==q('secDitherCard'))palette.prepend(metric);
 const stage=q('canvasStage'),card=stage.parentElement,viewToolbar=card.firstElementChild;
 const viewDetails=document.createElement('details');viewDetails.className='pixel-advanced';viewDetails.innerHTML='<summary>高级：对比与缩放</summary>';pages.adjust.append(viewDetails);if(viewToolbar!==stage)viewDetails.append(viewToolbar);
 move('pendingFramesBanner',pages.layers);move('gifTimelineBar',pages.layers);move('secRenderControlCard',pages.layers);
 const explanation=document.createElement('p');explanation.id='pixelAnimationHint';explanation.textContent='先选参考帧调参，满意后渲染全部帧。静态图片没有动画时间轴。';pages.layers.prepend(explanation);
 move('secExportCard',pages.export);
 q('pixelCloseTool').onclick=()=>notify('close-tool');
 const originalDisplay=getDisplayDimensions;
 getDisplayDimensions=frame=>{let dimensions;if(state.zoomMode!=='fit')dimensions=originalDisplay(frame);else{const stage=q('canvasStage'),baseW=frame.width*frame.par,baseH=frame.height,availableW=Math.max(50,stage.clientWidth-48)/(state.viewMode==='side'?2:1),availableH=Math.max(40,stage.clientHeight-48);let scale=Math.min(availableW/baseW,availableH/baseH,4);if(scale>=1.5)scale=Math.floor(scale);scale=Math.max(.1,scale);dimensions={dispW:Math.round(baseW*scale),dispH:Math.round(baseH*scale),scale};}q('canvasOutput').style.setProperty('--display-width',dimensions.dispW+'px');q('canvasOutput').style.setProperty('--display-height',dimensions.dispH+'px');return dimensions;};
 const publish=()=>notify('info',{frames:state.sourceFrames.length,pending:!!state.hasUnrenderedManualChanges||!state.allFramesSynced});
 const originalUpload=handleFileUpload;handleFileUpload=async file=>{await originalUpload(file);publish();};
 const originalDemo=loadBuiltInDemo;loadBuiltInDemo=async key=>{await originalDemo(key);publish();};
 const originalParameterChanged=onParameterChanged;onParameterChanged=(...args)=>{originalParameterChanged(...args);publish();};
 const originalPreview=renderSinglePreviewFrameOnly;renderSinglePreviewFrameOnly=(...args)=>{const result=originalPreview(...args);publish();return result;};
 const originalPipeline=runFullAsyncConversionPipeline;runFullAsyncConversionPipeline=async(...args)=>{const result=await originalPipeline(...args);publish();return result;};
 window.addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!=='memory-signal-retro-v1')return;const message=event.data;if(message.type==='tool'){document.body.dataset.tool=message.tool||'';document.body.dataset.layout=message.layout||'desktop';if(message.drawerHeight)document.documentElement.style.setProperty('--drawer-height',Math.min(600,message.drawerHeight)+'px');if(message.panelSize)document.documentElement.style.setProperty('--panel-size',Math.min(900,message.panelSize)+'px');document.documentElement.style.setProperty('--lesson-height',Math.max(0,Math.min(360,message.lessonHeight||0))+'px');q('pixelToolTitle').textContent=({style:'主机风格',adjust:'像素调节',layers:'动画与参考帧',export:'高级导出'})[message.tool]||'';requestAnimationFrame(()=>renderCurrentFrameToViewport());}});
 window.addEventListener('mms-engine-ready',()=>{state.deviceMode='desktop';state.uiComplexity='pro';applyDeviceAndComplexityLayout();publish();});
})();
