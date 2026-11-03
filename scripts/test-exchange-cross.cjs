const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const E=require('../js/gensokyo-engine.js'),M=require('../services/exchange/market.cjs'),{Store}=require('../services/exchange/store.cjs');
function position(asset='kappa',mode='isolated'){return {asset,entry:100,qty:100,margin:500,sign:1,leverage:20,marginMode:mode};}
function close(s,price=90){const o={id:s.seq++,asset:'kappa',product:'contract',intent:'close',sign:-1,qty:100,remaining:100,leverage:20};s.orders.push(o);E.applyFill(s,o,price,100);}
test('isolated losses stay in their margin; cross uses shared cash but protects isolated collateral and ordinary holdings',()=>{
 const isolated=E.create();isolated.cash=10000;isolated.positions.kappa=position();close(isolated);assert.equal(isolated.cash,9500);assert.equal(isolated.insurance.paid,504.5);
 const cross=E.create();cross.cash=10000;cross.positions.kappa=position('kappa','cross');cross.positions.moriya={...position('moriya'),margin:5000};cross.spotPositions={eientei:{asset:'eientei',qty:100,entry:100,product:'spot'}};close(cross,1);assert.equal(cross.cash,5000);assert.equal(cross.positions.moriya.margin,5000);assert.equal(cross.spotPositions.eientei.qty,100);assert.equal(cross.insurance.paid,4900.05);
 const normal=E.create();normal.cash=10000;normal.positions.kappa=position('kappa','cross');close(normal);assert.equal(normal.cash,8995.5);assert.equal(normal.insurance.paid,0);
});
test('cross risk includes every cross position and releases cancelled opening reservations before insurance pays',()=>{
 const s=E.create();s.cash=10000;s.positions.kappa=position('kappa','cross');s.positions.moriya=position('moriya','cross');s.assets.find(a=>a.id==='kappa').mark=90;s.assets.find(a=>a.id==='moriya').mark=110;
 assert.equal(E.risk(s,s.positions.kappa).equity,10000);assert.equal(E.risk(s,s.positions.kappa).maintenance,200);assert.equal(E.risk(s,s.positions.kappa).riskRate,E.risk(s,s.positions.moriya).riskRate);
 s.orders.push({id:999,asset:'eientei',intent:'buy',product:'spot',price:95,qty:100,remaining:100,leverage:1});close(s);assert.equal(s.orders.some(o=>o.id===999),false);assert.equal(s.insurance.paid,0);assert.equal(s.cash,8995.5);
});
test('margin mode changes preserve cost and cash and cannot bypass unsafe positions or pending orders',()=>{
 const s=E.create();s.positions.kappa={...position(),entry:101.3};const before=s.cash;E.setMarginMode(s,'kappa','cross');assert.equal(s.positions.kappa.marginMode,'cross');assert.equal(s.cash,before);E.setMarginMode(s,'kappa','isolated');assert.equal(s.positions.kappa.entry,101.3);
 s.orders.push({asset:'kappa',product:'contract',remaining:100,intent:'long',price:101,leverage:20});assert.throws(()=>E.setMarginMode(s,'kappa','cross'),/撤销/);s.orders=[];s.assets[0].mark=96;assert.throws(()=>E.setMarginMode(s,'kappa','cross'),/风险/);
 const healthy=E.create();E.submit(healthy,'kappa','long',101.3,100,20,'contract',1,'cross');assert.throws(()=>E.submit(healthy,'kappa','long',101.3,100,20,'contract',2,'isolated'),/模式/);
});
test('insurance recapitalization clears old deficits exactly once without touching user assets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gensokyo-capital-'));let st=new Store(dir);try{const user={id:1,username:'保留资金'};st.mutate(user,'capital-join-001','join',{});st.transaction(s=>{s.accounts[1].cash=88888;s.insurance={balance:0,paid:100000,uncovered:84057.22};});st.close();st=new Store(dir);assert.equal(st.state.insurance.balance,9815942.78);assert.equal(st.state.insurance.paid,184057.22);assert.equal(st.state.insurance.uncovered,0);assert.equal(st.state.accounts[1].cash,88888);st.transaction(s=>s.insurance.balance=1);st.close();st=new Store(dir);assert.equal(st.state.insurance.balance,1);}finally{st.close();assert.ok(dir.startsWith(path.join(os.tmpdir(),'gensokyo-capital-')));fs.rmSync(dir,{recursive:true,force:true});}
});
test('a newly unsafe position liquidates in the current tick at available quotes and cannot print its guard price',()=>{
 const now=Math.floor(Date.now()/60000)*60000,s=M.create(now),u={id:1,username:'本批强平'};M.join(s,u,now);s.accounts[1].positions.kappa=position();const a=s.assets[0];a.price=a.mark=a.fair=96;for(const b of a.history.slice(-10)){b.c=b.o=b.h=b.l=96;}M.tick(s,{time:now+60000,random:()=>.4});assert.equal(s.accounts[1].positions.kappa,undefined);const fills=s.accounts[1].fills;assert.ok(fills.length);assert.ok(fills.every(f=>f.price>90&&f.price<100));assert.ok(s.accounts[1].cash>=99500);assert.equal(s.accounts[1].cash,E.round(100000+fills.reduce((n,f)=>n+(f.price-100)*f.qty-f.fee,0)));assert.ok(s._journal.some(e=>e.kind==='liquidation'));assert.equal(M.snapshot(s,'kappa',u).market.books.kappa.asks.some(l=>l.price===.1),false);
});
test('cross can survive a move that liquidates isolated; cash exhaustion still forces risk reduction',()=>{
 const s=E.create();s.positions.kappa=position('kappa','cross');s.assets[0].mark=96;E.checkRisk(s);assert.equal(s.positions.kappa.liquidating,undefined);s.cash=500;E.checkRisk(s);assert.equal(s.positions.kappa.liquidating,true);assert.ok(s.orders[0].liquidation);assert.equal(s.orders[0].price,.1);
});

