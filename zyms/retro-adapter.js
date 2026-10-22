// Bridge only accepts messages from the enclosing workbench. Sandboxing isolates engines.
(()=>{
 const mode='__MODE__',channel='memory-signal-retro-v1';
 let suspended=false,resumePlayback=false,receiving=false;
 const notify=(type,extra={})=>parent.postMessage({channel,mode,type,...extra},'*');
 window.addEventListener('message',async event=>{
  if(event.source!==parent||event.data?.channel!==channel||event.data.mode!==mode)return;
  const message=event.data;
  try{
   if(message.type==='import'&&message.blob instanceof Blob){
    if(message.blob.size>40*1024*1024)throw Error('文件超过40MB');
    const input=document.getElementById(mode==='pixel'?'fileInput':'fileUploadInput');
    const dt=new DataTransfer();dt.items.add(new File([message.blob],message.name||'memory-signal.png',{type:message.blob.type||'image/png'}));
    input.files=dt.files;receiving=true;input.dispatchEvent(new Event('change',{bubbles:true}));receiving=false;
    notify('imported');
   }else if(message.type==='export'){
    document.getElementById(mode==='film'?'btnExport':message.format==='gif'?'btnExportGif':'btnExportPng').click();
   }else if(message.type==='advanced'){
    document.getElementById(mode==='film'?'btnToggleAdvanced':'btnUiModePro').click();
   }else if(message.type==='example'){
    let source;
    if(mode==='film'){window.mmsFilm.example(message.scene,message.preset);source=window.mmsFilm.source();}
    else{await loadBuiltInDemo(message.demo==='slime'?'slime':'synth');const data=state.sourceFrames[0]?.imageData;if(data){source=document.createElement('canvas');source.width=data.width;source.height=data.height;source.getContext('2d').putImageData(data,0,0);}}
    source?.toBlob(blob=>{if(blob)notify('source',{blob,name:message.title||'内置示例'});},'image/png');
   }else if(message.type==='source'){
    const image=mode==='film'?window.mmsFilm.source():null;
    if(image)image.toBlob(blob=>{if(blob)notify('source',{blob,name:'示例底图.png'});},'image/png');
   }else if(message.type==='capture'){
    let image=document.getElementById(mode==='pixel'?'canvasOutput':'mainCanvas');
    if(mode==='pixel'){
     if(state.hasUnrenderedManualChanges)renderSinglePreviewFrameOnly();
     const frame=state.processedFrames[state.currentFrameIdx]||state.processedFrames[0];
     if(!frame)throw Error('请等待当前帧渲染完成');
     image=renderFrameForExport(frame,1,document.getElementById('selectExportCrt').value==='crt');
    }
    if(!image?.width)throw Error('当前没有可传递的影像');
    const blob=await new Promise(resolve=>image.toBlob(resolve,'image/png'));
    if(!blob)throw Error('无法读取当前影像');
    notify('capture',{blob});
   }else if(message.type==='active'&&mode==='pixel'){
    if(!message.active&&!suspended){resumePlayback=state.isPlaying;state.isPlaying=false;suspended=true;}
    else if(message.active&&suspended){state.isPlaying=resumePlayback&&state.sourceFrames.length>1;suspended=false;}
    restartPlaybackLoop();syncTimelineControls();
   }
  }catch(error){notify('error',{message:error.message});}
 });
 document.addEventListener('change',event=>{if(!receiving&&event.target.matches('input[type=file]')&&event.target.files[0])notify('source',{blob:event.target.files[0],name:event.target.files[0].name});},true);
 document.addEventListener('drop',event=>{const file=event.dataTransfer?.files[0];if(file)notify('source',{blob:file,name:file.name});},true);
 document.addEventListener('click',event=>{if(mode==='film'&&event.target.closest('[data-scene]'))requestAnimationFrame(()=>window.mmsFilm.source().toBlob(blob=>{if(blob)notify('source',{blob,name:'内置场景'});},'image/png'));});
 let heightFrame=0,lastHeight=0;
 const resize=()=>{cancelAnimationFrame(heightFrame);heightFrame=requestAnimationFrame(()=>{const main=document.querySelector('main');const height=Math.ceil((main?.getBoundingClientRect().bottom||document.body.scrollHeight)+20);if(height>100&&Math.abs(height-lastHeight)>2){lastHeight=height;notify('height',{height});}});};
 new ResizeObserver(resize).observe(document.body);window.addEventListener('resize',resize);
 const ready=()=>{notify('ready');resize();};
 if(mode==='pixel')window.addEventListener('mms-engine-ready',ready,{once:true});
 else window.addEventListener('load',ready,{once:true});
})();
