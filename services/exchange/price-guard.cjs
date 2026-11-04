'use strict';
// Prices used for safeguards are distinct from the last printed trade.
const median=values=>{const v=values.slice().sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:0;};
function begin(a,time){
 let p=a.priceProtection;
 if(!p||p.version!==1){const bars=a.history.filter(b=>b.t<=time).slice(-5),seed=median(bars.map(b=>b.c).filter(x=>Number.isFinite(x)&&x>0))||a.mark||a.price;p=a.priceProtection={version:1,time,reference:seed,mark:seed,points:{},weights:{},pairs:{},marks:[{t:time-300000,price:seed}]};a.mark=seed;}
 if(p.time!==time){p.marks.push({t:p.time,price:p.mark});const cutoff=time-300000,prior=p.marks.findLast(x=>x.t<=cutoff);p.marks=p.marks.filter(x=>x.t>cutoff);if(prior)p.marks.unshift(prior);p.time=time;p.reference=(Number.isFinite(a.fair)&&a.fair>0)?p.mark+(a.fair-p.mark)*.35:p.mark;p.points={};p.weights={};p.pairs={};}
 return p;
}
function bands(a){const p=a.priceProtection,reference=p?.reference||a.mark||a.price,width=(a.kind==='crypto'?.10:.05)*(a.bandFactor||1);return {reference,lower:Math.ceil(reference*(1-width)*10-1e-8)/10,upper:Math.floor(reference*(1+width)*10+1e-8)/10};}
function allowed(a,price){const b=bands(a);return Number.isFinite(price)&&price>=b.lower-1e-8&&price<=b.upper+1e-8;}
function baseline(a,time){const p=a.priceProtection;return p.marks.findLast(x=>x.t<=time-300000)?.price||p.marks[0]?.price||p.reference;}
function observe(a,trade){const p=a.priceProtection,ids=[...new Set([trade.buyUserId,trade.sellUserId].filter(x=>x!==null&&x!==undefined))],cap=a.kind==='crypto'?1000:500,anchor=cap*2,keys=ids.length?ids.map(id=>'u:'+id):['system'],limit=ids.length===2?cap:anchor*4;
 if(Object.keys(p.weights).length+keys.filter(k=>!(k in p.weights)).length>512)return p.mark;
 const weight=Math.max(0,Math.min(trade.qty,...keys.map(k=>limit-(p.weights[k]||0))));
 if(weight&&((trade.price in p.points)||Object.keys(p.points).length<256)){for(const k of keys)p.weights[k]=(p.weights[k]||0)+weight;p.points[trade.price]=(p.points[trade.price]||0)+weight;}
 const points=[{price:p.reference,weight:anchor},...Object.entries(p.points).map(([price,weight])=>({price:Number(price),weight}))],sum=points.reduce((n,x)=>n+x.weight,0);points.sort((a,b)=>a.price-b.price);let cumulative=0;
 for(const point of points){cumulative+=point.weight;if(cumulative>sum/2){p.mark=point.price;break;}if(cumulative===sum/2){p.mark=p.reference;break;}}
 a.mark=p.mark;return p.mark;
}
function repeatPair(a,trade){if(trade.buyUserId==null||trade.sellUserId==null)return null;const p=a.priceProtection,key=[trade.buyUserId,trade.sellUserId].sort((a,b)=>a-b).join(':');if(!(key in p.pairs)&&Object.keys(p.pairs).length>=128)return null;const pair=p.pairs[key] ||= {count:0,qty:0,reported:false};pair.count++;pair.qty+=trade.qty;if(pair.count>=3&&!pair.reported){pair.reported=true;return {pair:key,count:pair.count,qty:pair.qty};}return null;}
function resume(a,time){const p=begin(a,time);p.reference=p.mark;p.marks=[{t:time-300000,price:p.mark}];p.points={};p.weights={};}
module.exports={begin,bands,allowed,baseline,observe,repeatPair,resume};


