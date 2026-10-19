import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'artifacts','zyms-review');fs.mkdirSync(out,{recursive:true});
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=9348',`--user-data-dir=${path.join(out,'chrome-profile')}`,'--no-first-run','--no-default-browser-check','--hide-scrollbars','--window-size=1440,1100','--remote-allow-origins=*','about:blank'],{stdio:'ignore',windowsHide:true});
let ws;const pending=new Map();let next=1;const errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={}){const id=next++;const p=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));ws.send(JSON.stringify({id,method,params}));return p;}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
try{
 let pages;for(let i=0;i<80;i++){try{pages=await (await fetch('http://127.0.0.1:9348/json/list')).json();break;}catch{await sleep(150);}}if(!pages)throw Error('Chrome unavailable');
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 await send('Runtime.enable');await send('Page.enable');await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(out,'downloads')});
 const url=pathToFileURL(path.join(root,'zyms','DREAMCORE __ 旧核·梦核·怪核图片滤镜实验室.html')).href;
 await send('Page.navigate',{url});for(let i=0;i<80;i++){if(await run('typeof app!=="undefined" && !!app && !!document.querySelector(".preset-card img")?.src'))break;await sleep(150);}
 const initial=await run(`({title:document.title,presets:document.querySelectorAll('.preset-card').length,ready:!!app,width:document.documentElement.scrollWidth,viewport:innerWidth})`);assert.equal(initial.presets,4);assert.equal(initial.ready,true);assert(initial.width<=initial.viewport);
 await sleep(600);await run('showWelcome()');await shot('welcome-desktop');await run("document.getElementById('welcomeDemo').click()");await sleep(250);await shot('desktop');
 const tests=await run(`(async()=>{
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
 const pixels=(r)=>{const c=canvas(120,90);renderImage(sourceCanvas,c,r);return c.toDataURL()};
 const outputs=Object.keys(looks).map(key=>pixels(makePreset(key)));assert(new Set(outputs).size===12,'presets visually identical');
 const sceneOutputs=[];for(const s of ['corridor','meadow','poolrooms','nightpark']){setScene(s);sceneOutputs.push(sourceCanvas.toDataURL());}assert(new Set(sceneOutputs).size===4,'scene missing');setScene('corridor');
 app=randomRecipe(849201);const seedA=pixels(app);app.params.timestampText='previous';app.layers.push({text:'previous',style:'whitebox',x:.1,y:.2,size:100,rotation:0,flipX:false,flipY:false,opacity:100,visible:true});app=randomRecipe(849201);assert(pixels(app)===seedA,'seed depends on previous state');
 app=makePreset('liminal');app.layers[0].x=.123456;app.layers[0].y=.765432;app.layers[0].text='中文||配方 <test>';app.layers[0].rotation=38;app.layers[0].flipY=true;app.layers[0].opacity=47;app.params.maskMode='radial';app.params.maskX=36.2;app.strength=73;app.seed=4294967295;const recipe=encodeRecipe(),before=pixels(app);app=makePreset('vhs');assert(applyRecipe(recipe),'recipe failed');assert(app.layers[0].x===.123456,'position quantized');assert(app.layers[0].text==='中文||配方 <test>','text corrupted');assert(pixels(app)===before,'recipe pixels differ');
 const originalName=app.name;assert(!applyRecipe('DC2-invalid'),'invalid recipe accepted');assert(app.name===originalName,'invalid recipe mutates state');
 const c=canvas(120,90);const clean=makePreset('vhs');clean.layers=[];clean.params.showTimestamp=false;clean.params.showVhsOsd=false;clean.params.frameStyle='none';clean.strength=0;renderImage(sourceCanvas,c,clean);const raw=canvas(120,90);raw.getContext('2d').drawImage(sourceCanvas,0,0,120,90);assert(c.toDataURL()===raw.toDataURL(),'zero mix differs from original');
 app=makePreset('y2k');checkpoint();const old=app.params.bloom;app.params.bloom=9;checkpoint();restoreHistory(-1);assert(app.params.bloom===old,'undo failed');restoreHistory(1);assert(app.params.bloom===9,'redo failed');
 document.getElementById('addLayer').click();assert(app.layers.length===1,'add layer failed');document.getElementById('flipX').click();assert(app.layers[0].flipX,'flip failed');document.getElementById('variants').click();assert(variantOptions.length===4,'variants missing');
 const high=canvas(2200,1400),hc=high.getContext('2d');hc.fillStyle='#98bcca';hc.fillRect(0,0,2200,1400);setSource(high,'resolution-test');assert(originalCanvas.width===2200&&sourceCanvas.width===1100,'original lost');await document.getElementById('export').onclick();
 applyPreset('y2k');setScene('corridor');syncUI();return {uniquePresets:new Set(outputs).size,uniqueScenes:new Set(sceneOutputs).size,seedDeterministic:true,recipeExact:true,zeroMixExact:true,history:true,layers:true,variants:true,highResolution:true};})()`);
 await sleep(300);await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);assert(await run('document.documentElement.scrollWidth<=innerWidth'),'mobile overflow');await run('showWelcome()');await shot('welcome-mobile');await run("document.getElementById('welcomeDemo').click()");await sleep(150);await shot('mobile');
 const guide=await run(`(()=>{startTour();for(let i=0;i<steps.length;i++){if(tourPanel.hidden||!document.querySelector('.tour-highlight'))throw Error('guide missing');if(i===4&&!document.getElementById('layersDetails').open)throw Error('layer guide closed');document.getElementById('tourNext').click();}if(!tourPanel.hidden)throw Error('guide did not finish');return true;})()`);assert(guide);
 await run(`document.querySelector('[data-mobile="layers"]').click();document.getElementById('addLayer').click();`);await send('Runtime.evaluate',{expression:'document.querySelector(".sidebar").scrollIntoView()'});await shot('mobile-layers');
 const touch=await run(`(()=>{const l=app.layers[selectedLayer];l.x=.5;l.y=.5;const r=mainCanvas.getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+r.height*.5,before:l.x,visible:r.top>=-1&&r.bottom<innerHeight};})()`);assert(touch.visible,'preview is not visible during mobile adjustment');
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+35,y:touch.y+10}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(await run('app.layers[selectedLayer].x>.55'),'touch drag failed');
 for(const width of [320,768,1024]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<761});assert(await run('document.documentElement.scrollWidth<=innerWidth'),'overflow at '+width);}
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(errors.length,0,errors.join('\n'));
 await run(`window.scrollTo(0,0);startTour();tourIndex=2;displayStep();`);await shot('mobile-guide');await run('endTour()');
 await sleep(200);const downloads=fs.readdirSync(path.join(out,'downloads')).filter(f=>f.endsWith('.png'));assert(downloads.length>0,'PNG was not downloaded');const png=fs.readFileSync(path.join(out,'downloads',downloads.at(-1)));assert.equal(png.readUInt32BE(16),2200);assert.equal(png.readUInt32BE(20),1400);
 const report={initial,tests,guide,touchDrag:true,responsiveWidths:[320,390,768,1024,1424],downloadedPng:[2200,1400],errors};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{try{await send('Browser.close');}catch{}ws?.close();if(!chrome.killed)spawnSync('taskkill',['/PID',String(chrome.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}
