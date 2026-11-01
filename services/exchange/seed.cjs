'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Administrator-supplied startup file only. No API accepts seeds from players.
function applySeed(s,now=Date.now(),file=path.join(__dirname,'initial-market.json')){
 if(!fs.existsSync(file))return false;
 const bytes=fs.readFileSync(file);if(bytes.length>8000000)throw Error('初始行情文件过大');const seed=JSON.parse(bytes);
 if(seed.version!==1||!Number.isSafeInteger(seed.end)||seed.end%60000||!Array.isArray(seed.assets)||seed.assets.length!==s.assets.length)throw Error('初始行情格式不正确');
 const shift=Math.floor(now/60000)*60000-seed.end,seen=new Set();
 for(const saved of seed.assets){const a=s.assets.find(a=>a.id===saved.id);if(!a||seen.has(saved.id)||!Array.isArray(saved.history)||saved.history.length<30||saved.history.length>3000)throw Error('初始行情标的不正确');seen.add(saved.id);let last=-Infinity;
  const bars=saved.history.map(b=>{if(!Number.isSafeInteger(b.t)||b.t%60000||b.t<=last||b.t>seed.end||![b.o,b.h,b.l,b.c,b.v].every(Number.isFinite)||Math.min(b.o,b.h,b.l,b.c)<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.v<0||(b.resolution||60000)!==60000)throw Error('初始K线数据不正确');last=b.t;return {t:b.t+shift,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v,resolution:60000,demo:true,...(Number.isFinite(b.iopv)&&b.iopv>0?{iopv:b.iopv}:{})};});
  if(last!==seed.end)throw Error('初始K线结束时间不一致');a.history=bars.filter(b=>b.t>=Math.floor(now/60000)*60000-36*3600000);a.price=bars.at(-1).c;a.mark=Number.isFinite(saved.mark)&&saved.mark>0?saved.mark:a.price;a.fair=Number.isFinite(saved.fair)&&saved.fair>0?saved.fair:a.price;a.prev=bars.findLast(b=>b.t<=bars.at(-1).t-86400000)?.c||bars[0].c;a.volume=bars.reduce((v,b)=>v+b.v,0);
 }
 s.lastTick=Math.floor(now/60000)*60000;s.initialSeed={sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceEnd:seed.end,appliedAt:s.lastTick};return true;
}
module.exports={applySeed};
