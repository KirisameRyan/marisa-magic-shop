const assert = require('node:assert/strict');
const E = require('../js/gensokyo-engine.js');
const test = (name, fn) => { fn(); console.log('PASS', name); };
const sampleBook=()=>({kappa:{asks:[{price:101.1,qty:100},{price:101.2,qty:200},{price:101.3,qty:500}],bids:[{price:101,qty:2000}]}});
test('autonomous orders move the market without changing player funds',()=>{
 const s=E.create(),start=s.assets[0].price,volume=s.assets[0].volume;
 const r=E.settle(s,{random:()=>.1});assert.ok(r.systemTradeCount>0);assert.notEqual(s.assets[0].price,start);assert.ok(s.assets[0].volume>volume);assert.equal(s.cash,100000);assert.deepEqual(s.positions,{});assert.equal(s.fills.length,0);assert.ok(s.marketTrades.every(t=>t.source==='system'));
 assert.equal(E.round(s.flow.cash+s.system.cash),11000000);for(const a of s.assets)assert.equal(s.flow.inventory[a.id]+s.system.inventory[a.id],0);
});
test('system incoming orders can fill a resting player order',()=>{
 const s=E.create();E.submit(s,'kappa','short',101.3,100,2);E.settle(s,{random:()=>.1});assert.equal(s.positions.kappa.sign,-1);assert.equal(s.positions.kappa.qty,100);assert.equal(s.orders.length,0);assert.ok(s.marketTrades.some(t=>t.source==='player'));assert.equal(s.positions.kappa.entry,101.3);
});
test('unfunded autonomous buyer creates no artificial executions',()=>{
 const s=E.create();s.flow={cash:0,inventory:{}};const price=s.assets[0].price;E.settle(s,{random:()=>.1});assert.equal(s.assets[0].price,price);assert.equal(s.assets[0].history.at(-1).v,0);assert.equal(s.marketTrades.length,0);
});
test('multi-level execution, weighted cost and remaining balance',()=>{
 const s=E.create();E.submit(s,'kappa','long',101.3,800,2);assert.ok(E.frozen(s)>40000);E.settle(s,{autonomous:false,books:sampleBook()});
 assert.equal(s.assets[0].price,101.3);assert.equal(s.positions.kappa.entry,101.25);assert.equal(s.positions.kappa.qty,800);assert.equal(E.margin(s),40500);assert.equal(E.frozen(s),0);assert.equal(s.orders.length,0);assert.equal(s.cash,99959.49); // fee rounded to cents per execution
});
test('partial fills retain only unfilled reservation; cancellation releases it',()=>{
 const s=E.create();const o=E.submit(s,'kappa','long',101.2,400,2);E.settle(s,{autonomous:false,books:sampleBook()});assert.equal(s.positions.kappa.qty,300);assert.equal(o.remaining,100);assert.equal(s.orders.length,1);const before=E.available(s);E.cancel(s,o.id);assert.equal(E.frozen(s),0);assert.ok(E.available(s)>before);
});
test('short positions profit on lower buyback and release margin',()=>{
 const s=E.create();E.submit(s,'kappa','short',101,100,3);E.settle(s,{autonomous:false,books:sampleBook()});assert.equal(s.positions.kappa.sign,-1);E.submit(s,'kappa','close',101,100,3);E.settle(s,{autonomous:false,books:{kappa:{asks:[{price:100,qty:100}],bids:[]}}});assert.equal(s.positions.kappa,undefined);assert.equal(s.realized,100);assert.equal(E.margin(s),0);assert.equal(s.cash,100089.95);assert.equal(s.system.cash,9999900);
});
test('reject over-close, opposite opening, excess funds and invalid values',()=>{
 const s=E.create();assert.throws(()=>E.submit(s,'kappa','long',101.3,10000,2));assert.throws(()=>E.submit(s,'kappa','long',101.33,1,2));assert.throws(()=>E.submit(s,'kappa','long',NaN,1,2));E.submit(s,'kappa','long',101.3,100,2);assert.throws(()=>E.submit(s,'kappa','short',101,1,2));E.settle(s,{autonomous:false,books:sampleBook()});E.submit(s,'kappa','close',101,70,2);assert.throws(()=>E.submit(s,'kappa','close',101,31,2));
});
test('no executions do not fabricate volume or move last price',()=>{
 const s=E.create(),a=s.assets[0],price=a.price,volume=a.volume;E.submit(s,'kappa','long',90,10,2);E.settle(s,{autonomous:false,books:sampleBook()});assert.equal(a.price,price);assert.equal(a.volume,volume);assert.equal(a.history.at(-1).v,0);assert.equal(s.orders[0].remaining,10);
});
test('short execution at a higher price cannot overdraw available margin',()=>{
 const s=E.create();s.cash=5055.1;E.submit(s,'kappa','short',101,100,2);E.settle(s,{autonomous:false,books:{kappa:{asks:[],bids:[{price:120,qty:100}]}}});assert.ok(E.available(s)>=0);assert.ok(!s.positions.kappa||s.positions.kappa.qty<100);
});
