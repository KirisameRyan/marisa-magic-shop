import {createRequire} from 'node:module';
globalThis.Matter=createRequire(import.meta.url)('../js/vendor/matter.min.js');
const {CONFIG}=await import('../js/pachinko/config.js');const {Simulation}=await import('../js/pachinko/simulation.js');
for(const [slotExpansion,winningExpansion] of [[0,0],[4,0],[6,0],[8,0],[0,4],[0,8],[0,12],[0,16],[8,8]]){
const sim=new Simulation({config:CONFIG,boardModifiers:{slotExpansion,winningExpansion}});let net=0,jackpot=0,win=0;
for(let i=1;i<=100;i++){sim.startBatch(10,{seed:i*101,applyEconomy:false});while(sim.isBusy())sim.step();const r=sim.lastReport;if(!r.validationOk)throw Error('validation');net+=r.net;jackpot+=CONFIG.board.jackpotSlotIds.reduce((n,id)=>n+r.slotCounts[id],0);win+=r.slotCounts.reduce((n,count,id)=>n+(r.slotValues[id]>0?count:0),0);}
console.log(JSON.stringify({slotExpansion,winningExpansion,netPerBall:net/1000,jackpot:jackpot/1000,win:win/1000}));}
