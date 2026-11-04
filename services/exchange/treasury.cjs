'use strict';
const round=n=>Math.round(n*100)/100;
// One operator owns both system actors: internal transfers conserve their combined cash and inventory.
function rebalance(s,time,inventoryLimit){if(!s.system||!s.flow)return;const maker=s.system,flow=s.flow;if(!Number.isFinite(maker.cash)||!Number.isFinite(flow.cash))throw Error('系统资金格式异常');maker.inventory ||= {};flow.inventory ||= {};s._journal ||= [];
 function record(kind,details){s._journal.push({event:'treasury-'+s.seq++,userId:0,time,kind,cashDelta:0,...details});}
 for(const a of s.assets){if(a.pausedUntil>time)continue;const x=maker.inventory[a.id]||0,y=flow.inventory[a.id]||0,limit=inventoryLimit(s,a.id),flowLimit=a.kind==='crypto'?80000:20000;if(x*y>=0||Math.abs(x)<limit*.8&&Math.abs(y)<flowLimit*.8)continue;const price=a.mark;if(!Number.isFinite(price)||price<=0)continue;const buyer=x>0?flow:maker,seller=x>0?maker:flow,q=Math.floor(Math.min(Math.abs(x),Math.abs(y),Math.max(0,buyer.cash)/price)/100)*100;if(!q)continue;const amount=round(price*q),before={maker:maker.cash,flow:flow.cash,makerInventory:x,flowInventory:y};buyer.cash=round(buyer.cash-amount);seller.cash=round(seller.cash+amount);if(x>0){maker.inventory[a.id]-=q;flow.inventory[a.id]+=q;}else{maker.inventory[a.id]+=q;flow.inventory[a.id]-=q;}record('system-inventory-netting',{asset:a.id,qty:q,price,amount,before,after:{maker:maker.cash,flow:flow.cash,makerInventory:maker.inventory[a.id],flowInventory:flow.inventory[a.id]}});}
 const total=round(maker.cash+flow.cash);if(total<=0)return;const target=round(total*.8);let amount=0,from,to;
 if(maker.cash<total*.6){amount=round(target-maker.cash);from='flow';to='system';}else if(flow.cash<total*.05){amount=round(maker.cash-target);from='system';to='flow';}
 if(amount>0&&s[from].cash>=amount){const before={maker:maker.cash,flow:flow.cash};s[from].cash=round(s[from].cash-amount);s[to].cash=round(s[to].cash+amount);record('system-cash-rebalance',{from,to,amount,before,after:{maker:maker.cash,flow:flow.cash},total});}
}
module.exports={rebalance};