test('a trade that crosses the risk threshold triggers liquidation before the current batch ends',()=>{
 const now=Math.floor(Date.now()/60000)*60000,s=M.create(now),u={id:1,username:'风险仓位'},buyer={id:2,username:'对手买盘'},seller={id:3,username:'普通卖盘'};
 for(const p of [u,buyer,seller])M.join(s,p,now);s.system.cash=0;s.flow={cash:0,inventory:{}};const a=s.assets[0];a.price=a.mark=a.fair=100;for(const b of a.history.slice(-10))b.c=100;s.accounts[1].positions.kappa=position();s.accounts[3].spotPositions.kappa={asset:'kappa',qty:100,entry:100,product:'spot'};
 M.order(s,buyer,{asset:'kappa',product:'spot',intent:'buy',qty:200,price:95,leverage:1},now+1);M.order(s,seller,{asset:'kappa',product:'spot',intent:'sell',qty:100,price:95,leverage:1},now+2);
 M.tick(s,{time:now+60000,random:()=>0});assert.equal(s.accounts[1].positions.kappa,undefined);assert.equal(s.accounts[2].spotPositions.kappa.qty,200);assert.equal(s.accounts[1].fills[0].time,now+60000);assert.ok(s.accounts[1].cash>=99500);
});

test('cross cannot take an insurance subsidy while another cross position has unrealized profit',()=>{
 const s=E.create();s.cash=100;s.positions.kappa=position('kappa','cross');s.positions.moriya=position('moriya','cross');s.assets[0].mark=s.assets[0].price=5;s.assets[1].mark=s.assets[1].price=200;
 assert.throws(()=>E.submit(s,'kappa','close',5,100,20),/先平盈利/);assert.throws(()=>close(s,5),/先平盈利/);assert.equal(s.insurance.paid,0);assert.equal(s.cash,100);
 const o={id:s.seq++,asset:'moriya',intent:'close',product:'contract',qty:100,remaining:100,leverage:20,sign:-1};s.orders.push(o);E.applyFill(s,o,200,100);close(s,5);assert.equal(s.insurance.paid,0);assert.equal(s.cash,589.75);
});
