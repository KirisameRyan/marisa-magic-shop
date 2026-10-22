import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts','zyms-retro-review');fs.mkdirSync(out,{recursive:true});
const downloadDir=path.join(out,'downloads',String(Date.now()));fs.mkdirSync(downloadDir,{recursive:true});
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9353',`--user-data-dir=${path.join(out,'chrome-profile')}`,'--no-first-run','--no-default-browser-check','--hide-scrollbars','--window-size=1440,1100','--remote-allow-origins=*','about:blank'],{stdio:'ignore',windowsHide:true});
let ws,next=1;const pending=new Map(),contexts=new Map(),errors=[],requests=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={},sessionId){const id=next++;const result=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));ws.send(JSON.stringify({id,method,params,sessionId}));return result;}
async function run(expression,context){const r=await send('Runtime.evaluate',{expression,contextId:context?.id,awaitPromise:true,returnByValue:true},context?.sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function until(expression,contextId){for(let i=0;i<100;i++){if(await run(expression,contextId))return;await sleep(100);}throw Error('Timed out: '+expression);}
async function context(mode){for(let i=0;i<60;i++){for(const ctx of contexts.values()){if(!ctx.sessionId||!ctx.auxData?.isDefault)continue;try{if(await run('window.name',ctx)==='engine-'+mode)return ctx;}catch{}}await sleep(100);}throw Error('Missing engine context '+mode);}
async function shot(name){const result=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(result.data,'base64'));}
try{
 let pages;for(let i=0;i<80;i++){try{pages=await(await fetch('http://127.0.0.1:9353/json/list')).json();break;}catch{await sleep(150);}}
 assert(pages,'Chrome unavailable');ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}else if(m.method==='Target.attachedToTarget'){send('Runtime.enable',{},m.params.sessionId).catch(e=>errors.push(e.message));}else if(m.method==='Runtime.executionContextCreated')contexts.set((m.sessionId||'main')+':'+m.params.context.id,{...m.params.context,sessionId:m.sessionId});};
 await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});await send('Runtime.enable');await send('Page.enable');
 await send('Page.navigate',{url:pathToFileURL(path.join(root,'zyms','memory-signal.html')).href});await until('!!window.retroStudio');await run("if(welcome.open)finishWelcome();retroStudio.selectMode('film')");
 const examplesDir=path.join(root,'zyms','examples');fs.mkdirSync(examplesDir,{recursive:true});
 for(const item of [{key:'dream',scene:'corridor',preset:'dream_soft_haze'},{key:'film',scene:'nightcars',preset:'film_cinestill_800t'}]){
  await run(`retroStudio.openExample('film',{scene:'${item.scene}',preset:'${item.preset}'})`);await sleep(400);
  for(const kind of ['before','after']){const url=await run(`(()=>{const src=${kind==='before'?'originalCanvas':"mainCanvas"};const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').drawImage(src,0,0,640,480);return c.toDataURL('image/webp',.9);})()`);fs.writeFileSync(path.join(examplesDir,item.key+'-'+kind+'.webp'),Buffer.from(url.split(',')[1],'base64'));}
 }
 await run("retroStudio.openExample('pixel',{demo:'synth'})");await until("retroStudio.ready.includes('pixel')");const pixel=await context('pixel');await run('state.isPlaying=false;state.currentFrameIdx=0;renderCurrentFrameToViewport()',pixel);
 for(const kind of ['before','after']){const url=await run(`(()=>{const c=document.createElement('canvas');${kind==='before'?"const d=state.sourceFrames[0].imageData;c.width=d.width;c.height=d.height;c.getContext('2d').putImageData(d,0,0);":"c.width=canvasOutput.width;c.height=canvasOutput.height;c.getContext('2d').drawImage(canvasOutput,0,0);"}return c.toDataURL('image/webp',.95);})()`,pixel);fs.writeFileSync(path.join(examplesDir,'pixel-'+kind+'.webp'),Buffer.from(url.split(',')[1],'base64'));}
 console.log('Generated six actual-engine WebP examples.');
}finally{try{await send('Browser.close');}catch{}ws?.close();if(!chrome.killed)spawnSync('taskkill',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}
