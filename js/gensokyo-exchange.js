/* Online exchange UI. Balances, orders and matching are authoritative on the server. */
(()=>{'use strict';
const E=window.GensokyoEngine,D=window.GensokyoMarketData,RS=window.RedMistStory||{},$=id=>document.getElementById(id);
const fmt=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const compactMarketNumber=(n,d=2)=>Math.abs(n)>=1e8?fmt(n/1e8,d)+'亿':Math.abs(n)>=1e4?fmt(n/1e4,d)+'万':fmt(n,d);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let overviewChart=null,overviewAssets=[],homeKind='stock',marketKind='stock';
let s=null,selected='kappa',intent='buy',product='spot',view='market',period=60000,newsFilter='all',chart,toastTimer,chartPeriod,initialTheme='light',online=false,serverBooks={},remoteEtag='',remoteRank=null,serverOffset=0,lastRemotePoll=0,polling=false,pollPromise=null,rankRows=[],rankingBoard='assets',rankingPending=false,rankingRefreshQueued=false,lastRankingPoll=0,sessionToken='',joinToken='',joining=null,homeVisible=true,wantsMarket=false,overviewBusy=false;
try{initialTheme=localStorage.getItem('gensokyo-exchange-theme')==='dark'?'dark':'light';}catch{}
function toast(msg){$('toast').textContent=msg;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4500);}
function showGate(message,error=false){homeVisible=true;$('exchange-home').hidden=false;$('home-enter').hidden=!Auth.isLoggedIn();online=false;s=null;remoteEtag='';remoteRank=null;$('exchange-content').hidden=true;$('exchange-nav').hidden=true;$('exchange-session').hidden=true;$('market-gate').hidden=false;$('gate-title').textContent=error?'暂时无法进入市场':Auth.isLoggedIn()?'正在连接交易所':'登录幻想乡交易所';$('gate-status').textContent=message;$('gate-retry').hidden=!error||!Auth.isLoggedIn();$('gate-login').hidden=Auth.isLoggedIn();$('gate-register').hidden=Auth.isLoggedIn();$('gate-guest').hidden=Auth.isLoggedIn();$('guest-note').hidden=Auth.isLoggedIn();$('connection-status').textContent=error?'交易服务连接失败':Auth.isLoggedIn()?'正在连接共享市场':'请先登录网站账户';if(chart){chart.dispose();chart=null;}for(const id of ['orders','positions','fills','ranking-rows','account-summary'])$(id).replaceChildren();}
function reportError(error){if(error.status===401){sessionToken='';ExchangeNetwork.clearPending();showGate('登录已失效，请重新登录。');Auth.verify();}else if(!s||!online)showGate(error.message,true);else{$('connection-status').textContent=error.message;toast(error.message);}}
async function refreshRemote(force=false){if(!online)return;if(polling){await pollPromise;if(force&&online)return refreshRemote(true);return;}polling=true;let done;pollPromise=new Promise(r=>done=r);const target=selected,token=Auth.token();lastRemotePoll=Date.now();try{const data=await ExchangeNetwork.request('state?asset='+encodeURIComponent(target),{etag:force?'':remoteEtag});if(data.unchanged||!online||target!==selected||token!==Auth.token())return;if(!data.account)throw Error('交易账户尚未开通，请重试连接');remoteEtag=data.etag;serverOffset=data.serverTime-Date.now();serverBooks=data.market.books;remoteRank=data.rank;s={version:1,...data.market,...data.account};const cs=$('connection-status');if(cs){cs.textContent=data.market.halted||'';cs.hidden=!data.market.halted;}$('exchange-home').hidden=!homeVisible;$('exchange-content').hidden=homeVisible;$('exchange-session').hidden=homeVisible;$('exchange-nav').hidden=homeVisible;render();if(!homeVisible)showRiskWarning();if(!homeVisible)chart?.resize();if(view==='ranking')refreshRanking();}finally{polling=false;done();}}
async function enterOnline(){if(!E||typeof E.isCross!=='function'||typeof E.setMarginMode!=='function'||typeof E.leverages!=='function')throw Error('页面资源版本不一致，请刷新页面后重试；若仍失败，请清除本站缓存。');wantsMarket=true;const token=Auth.token();if(!token){Auth.openModal('login');return;}if(joinToken===token)return joining;showGate('正在验证账户并连接共享市场…');homeVisible=false;joinToken=token;joining=(async()=>{await ExchangeNetwork.request('join',{body:{}});if(token!==Auth.token())return;sessionToken=token;online=true;remoteEtag='';await refreshRemote(true);if(s){navigate(view);$('order-price').value=asset().price.toFixed(1);estimate();showEventPromo();}})().finally(()=>{if(joinToken===token){joinToken='';joining=null;}});return joining;}
async function remoteMutation(route,body){if(!online||!s)throw Error('请先登录并连接交易所');$('submit-order').disabled=true;try{const result=await ExchangeNetwork.request(route,{body});await refreshRemote(true);if(view==='ranking')await refreshRanking();return result;}finally{$('submit-order').disabled=false;pauseStatus();}}
async function refreshRanking(){
 if(!online||!s)return;if(rankingPending){rankingRefreshQueued=true;return;}rankingPending=true;lastRankingPoll=Date.now();const token=Auth.token(),board=rankingBoard,titles={assets:'总资产榜',profit:'今日盈利榜',loss:'今日亏损榜',liquidation:'爆仓榜'},daily=board!=='assets';
 $('ranking-status').textContent='正在读取'+titles[board]+'…';$('ranking-value-heading').textContent=daily?'今日盈亏':'总资产';$('ranking-rate-heading').textContent=daily?'今日收益率':'累计收益率';
 try{const data=await ExchangeNetwork.request('leaderboard?board='+board);if(!online||token!==Auth.token()||board!==rankingBoard)return;rankRows=data.rows;
 if(board==='liquidation'){
 $('ranking-rule').textContent='按单次强平事件的额外亏损从高到低排列；额外亏损是超过逐仓保证金或全仓可承担现金、需要保险池承担的部分。分批成交合并记录，仅统计本次更新后的事件。';
 $('ranking-value-heading').textContent='额外亏损';$('ranking-rate-heading').textContent='爆仓时间';
 $('ranking-status').textContent='爆仓榜 · '+data.total+'次事件 · 更新于 '+D.time(data.updatedAt,true);
 $('ranking-self').textContent=data.self?'我的最高单次记录：第'+data.self.rank+'名 · 额外亏损 '+fmt(data.self.extraLoss):'暂无爆仓记录';
 $('ranking-rows').innerHTML=data.rows.length?data.rows.map(r=>`<div class="rank-player"><div class="ranking-row ${r.userId===Auth.user()?.id?'is-self':''}"><b>${r.rank}</b><span>${esc(r.name)}</span><span class="down">${fmt(r.extraLoss)}</span><span>${D.time(r.time,true)}</span></div><p class="liquidation-detail">${esc(r.assetName)} · ${r.direction==='long'?'多头':'空头'} ${r.leverage}× · 已平${quantityText(r.qty)}${r.extraLoss===0?' · 未穿仓':''}</p></div>`).join(''):'<div class="empty">暂无爆仓记录</div>';return;
 }
 $('ranking-rule').textContent='今日按北京时间04:00划分，含浮动盈亏与手续费；仅开通、没有委托或交易的空账户不入榜。';
 $('ranking-status').textContent=titles[board]+' · '+data.total+'个账户 · 更新于 '+D.time(data.updatedAt,true);
 const amount=r=>daily?r.dailyPnl:r.equity,rate=r=>daily?r.dailyReturnPct:r.returnPct,value=r=>(daily&&amount(r)>0?'+':'')+fmt(amount(r)),percentage=r=>rate(r)==null?'—':(rate(r)>0?'+':'')+fmt(rate(r))+'%';
 $('ranking-self').textContent=data.self?'我的排名：第'+data.self.rank+'名 · '+(daily?'今日盈亏 ':'总资产 ')+value(data.self)+' · '+percentage(data.self):daily?'今日暂无符合本榜条件的盈亏':'尚未上榜，提交委托或完成交易后参与排名';
 $('ranking-rows').innerHTML=rankRows.length?rankRows.map(r=>'<div class="rank-player"><div class="ranking-row '+(data.self?.userId===r.userId?'is-self':'')+'"><b>'+r.rank+'</b><span>'+esc(r.name)+'</span><span class="'+(daily?cls(amount(r)):'')+'">'+value(r)+'</span><span class="'+cls(rate(r)||0)+'">'+percentage(r)+'</span></div>'+rankingOrders(r.orders)+'</div>').join(''):'<div class="empty">'+(daily?'今日暂无'+(board==='profit'?'盈利':'亏损')+'账户':'暂无参与排名的账户')+'</div>';
 }catch(e){if(board===rankingBoard)$('ranking-status').textContent=e.message;if(e.status===401)reportError(e);}finally{rankingPending=false;if(rankingRefreshQueued){rankingRefreshQueued=false;refreshRanking();}}
}
const riskNotices=new Map();let riskOwner=null;
function showRiskWarning(){
 const owner=Auth.user()?.id;if(owner!==riskOwner){riskNotices.clear();riskOwner=owner;}
 const active=new Set(Object.keys(s.positions)),warnings=[];
 for(const key of riskNotices.keys())if(!active.has(key))riskNotices.delete(key);
 for(const p of Object.values(s.positions)){
 const risk=E.risk(s,p),level=p.liquidating||risk.riskRate>=1?2:risk.riskRate>=.8?1:0,old=riskNotices.get(p.asset)||0;
 if(risk.riskRate<.7&&!p.liquidating)riskNotices.delete(p.asset);
 if(level>old){warnings.push({p,risk,level});riskNotices.set(p.asset,level);}
 }
 let dialog=$('risk-warning-dialog');if(!warnings.length){if(dialog?.open&&Object.values(s.positions).every(p=>!p.liquidating&&E.risk(s,p).riskRate<.7))dialog.close();return;}
 if(!dialog){dialog=document.createElement('dialog');dialog.id='risk-warning-dialog';dialog.setAttribute('aria-labelledby','risk-warning-title');dialog.innerHTML='<h2 id="risk-warning-title">强平预警</h2><div id="risk-warning-body"></div><p class="insurance-status">风险率＝（维持保证金＋预计平仓手续费）÷仓位权益。80%起预警，100%触发强平。委托需要等待成交，预警不能保证避免穿仓。</p><div class="risk-warning-actions"><button type="button" id="risk-warning-dismiss">我知道了</button><button type="button" id="risk-warning-positions">查看持仓／处理风险</button></div>';document.body.appendChild(dialog);$('risk-warning-dismiss').onclick=()=>dialog.close();$('risk-warning-positions').onclick=()=>{dialog.close();navigate('positions');};}
 // Render every currently dangerous position when a new warning escalates.
 $('risk-warning-body').innerHTML=Object.values(s.positions).filter(p=>p.liquidating||E.risk(s,p).riskRate>=.8).map(p=>{const r=E.risk(s,p);return `<article><strong>${esc(s.assets.find(a=>a.id===p.asset)?.name)} · ${p.sign===1?'多头':'空头'} ${p.leverage}×</strong><p>风险率 ${Number.isFinite(r.riskRate)?fmt(r.riskRate*100)+'%':'超过100%'} · ${p.liquidating||r.riskRate>=1?'已触发强平，请立即检查仓位':'接近强平，请考虑追加保证金或减仓'}</p><p>标记价 ${fmt(s.assets.find(a=>a.id===p.asset).mark)} · 预计强平价 ${fmt(r.liquidationPrice)}${E.isCross(p)?'（假设其他仓位价格不变）':''}</p></article>`;}).join('');
 if(!dialog.open)dialog.showModal();
}
function rankingOrders(orders){if(!orders?.count)return '<div class="rank-order-empty">暂无未成交挂单</div>';return `<details class="rank-orders"><summary>主要挂单 · ${orders.count}笔 · 未成交${quantityText(orders.totalQty)}</summary><div class="rank-order-totals">买方 ${quantityText(orders.buyQty)}　卖方 ${quantityText(orders.sellQty)}</div><div class="rank-order-head"><span>标的</span><span>方向</span><span>限价</span><span>剩余数量</span></div>${orders.majorOrders.map(o=>`<div class="rank-order-item"><button data-newsasset="${esc(o.asset)}">${esc(o.name)}</button><span>${o.product==='spot'?'普通':'合约'}${label(o)}</span><span>${o.liquidation?'市价强平':fmt(o.price,1)}</span><strong>${quantityText(o.remaining)}</strong></div>`).join('')}${orders.groupCount>5?'<p>按剩余数量显示前5组挂单</p>':''}</details>`;}
function asset(){return s.assets.find(a=>a.id===selected);}
function cls(n){return n>=0?'up':'down';}
function label(o){return ({buy:'买入',sell:'卖出',long:'开多',short:'开空',close:'平仓'})[o.intent]||'委托';}
function metric(title,value,color=''){return `<div class="metric"><span>${title}</span><strong class="${color}">${value}</strong></div>`;}
function holding(){return product==='spot'?s.spotPositions[selected]:s.positions[selected];}
function positionPnl(p){const a=s.assets.find(a=>a.id===p.asset);return ((p.product==='spot'?a.price:a.mark)-p.entry)*p.qty*(p.sign||1);}
function applyTheme(theme){document.documentElement.dataset.theme=theme;const light=theme==='light';$('theme-toggle').textContent=light?'深色':'浅色';$('theme-toggle').setAttribute('aria-label',light?'切换为深色主题':'切换为浅色主题');document.querySelector('meta[name="theme-color"]').content=light?'#ffffff':'#101112';if(chart)renderChart();}
applyTheme(initialTheme);
function navigate(to){if(!online||!s)return;view=to;window.ExchangeTools.mountMarket(to);if(to==='ranking')refreshRanking();$('market-tape').hidden=to!=='market';document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==to+'-view');document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.go===to||(to==='conditions'&&b.dataset.go==='market')));render();requestAnimationFrame(()=>chart?.resize());window.scrollTo({top:0,behavior:'instant'});}
function tradeControls(){
 const supported=E.leverages(asset()),wanted=s.positions[selected]?.leverage||Number($('leverage').value)||2;$('leverage').innerHTML=supported.map(n=>`<option value="${n}">${n}×</option>`).join('');$('leverage').value=String(supported.includes(wanted)?wanted:2);
 const spot=product==='spot';if(!spot&&s.positions[selected]?.leverage===1&&!$('leverage').querySelector('[value="1"]'))$('leverage').insertAdjacentHTML('beforeend','<option value="1" disabled>旧版1×（仅平仓）</option>');if(!spot&&s.positions[selected]?.leverage===1){$('leverage').value='1';intent='close';}document.querySelectorAll('[data-product]').forEach(b=>b.classList.toggle('active',b.dataset.product===product));
 $('trade-caption').textContent=spot?'全额资金交易':'合约保证金';$('margin-mode-field').hidden=spot;const contractPosition=s.positions[selected];if(contractPosition)$('margin-mode').value=contractPosition.marginMode||'isolated';$('margin-mode').disabled=spot||!!contractPosition||intent==='close';
 const buttons=document.querySelectorAll('[data-side]');buttons[0].dataset.side=spot?'buy':'long';buttons[0].textContent=spot?'买入':'开多';buttons[1].dataset.side=spot?'sell':'short';buttons[1].textContent=spot?'卖出':'开空';buttons[2].hidden=spot;buttons[2].dataset.side='close';buttons[2].textContent='平仓';
 buttons.forEach(b=>b.classList.toggle('active',b.dataset.side===intent));$('leverage-field').hidden=spot;$('leverage').disabled=spot||intent==='close';$('order-form').classList.toggle('spot-form',spot);
 $('submit-order').textContent='提交'+label({intent})+'委托';$('submit-order').className='submit-order '+(['sell','short'].includes(intent)?'short':intent==='close'?'close':'');estimate();
}
function switchProduct(p){product=p;intent=p==='spot'?'buy':'long';$('leverage').value=p==='spot'?'1':String(s.positions[selected]?.leverage||2);tradeControls();}
async function select(id){if(!online||!s)return;selected=id;try{await refreshRemote(true);if(!s||selected!==id)return;$('order-price').value=asset().price.toFixed(1);if(product==='contract')$('leverage').value=s.positions[id]?.leverage||2;tradeControls();}catch(e){reportError(e);}}
function orderQuantity(){const p=holding();return ['sell','close'].includes(intent)&&p&&p.qty%100?p.qty:Number($('order-qty').value);}
function quantityText(q){return fmt(q,0)+'份';}
const pauseNotices=new Map();let pauseOwner=null;
function pauseStatus(){if(!s)return;const a=asset(),circuit=a.pausedUntil>Date.now()+serverOffset,suspended=!!a.suspended,paused=circuit||suspended;$('asset-pause').hidden=!paused;$('asset-pause').textContent=suspended?('本股停牌 · '+(a.suspended.reason||'异变影响')+' · 复牌时间以公告为准 · 未成交委托已撤回'):circuit?('本股触发熔断暂停 · '+D.time(a.pausedUntil)+' 恢复 · 未成交委托已撤回'):'';$('submit-order').disabled=paused;
 const stamp=$('trading-halt');if(stamp){stamp.hidden=!paused;$('halt-reason').textContent=paused?(suspended?(a.suspended.reason||'活动安排，临时停牌')+'。复牌时间以交易所公告为准。':(a.pauseReason||'价格异常波动，触发熔断')+'。预计北京时间 '+D.time(a.pausedUntil,true)+' 恢复交易。'):'';}
 const conditionAsset=$('cond-asset')?.value,conditionAssetObj=s.assets.find(x=>x.id===conditionAsset),conditionPaused=conditionAssetObj&&((conditionAssetObj.pausedUntil||0)>Date.now()+serverOffset||conditionAssetObj.suspended);if($('condition-submit'))$('condition-submit').disabled=!!conditionPaused;
 const owner=Auth.user()?.id;if(owner!==pauseOwner){pauseNotices.clear();pauseOwner=owner;}
 let dialog=$('circuit-dialog');if(!circuit||homeVisible||!['market','conditions'].includes(view)){if(dialog?.open)dialog.close();return;}
 const key=a.id+':'+a.pausedUntil;if(pauseNotices.has(key))return;pauseNotices.set(key,true);
 if(!dialog){dialog=document.createElement('dialog');dialog.id='circuit-dialog';dialog.setAttribute('aria-labelledby','circuit-title');dialog.innerHTML='<h2 id="circuit-title">本股触发熔断暂停</h2><p id="circuit-message"></p><button type="button" id="circuit-close" class="submit-order">我知道了</button>';document.body.appendChild(dialog);$('circuit-close').onclick=()=>dialog.close();}
 $('circuit-title').textContent=a.kind==='crypto'?'本币触发熔断暂停':'本股触发熔断暂停';$('circuit-message').textContent=a.name+'：'+(a.pauseReason||'价格异常波动')+'。暂停期间不成交任何订单，全部未成交委托已撤回，已成交部分保留。预计北京时间 '+D.time(a.pausedUntil,true)+' 恢复交易，届时需重新下单。';if(!dialog.open)dialog.showModal();
}

function estimate(){const p=holding(),odd=['sell','close'].includes(intent)&&p&&p.qty%100;$('order-qty').disabled=!!odd;$('quantity-minus').disabled=!!odd;$('quantity-plus').disabled=!!odd;$('quantity-label').textContent=odd?'旧仓整笔退出（'+p.qty+'份）':'数量（份）';const n=Number($('order-price').value)*orderQuantity(),lev=product==='spot'?1:Number($('leverage').value),reduce=['sell','close'].includes(intent);$('estimate-label').textContent=intent==='sell'?'预计到账':intent==='close'?'平仓说明':product==='spot'?'预计冻结货款':'预计保证金及费用';$('estimate').textContent=reduce?(intent==='sell'?fmt(n-n*.0005):'仅减仓'):fmt(n/lev+n*.0005+.05);$('available').textContent=fmt(E.available(s));$('contract-risk').hidden=product!=='contract';if(product==='contract')$('contract-risk').innerHTML=`${$('margin-mode').value==='cross'?'全仓：共享可用现金及全仓合约盈亏，不抵押普通持仓和逐仓保证金。':'逐仓：最多损失该仓位保证金（另收交易手续费），无欠款。'}<br>初始保证金率 <b>${fmt(100/lev)}%</b> · 维持保证金率 <b>${fmt(E.maintenanceRate(asset())*100)}%</b><br>风险率80%预警、100%强平；预留0.05%平仓费。${asset().kind==='crypto'?'虚拟币支持最高100倍，初始保证金仅1%，小幅反向波动也可能强平。':'股票最高20倍，初始保证金为名义金额的5%。'}`;}
function renderEtf(){const a=asset();$('etf-info').hidden=a.kind!=='etf';if(a.kind!=='etf')return;const premium=(a.price/a.iopv-1)*100;$('etf-info').innerHTML=`<div class="etf-summary"><span>IOPV参考净值 <b>${fmt(a.iopv,3)}</b></span><span>${premium>=0?'溢价':'折价'} <b class="${cls(premium)}">${fmt(premium)}%</b></span></div><details><summary>查看${a.basket.length}只成分股与持仓权重</summary><div class="basket-list">${a.basket.map(b=>{const stock=s.assets.find(x=>x.id===b.asset);return `<div><button data-instrument="${stock.id}">${stock.name}</button><span>当前权重 ${fmt(b.quantity*stock.price/a.iopv*100)}%</span><span>${b.quantity.toFixed(4)}份 / ETF份额</span></div>`;}).join('')}</div><p>IOPV 按成分股市价计算；暂不支持申购赎回。</p></details>`;}
function positionRisk(p){const r=E.risk(s,p),ratio=Number.isFinite(r.riskRate)?fmt(r.riskRate*100)+'%':'超过100%',status=p.liquidating?'强平队列':r.riskRate>=.8?'风险预警':'正常';return `<div class="position-risk"><div class="risk-heading"><b class="${r.riskRate>=.8?'up':''}">${status} · 风险率 ${ratio}</b>${E.isCross(p)?'<span>共享现金担保</span>':`<button class="cancel" data-margin="${p.asset}">追加保证金</button>`}<button class="cancel" data-mode-asset="${p.asset}" data-mode="${E.isCross(p)?'isolated':'cross'}">切为${E.isCross(p)?'逐仓':'全仓'}</button></div><div class="risk-metrics"><span>初始保证金率 <b>${fmt(r.initialRate*100)}%</b></span><span>当前保证金率 <b>${fmt(r.marginRate*100)}%</b></span><span>维持保证金率 <b>${fmt(r.maintenanceRate*100)}%</b></span><span>${E.isCross(p)?'全仓共享权益':'仓位权益'} <b>${fmt(r.equity)}</b></span><span>维持保证金 <b>${fmt(r.maintenance)}</b></span><span>预估强平标记价 <b>${fmt(r.liquidationPrice)}</b></span></div><p>${E.isCross(p)?'全仓所有仓位共用现金担保，切换模式不会消除亏损。预计强平价假设其他仓位价格不变。':'逐仓只承担该仓位保证金范围内的亏损。'}风险率80%预警、100%强平，强平成交价取决于盘口。</p></div>`;}
function renderChart(){
 if(!window.echarts){$('price-chart').textContent='图表加载失败，请刷新';return;}if(!chart)chart=echarts.init($('price-chart'));
 const all=D.aggregate(asset().history,period),indicators=D.macd(all),start=Math.max(0,all.length-140),bars=all.slice(start),macd=indicators.slice(start),light=document.documentElement.dataset.theme==='light',mobile=innerWidth<600;
 const times=bars.map(b=>String(b.t)),axisColor=light?'#718091':'#8f999f',gridColor=light?'#e3e8ee':'#282d31';
 const maColors=[light?'#39495d':'#e0e7ef','#c69a41','#4d8ec4','#bd70a3'];const previousZoom=chartPeriod===period?chart.getOption()?.dataZoom?.[0]:null;chartPeriod=period;const averages=[5,10,20,30].map(n=>({n,values:D.movingAverage(all,n).slice(start)}));const last=macd.at(-1);$('indicator-values').textContent=last?`MACD (12,26,9)　DIF ${last.dif.toFixed(3)}　DEA ${last.dea.toFixed(3)}　柱 ${last.hist.toFixed(3)}`:'MACD：暂无样本';
 const grids=[{left:mobile?42:58,right:14,top:20,height:'44%'},{left:mobile?42:58,right:14,top:'51%',height:'11%'},{left:mobile?42:58,right:14,top:'69%',height:'18%'}];
 chart.setOption({animation:false,legend:{top:0,left:mobile?42:58,right:12,type:'scroll',textStyle:{color:axisColor,fontSize:9},itemWidth:12,itemHeight:7,data:['MA5','MA10','MA20','MA30',...(asset().kind==='etf'?['IOPV']:[])]},backgroundColor:'transparent',axisPointer:{link:[{xAxisIndex:'all'}]},tooltip:{trigger:'axis',confine:true,backgroundColor:light?'#fff':'#20262b',borderColor:gridColor,textStyle:{color:light?'#263644':'#e3e6e9',fontSize:11},formatter:params=>{const b=bars[params[0]?.dataIndex];if(!b)return '';const i=macd[params[0].dataIndex];return `${D.time(b.t,true)}（北京时间）<br>开 ${fmt(b.o)}　高 ${fmt(b.h)}<br>低 ${fmt(b.l)}　收 ${fmt(b.c)}<br>成交量 ${fmt(b.v,0)}份<br>DIF ${i.dif.toFixed(4)}　DEA ${i.dea.toFixed(4)}<br>MACD柱 ${i.hist.toFixed(4)}${asset().kind==='etf'&&b.iopv?'<br>IOPV '+fmt(b.iopv):''}${b.demo?'<br>包含演示历史':''}`;}},grid:grids,
 xAxis:grids.map((_,index)=>({gridIndex:index,type:'category',data:times,boundaryGap:true,axisLine:{lineStyle:{color:gridColor}},axisTick:{show:false},axisLabel:{show:index===2,color:axisColor,fontSize:9,hideOverlap:true,formatter:v=>D.axisTime(Number(v),period)}})),
 yAxis:grids.map((_,index)=>({gridIndex:index,scale:true,splitNumber:index===0?4:2,axisLabel:{show:index!==1,color:axisColor,fontSize:9,formatter:v=>index===0?v.toFixed(1):v.toFixed(2)},splitLine:{lineStyle:{color:gridColor}},axisPointer:{label:{precision:3}}})),
 dataZoom:[{type:'inside',xAxisIndex:[0,1,2],start:previousZoom?.start??Math.max(0,100-90/Math.max(bars.length,1)*100),end:previousZoom?.end??100},{type:'slider',xAxisIndex:[0,1,2],bottom:5,height:14,showDetail:false,borderColor:gridColor,fillerColor:light?'#9cabb730':'#a9b6c230',handleStyle:{color:axisColor}}],
 graphic:[{type:'text',left:mobile?43:60,top:'48%',style:{text:'成交量',fill:axisColor,font:'10px sans-serif'}},{type:'text',left:mobile?43:60,top:'65%',style:{text:'MACD (12,26,9)',fill:axisColor,font:'10px sans-serif'}}],
 series:[...averages.map((m,i)=>({name:'MA'+m.n,type:'line',data:m.values,symbol:'none',connectNulls:false,itemStyle:{color:maColors[i]},lineStyle:{color:maColors[i],width:1}})),...(asset().kind==='etf'?[{name:'IOPV',type:'line',data:bars.map(b=>b.iopv??null),symbol:'none',connectNulls:false,itemStyle:{color:light?'#00888b':'#4ad2d4'},lineStyle:{color:light?'#00888b':'#4ad2d4',width:1.5,type:'dashed'}}]:[]),{name:'蜡烛',type:'candlestick',data:bars.map(b=>[b.o,b.c,b.l,b.h]),itemStyle:{color:'#df4540',color0:'#229963',borderColor:'#df4540',borderColor0:'#229963'}},{name:'成交量',type:'bar',xAxisIndex:1,yAxisIndex:1,data:bars.map(b=>({value:b.v,itemStyle:{color:b.c>=b.o?'#c44a44':'#27885b'}}))},{name:'MACD柱',type:'bar',xAxisIndex:2,yAxisIndex:2,data:macd.map(i=>({value:i.hist,itemStyle:{color:i.hist>=0?'#d74a45':'#279763'}}))},{name:'DIF',type:'line',xAxisIndex:2,yAxisIndex:2,data:macd.map(i=>i.dif),symbol:'none',lineStyle:{color:light?'#537bba':'#82a8e3',width:1}},{name:'DEA',type:'line',xAxisIndex:2,yAxisIndex:2,data:macd.map(i=>i.dea),symbol:'none',lineStyle:{color:light?'#a16d22':'#d4ab66',width:1}}]},true);
}
function renderBook(){const b=serverBooks[selected]||{asks:[],bids:[]},support=asset().battleSupport,note=$('book-battle-note');if(note){note.hidden=!support;note.textContent=b.asks.some(l=>l.eventQty)?'异变卖单在盘 · 等待玩家承接':b.bids.some(l=>l.eventQty)?'异变回补在盘 · 等待玩家卖出':support?'玩家主导 · 系统小额辅助':'';note.title=support?'系统每侧每分钟最多辅助'+support.sideCap+'份，报价退让约'+support.retreat*100+'%；不与活动空头互相成交。':'';}const asks=b.asks.slice(0,5),bids=b.bids.slice(0,5),max=Math.max(...asks.map(l=>l.qty),...bids.map(l=>l.qty),1);const row=(l,i,sell)=>`<button class="book-row${l.eventQty?' event-order':''}" title="${l.eventQty?'含异变订单 '+quantityText(l.eventQty):''}" data-price="${l.price}" style="--depth:${l.qty/max*90}%;--shade:${sell?'#3c211f':'#173124'}"><span>${sell?'卖':'买'}${i+1}</span><span class="${sell?'up':'down'}">${l.price.toFixed(1)}</span><span>${quantityText(l.qty)}</span></button>`;$('asks').innerHTML=asks.map((l,i)=>row(l,i,true)).reverse().join('');$('bids').innerHTML=bids.map((l,i)=>row(l,i,false)).join('');const spread=(asks[0]?.price||0)-(bids[0]?.price||0);$('spread').textContent=spread<=0?'买卖交叉 · 待撮合':'买卖价差 '+fmt(spread,1);}
let marketEffectsEnabled=true;try{marketEffectsEnabled=localStorage.getItem('gensokyo-market-effects')!=='off';}catch{}
function marketScene(inc,a){
 if(!inc?.enabled||inc.phase==='resolved')return null;
 if(a.id==='scarlet')return {kind:'manor',title:['p3a','p3c'].includes(inc.phase)?'红魔馆 · 决战中的交易席':'红魔馆 · 红雾笼罩',line:inc.phase==='p3c'?'蕾米莉亚的空头正在等待市场回应。目标标记价 '+fmt(inc.p3Target):inc.phase==='p3a'?'灵梦与魔理沙已抵达馆内，联合支援正在削减护盾。':'馆门紧闭，雾中的钟声仍在继续。复牌安排以活动公告为准。'};
 if(a.id==='mistlake'&&['p1','vote1','p2'].includes(inc.phase))return {kind:'lake',title:inc.phase==='p2'?'雾之湖 · 封湖调查':'雾之湖 · 冷链支援线',line:inc.phase==='p2'?'调查队进入浓雾深处，冰湖冷链暂时停牌。湖畔巡逻仍在继续。':'湖面被红雾遮住，调查队正在等待物资与路线记录。'};
 if(inc.phase==='p2'&&a.id===inc.defend?.asset)return {kind:'defense',title:a.name+' · 联合护盘',line:'这里是全服投票选定的支援产业，玩家承担主要承接，系统缩量退让。防守参考价 '+fmt(inc.defend.floor)+' · 已守住 '+rm(inc.defend.minutes)+' / '+rm(inc.defend.required)+' 分钟。'};
 if(inc.phase==='vote1'&&['hakugyoku','myouren','kazami'].includes(a.id))return {kind:'defense',title:'战略投票 · 待选支援产业',line:'幻想乡的支援力量正在集结。投票结果将决定下一阶段重点保护的产业。'};
 return null;
}
function renderMarketAtmosphere(){
 const context=$('market-context'),banner=$('event-market-scene'),mist=$('market-atmosphere');if(!context||!banner||!mist)return;
 const scene=marketScene(s.incident,asset());banner.hidden=mist.hidden=!scene;
 if(!scene){delete context.dataset.eventScene;delete context.dataset.sceneMotion;return;}
 context.dataset.eventScene=scene.kind;context.dataset.sceneMotion=marketEffectsEnabled&&['market','conditions'].includes(view)&&!homeVisible?'on':'off';
 banner.innerHTML='<div><span class="scene-kicker">红雾异变 · '+esc(phaseLabel(s.incident.phase))+'</span><h2>'+esc(scene.title)+'</h2><p>'+esc(scene.line)+'</p></div><div class="scene-actions"><button type="button" data-go="activity">前往战役</button><button type="button" id="scene-effects-toggle">'+(marketEffectsEnabled?'暂停动效':'开启动效')+'</button></div>';
}

function renderNews(){const isIncident=n=>n.category==='异变通告'||String(n.id||'').startsWith('incident-');const list=s.news.filter(n=>newsFilter==='all'||(newsFilter==='incident'?isIncident(n):!isIncident(n)&&(newsFilter==='trading'?n.kind==='market-report':n.kind!=='market-report'&&(newsFilter==='positive'?n.delta>0:n.delta<0))));$('news-list').innerHTML=list.map(n=>{const header=`<div class="news-meta"><span>${esc(n.category)}</span><time>${D.time(n.time,true)}</time><span>${esc(n.source)}</span></div><h2>${esc(n.title)}</h2><p>${esc(n.body)}</p>`,assetButton=`<button class="related-asset" data-newsasset="${esc(n.asset)}">${esc(s.assets.find(a=>a.id===n.asset)?.name||'产业')}</button>`;if(isIncident(n))return `<article class="news-item standard-news">${header}</article>`;if(n.kind==='market-report')return `<article class="news-item standard-news">${header}<div class="impact-summary">${assetButton}${Number.isFinite(n.priceChangePct)?'<b class="'+cls(n.priceChangePct)+'">本批 '+(n.priceChangePct>0?'+':'')+fmt(n.priceChangePct)+'%</b>':''}${n.playerQty?'<span>玩家参与成交 '+quantityText(n.playerQty)+'</span>':''}</div></article>`;return `<article class="news-item standard-news">${header}<div class="impact-summary">${assetButton}<b class="${n.delta>0?'up':'down'}">${esc(n.direction)}</b><span>影响强度：${esc(n.strength)}</span><span>窗口：${esc(n.duration)}</span></div><details class="impact-analysis" open><summary>影响评估</summary><p><b>传导逻辑</b> ${esc(n.reason)}</p><p><b>不确定性</b> ${esc(n.risk)}</p></details></article>`;}).join('')||'<div class="empty">暂无符合条件的资讯</div>';}
function render(){if(!s||!online)return;const a=asset(),base=a.history.findLast(b=>b.t<=s.lastTick-86400000)?.c||a.prev,diff=a.price-base,contractUnreal=Object.values(s.positions).reduce((n,p)=>n+positionPnl(p),0),spotValue=Object.values(s.spotPositions).reduce((n,p)=>n+s.assets.find(a=>a.id===p.asset).price*p.qty,0);
 $('round').textContent=s.round;$('asset-picker').innerHTML=s.assets.map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${x.name}${x.kind==='crypto'?' · 虚拟币':x.kind==='etf'?' · ETF':' · 股票'}</option>`).join('');marketKind=a.kind==='crypto'?'crypto':'stock';document.querySelectorAll('[data-market-kind]').forEach(b=>b.classList.toggle('active',b.dataset.marketKind===marketKind));$('instruments').innerHTML=s.assets.filter(x=>(x.kind==='crypto'?'crypto':'stock')===marketKind).map(a=>`<button data-instrument="${a.id}" class="${a.id===selected?'active':''}">${a.name}</button>`).join('');$('instrument-name').textContent=a.name;$('instrument-code').textContent=a.code;
 $('last-price').textContent=fmt(a.price);$('last-price').className='hero-price '+cls(diff);$('price-change').textContent=`${diff>=0?'+':''}${fmt(diff)}　${diff>=0?'+':''}${(diff/base*100).toFixed(2)}%`;$('price-change').className=cls(diff);
 const recent=a.history.filter(b=>b.t>s.lastTick-86400000);$('high').textContent=recent.length?fmt(Math.max(...recent.map(b=>b.h))):'—';$('low').textContent=recent.length?fmt(Math.min(...recent.map(b=>b.l))):'—';$('prev').textContent=fmt(base);const stats=a.quoteStats,windowName=stats?.partial?'累计':'24h';$('volume-label').textContent='量（'+windowName+'）';$('amount-label').textContent='额（'+windowName+'）';$('volume').textContent=stats?compactMarketNumber(stats.volume,0)+'份':'—';$('turnover').textContent=stats?fmt(stats.turnover)+'%':'—';$('amount').textContent=stats?compactMarketNumber(stats.amount)+'游戏币':'—';const statsTip=stats?'统计自北京时间 '+D.time(stats.since,true)+'，最多滚动24小时；成交量和成交额含现货、合约名义成交，每笔只计一次。':'';$('volume-label').title=statsTip;$('amount-label').title=statsTip;$('turnover-label').title=stats?'现货成交量 '+fmt(stats.spotVolume,0)+'份 ÷ 游戏参考流通量 '+fmt(stats.referenceFloat,0)+'份；不含纯合约成交，分母为游戏设定。':'等待服务器统计';$('price-band').textContent=a.priceBand?fmt(a.priceBand.lower,1)+'～'+fmt(a.priceBand.upper,1):'等待更新';$('mark').textContent=fmt(a.mark);$('current-price').textContent=fmt(a.price);$('headline').textContent=s.news[0].title;renderEtf();
 renderMarketAtmosphere();tradeControls();pauseStatus();renderBook();if(['market','conditions'].includes(view)&&!homeVisible)renderChart();
 $('orders').innerHTML=s.orders.length?s.orders.map(o=>`<div class="order-row"><div class="row-line"><b>${s.assets.find(a=>a.id===o.asset).name} <span class="${o.sign===1?'up':'down'}">${label(o)}</span></b><button class="cancel" data-cancel="${o.id}">撤单</button></div><small>${o.liquidation?'市价强平':fmt(o.price,1)} × ${quantityText(o.remaining)} · ${o.liquidation?'强平中':o.remaining<o.qty?'部分成交':'待撮合'} · ${o.product==='spot'?'普通交易':o.leverage+'×合约'}</small></div>`).join(''):'<div class="empty">暂无委托<br>每分钟整点撮合</div>';
 $('account-identity').textContent=(Auth.user()?.username||'')+(Auth.user()?.provider==='bilibili'?' · B站账户':' · 网站绑定账户');$('account-badge').textContent='共享盘';$('account-mode-note').textContent='服务器账本';$('my-rank-link').textContent=online&&remoteRank?'我的排名：第'+remoteRank+'名 ›':'查看统一排行榜 ›';$('account-summary').innerHTML=metric('总资产 / 净值',fmt(E.equity(s)))+metric('累计盈亏',fmt(E.equity(s)-100000),cls(E.equity(s)-100000))+metric('普通持仓市值',fmt(spotValue))+metric('可用资金',fmt(E.available(s)));$('net-value').textContent=fmt(E.equity(s));$('position-summary').innerHTML=metric('合约浮动盈亏',fmt(contractUnreal),cls(contractUnreal))+metric('合约保证金',fmt(E.margin(s)))+metric('委托冻结',fmt(E.frozen(s)));
 $('insurance-status').textContent=`模拟保险金 ${fmt(s.insurance.balance)} · 已承担缺口 ${fmt(s.insurance.paid)} · 未覆盖缺口 ${fmt(s.insurance.uncovered)} · 手续费入池 ${fmt(s.insurance.feeIncome||0)}${s.insurance.uncovered>0?' · 已暂停合约新开仓':''}`;const positions=[...Object.values(s.spotPositions),...Object.values(s.positions)];$('positions').innerHTML=positions.length?positions.map(p=>{const spot=p.product==='spot';return `<article class="position-card"><div class="row-line"><b>${s.assets.find(a=>a.id===p.asset).name} <span class="${spot||p.sign===1?'up':'down'}">${spot?'普通持仓':(p.sign===1?'多':'空')+' '+p.leverage+'×合约'}</span></b><button class="cancel" data-close="${p.asset}" data-closeproduct="${spot?'spot':'contract'}">${spot?'卖出':'平仓'}</button></div><div class="position-meta"><span>${spot?'全额资金':E.isCross(p)?'全仓':'逐仓'}</span><span>数量 ${quantityText(p.qty)}</span>${spot?'':`<span>保证金 ${fmt(p.margin)}</span>`}</div><div class="position-numbers">${metric('成本 / 份',fmt(p.entry))}${metric(spot?'最新价':'标记价',fmt(s.assets.find(a=>a.id===p.asset)[spot?'price':'mark']))}${metric('持仓盈亏',fmt(positionPnl(p)),cls(positionPnl(p)))}</div>${spot?'':positionRisk(p)}</article>`;}).join(''):'<div class="empty">暂无持仓<br>普通交易与杠杆合约分别记仓</div>';
 $('fills').innerHTML=s.fills.length?s.fills.slice(0,20).map(f=>`<div class="order-row"><div class="row-line"><b>${s.assets.find(a=>a.id===f.asset).name} · ${label(f)}</b><span>${fmt(f.price)} × ${quantityText(f.qty)}</span></div><small>${f.time?D.time(f.time,true):'旧版成交'} · ${f.product==='spot'?'普通交易':'合约'} · 手续费 ${fmt(f.fee)}</small></div>`).join(''):'<div class="empty">暂无个人成交</div>';
 $('market-fills').innerHTML=(s.marketTrades||[]).filter(f=>f.asset===selected).slice(0,8).map(f=>`<div class="tape-row"><span>${f.time?D.time(f.time,true):'旧版成交'}</span><span class="${f.sign===1?'up':'down'}">${fmt(f.price)}</span><span>${quantityText(f.qty)}</span><span>${f.source==='system'?'系统交易':'玩家成交'}</span></div>`).join('')||'<div class="empty">等待市场成交</div>';renderNews();window.ExchangeTools.render(s);
 renderActivity();
 renderBulletin();
}
function synchronize(notify=false){if(!online||!s)return;pauseStatus();if(view==='ranking'&&Date.now()-lastRankingPoll>60000)refreshRanking();if(notify||Date.now()-lastRemotePoll>10000)refreshRemote(notify).catch(reportError);const seconds=Math.ceil((60000-(Date.now()+serverOffset)%60000)/1000);$('clock').textContent=seconds===60?'01:00':'00:'+String(seconds).padStart(2,'0');}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.homeKind){homeKind=b.dataset.homeKind;renderOverviewMap();return;}if(!online||!s)return;
 if(b.dataset.board){rankingBoard=b.dataset.board;document.querySelectorAll('[data-board]').forEach(x=>x.classList.toggle('active',x===b));refreshRanking();}
 if(b.dataset.marketKind){const next=s.assets.find(a=>(a.kind==='crypto'?'crypto':'stock')===b.dataset.marketKind);if(next)await select(next.id);}if(b.dataset.modeAsset){try{await remoteMutation('marginMode',{asset:b.dataset.modeAsset,mode:b.dataset.mode});toast('保证金模式已切换');}catch(err){reportError(err);}}if(b.dataset.margin){$('margin-asset').value=b.dataset.margin;$('margin-dialog').showModal();}if(b.dataset.go){navigate(b.dataset.go);if(b.id==='condition-back')document.querySelector('.trade-panel').scrollIntoView({block:'center'});if(b.id==='condition-open')window.ExchangeTools.selectAsset(selected);}if(b.dataset.instrument)select(b.dataset.instrument);if(b.dataset.product)switchProduct(b.dataset.product);if(b.dataset.side){intent=b.dataset.side;if(intent==='close'&&holding())$('leverage').value=holding().leverage;tradeControls();}
 if(b.dataset.price){$('order-price').value=Number(b.dataset.price).toFixed(1);estimate();}
 if(b.dataset.period){period=Number(b.dataset.period);document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('active',x===b));renderChart();}
 if(b.id==='scene-effects-toggle'){marketEffectsEnabled=!marketEffectsEnabled;try{localStorage.setItem('gensokyo-market-effects',marketEffectsEnabled?'on':'off');}catch{}renderMarketAtmosphere();}
 if(b.dataset.newsfilter){newsFilter=b.dataset.newsfilter;document.querySelectorAll('[data-newsfilter]').forEach(x=>x.classList.toggle('active',x===b));renderNews();}
 if(b.dataset.newsasset){select(b.dataset.newsasset);navigate('market');}
 if(b.dataset.cancel){try{await remoteMutation('cancel',{id:Number(b.dataset.cancel)});toast('撤单已确认');}catch(err){reportError(err);}}
 if(b.dataset.close){await select(b.dataset.close);if(!s)return;switchProduct(b.dataset.closeproduct);intent=product==='spot'?'sell':'close';const p=holding();if(!p)return;navigate('market');$('order-qty').value=p.qty;$('order-price').value=E.round(asset().price+((p.sign||1)===1?-.5:.5)).toFixed(1);tradeControls();$('order-form').scrollIntoView({block:'center'});}
});
$('order-form').addEventListener('submit',async e=>{e.preventDefault();try{await remoteMutation('order',{asset:selected,intent,price:Number($('order-price').value),qty:orderQuantity(),leverage:product==='spot'?1:Number($('leverage').value),product,...(product==='contract'?{marginMode:$('margin-mode').value}:{})});toast('委托已提交');}catch(err){reportError(err);}});
['order-price','order-qty','leverage','margin-mode'].forEach(id=>$(id).addEventListener('input',()=>{if(s)estimate();}));$('settle-now').onclick=()=>synchronize(true);$('news-link').onclick=()=>navigate('news');$('help-open').onclick=()=>$('help').showModal();$('help-close').onclick=()=>$('help').close();
$('theme-toggle').onclick=()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';applyTheme(theme);if(overviewAssets.length)renderOverviewMap();try{localStorage.setItem('gensokyo-exchange-theme',theme);}catch{}};
$('cancel-all').onclick=async()=>{if(!online||!s)return;try{for(const o of s.orders.filter(o=>!o.liquidation))await remoteMutation('cancel',{id:o.id});toast('撤单已确认');}catch(e){reportError(e);}};
$('asset-picker').onchange=e=>select(e.target.value);$('margin-close').onclick=()=>$('margin-dialog').close();$('margin-form').onsubmit=async e=>{e.preventDefault();try{await remoteMutation('margin',{asset:$('margin-asset').value,amount:Number($('margin-amount').value)});$('margin-dialog').close();toast('保证金已追加');}catch(err){reportError(err);}};
function openHome(){$('connection-status').textContent=Auth.isLoggedIn()?'账户已登录':'市场总览 · 登录后交易';wantsMarket=false;homeVisible=true;$('exchange-home').hidden=false;overviewChart?.resize();$('market-gate').hidden=false;$('exchange-content').hidden=true;$('exchange-nav').hidden=true;$('exchange-session').hidden=true;$('gate-title').textContent=Auth.isLoggedIn()?'欢迎回来，'+(Auth.user()?.username||'交易者'):'你的交易账户';$('gate-status').textContent=Auth.isLoggedIn()?'账户已登录，随时进入市场。':'登录网站账户，进入幻想乡市场。';$('gate-login').hidden=Auth.isLoggedIn();$('gate-register').hidden=Auth.isLoggedIn();$('gate-guest').hidden=Auth.isLoggedIn();$('guest-note').hidden=Auth.isLoggedIn();$('home-enter').hidden=!Auth.isLoggedIn();$('gate-retry').hidden=true;refreshOverview();}
function renderOverviewMap(){
 document.querySelectorAll('[data-home-kind]').forEach(b=>b.classList.toggle('active',b.dataset.homeKind===homeKind));
 const entries=overviewAssets.filter(a=>(a.kind==='crypto'?'crypto':'stock')===homeKind),el=$('sector-map');
 if(!entries.length){if(overviewChart){overviewChart.dispose();overviewChart=null;}el.innerHTML='<div class="empty">暂无该市场行情</div>';return;}
 if(!overviewChart){el.replaceChildren();overviewChart=echarts.init(el,null,{renderer:'canvas'});overviewChart.on('click',params=>{if(!params.data?.assetId)return;selected=params.data.assetId;view='market';enterOnline().catch(reportError);});}
 const data=entries.map(a=>({name:a.name,assetId:a.id,value:Math.max(.05,Math.abs(a.changePct)),change:a.changePct,price:a.price,paused:!!a.pausedUntil&&a.pausedUntil>Date.now(),itemStyle:{color:a.changePct>0?'#b83b39':a.changePct<0?'#237b58':'#666c72'}}));
 overviewChart.setOption({animationDurationUpdate:350,aria:{enabled:true,description:'24小时板块涨跌热力图，红涨绿跌，矩形面积按涨跌幅绝对值分配；接近零的板块保留最小面积。'},tooltip:{confine:true,formatter:p=>`${esc(p.name)}<br>现价 ${fmt(p.data.price)}<br>24小时 ${p.data.change>0?'+':''}${fmt(p.data.change)}%${p.data.paused?'<br>临时停牌':''}`},series:[{type:'treemap',data,left:0,right:0,top:0,bottom:0,roam:false,nodeClick:false,breadcrumb:{show:false},sort:'desc',squareRatio:1.15,visibleMin:0,label:{show:true,color:'#fff',fontSize:14,overflow:'truncate',formatter:p=>`${p.name}\n${p.data.change>0?'+':''}${fmt(p.data.change)}%`},upperLabel:{show:false},itemStyle:{borderWidth:2,borderColor:document.documentElement.dataset.theme==='dark'?'#131516':'#fff',gapWidth:2},emphasis:{itemStyle:{borderColor:'#c7a56b'}}}]},true);overviewChart.resize();
}
async function refreshOverview(){if(overviewBusy)return;overviewBusy=true;try{const data=await ExchangeNetwork.request('overview');$('overview-status').textContent=D.time(data.updatedAt,true)+' · 北京时间';overviewAssets=data.assets;renderOverviewMap();}catch(e){$('overview-status').textContent=window.MMS_TOY_MODE?'行情连接失败：请检查服务器跨域白名单（'+location.origin+'）':'行情暂时无法连接';if(overviewChart){overviewChart.dispose();overviewChart=null;}$('sector-map').innerHTML='<div class="empty">暂时没有可用的板块行情</div>';}finally{overviewBusy=false;}}
$('sector-map').onclick=e=>{const tile=e.target.closest('[data-sector]');if(!tile)return;selected=tile.dataset.sector;view='market';enterOnline().catch(reportError);};
$('quantity-minus').onclick=()=>{if(!s)return;$('order-qty').value=Math.max(100,Math.floor(Number($('order-qty').value)/100)*100-100);estimate();};$('quantity-plus').onclick=()=>{if(!s)return;$('order-qty').value=Math.min(100000,Math.floor(Number($('order-qty').value)/100)*100+100);estimate();};$('home-open').onclick=openHome;$('home-enter').onclick=()=>enterOnline().catch(reportError);
$('site-login').onclick=()=>{if(Auth.isLoggedIn())Auth.logout();else{wantsMarket=true;Auth.openModal('login');}};$('gate-login').onclick=()=>{wantsMarket=true;Auth.openModal('login');};$('gate-register').onclick=()=>{wantsMarket=true;Auth.openModal('register');};$('gate-guest').onclick=async()=>{const b=$('gate-guest');b.disabled=true;wantsMarket=true;try{const res=await Auth.guest();if(!res.ok)throw Error(res.error||'游客登录失败');}catch(e){reportError(e);}finally{b.disabled=false;}};$('gate-retry').onclick=()=>enterOnline().catch(reportError);$('ranking-refresh').onclick=refreshRanking;
window.ExchangeTools.init({state:()=>s,mutate:remoteMutation,error:reportError,toast,selected:()=>selected,select:select,setPeriod:value=>{period=value;document.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',Number(b.dataset.period)===value));if(['market','conditions'].includes(view))renderChart();}});
Auth.onAuth(user=>{$('guest-upgrade').hidden=!user?.is_guest;const token=Auth.token();$('site-login').textContent=user?user.username+(user.is_guest?' · 切换账户':' · 退出'):'网站账户登录';if(!token){sessionToken='';ExchangeNetwork.clearPending();showGate('登录网站账户，进入幻想乡市场。');openHome();return;}if(!wantsMarket){openHome();return;}if((online&&sessionToken===token)||joinToken===token)return;enterOnline().catch(reportError);});
refreshOverview();setInterval(()=>synchronize(),1000);setInterval(refreshOverview,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){synchronize();if(homeVisible)refreshOverview();}});window.addEventListener('resize',()=>{overviewChart?.resize();if(s&&['market','conditions'].includes(view)&&!homeVisible){chart?.resize();renderChart();}});

function phaseLabel(p){return ({p1:'第一阶段 · 雾之湖调查',vote1:'投票 · 护盘目标',p2:'第二阶段 · 护盘战',vote2:'投票 · 决战增益',p3a:'决战 · 破盾',p3c:'决战 · 逼多',resolved:'已结束'})[p]||p;}
function incNumber(n){return Number(n||0).toLocaleString('zh-CN');}
function incBar(v,m){const p=Math.max(0,Math.min(100,m>0?v/m*100:0));return '<div class="inc-bar"><i style="width:'+p+'%"></i></div>';}
function incLeft(deadline){if(!deadline)return '';const ms=deadline-Date.now();if(ms<=0)return '已到时限';const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);return h>0?h+' 小时 '+m+' 分':m+' 分';}
var activityTab='overview',activityVote='';
function phaseStory(inc){if(inc.phase==='resolved')return inc.won?(RS.end&&RS.end.win):(RS.end&&RS.end.fail);const r=RS[inc.phase];if(r&&r.hero)return r.hero;return inc.won===true?'红雾散去，异变被退治。':inc.won===false?'红雾暂时退去，异变没有被彻底解决。':'';}
function incidentNotice(inc){try{const promo=$('event-promo');if(promo&&promo.open)return;const key='mms-incident-notice-'+inc.startedAt+'-'+inc.phase;if(localStorage.getItem(key))return;let dlg=$('incident-notice');if(dlg&&dlg.open)return;if(!dlg){dlg=document.createElement('dialog');dlg.id='incident-notice';document.body.appendChild(dlg);}dlg.innerHTML='<h2>'+phaseLabel(inc.phase)+'</h2><p>'+phaseStory(inc)+'</p><button id="incident-notice-close" class="submit-order">知道了</button>';const btn=$('incident-notice-close');if(btn)btn.onclick=()=>{localStorage.setItem(key,'1');dlg.close();};if(typeof dlg.showModal==='function')dlg.showModal();}catch(e){}}
function phaseTitle(ph){
 return ({p1:'P1 · 调查准备',vote1:'V1 · 战略投票',p2:'P2 · 雾之湖调查',vote2:'V2 · 决战投票',p3a:'P3 · 红魔馆决战',p3c:'P3 · 绯红轧空战',resolved:'事件结束'})[ph]||ph;
}
function phaseOrder(ph){return ({p1:0,vote1:1,p2:2,vote2:3,p3a:4,p3c:4,resolved:5})[ph]??-1;}
function rm(n){return Number(n||0).toLocaleString('zh-CN');}
function rmPct(v,m){return Math.max(0,Math.min(100,m>0?v/m*100:0));}
function rmBar(v,m,green){return '<div class="rm-track"><div class="rm-fill'+(green?' green':'')+'" style="width:'+rmPct(v,m)+'%"></div></div>';}
function rmLeft(deadline){if(!deadline)return '—';const ms=deadline-Date.now();if(ms<=0)return '已到时限';const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);return (h>0?h+' 时 ':'')+m+' 分';}
function rmMission(o){
 return '<article class="rm-card"><div class="rm-card-head"><div class="rm-card-title"><span class="rm-icon">'+o.icon+'</span>'+o.title+'</div><span class="rm-pill">'+(o.state||'进行中')+'</span></div><p>'+o.detail+'</p><div class="rm-progress"><span>'+o.label+'</span><b>'+o.valueText+'</b></div>'+rmBar(o.value,o.goal)+'<div class="rm-card-foot"><span class="rm-hint">全服共同推进</span><button class="rm-btn" data-tab="actions">'+o.action+' →</button></div></article>';
}
function rmBulletin(inc){
 const title={p1:'红雾蔓延，神社宣布紧急募资',vote1:'全服战略会议召开',p2:'雾之湖调查深入，新的做空潮正在形成',vote2:'决战前夜，最后的选择',p3a:'红魔馆主人亲自下场，红魔商事出现异常行情',p3c:'交易所最高级别警报：绯红轧空战',resolved:'红雾异变，正式结束'}[inc.phase]||'战役简报';
 const r=RS[inc.phase];const body=r&&r.report?r.report.map(function(p){return '<p>'+p+'</p>';}).join(''):'<p>'+phaseStory(inc)+'</p>';return '<article class="rm-bulletin"><span class="rm-date">号外 · 世界事件第 001 号</span><h3>'+title+'</h3>'+body+'<div class="rm-source">射命丸文 · 文文。财经资讯</div></article>';
}
function rmOverview(inc){
 const ph=inc.phase;let missions='';
 if(ph==='p1'){
  missions=rmMission({icon:'¥',title:'博丽神社紧急募资',detail:(RS.p1&&RS.p1.missions&&RS.p1.missions.fund)||'全服集资，为灵梦与魔理沙提供调查经费。',label:'募资进度',valueText:rm(inc.raised)+' / '+rm(inc.donateGoal),value:inc.raised,goal:inc.donateGoal,action:'参与募资'})+
   rmMission({icon:'↗',title:'冰湖冷链保卫战',detail:((RS.p1&&RS.p1.missions&&RS.p1.missions.protect)||'')+' 守住 '+inc.defend.floor+' 的地板，累计 '+inc.defend.required+' 分钟，至少 '+inc.defend.defendersRequired+' 个账户净买入。',label:'已守住分钟',valueText:inc.defend.minutes+' / '+inc.defend.required,value:inc.defend.minutes,goal:inc.defend.required,action:'参与护盘'});
 }else if(ph==='vote1'||ph==='vote2'){
  const b=Object.keys(inc.vote.ballots||{}).length;
  missions=rmMission({icon:'◉',title:ph==='vote1'?'选定重点护盘产业':'决定最终支援战略',detail:ph==='vote1'?'每位合格玩家一票，结果决定 P2 的护盘标的。':'每位合格玩家一票，资金多少不影响票权。',label:'已参与投票',valueText:rm(b)+' / '+rm(Math.max(1,inc.participants)),value:b,goal:Math.max(1,inc.participants),action:'前往投票'});
 }else if(ph==='p2'){
  const d=inc.defend;
  missions=rmMission({icon:'↗',title:'重点产业护盘',detail:((RS.p2&&RS.p2.missions&&RS.p2.missions.protect)||'')+' 累计守住 '+d.required+' 分钟并保证足够账户参与。',label:'已守住分钟',valueText:d.minutes+' / '+d.required,value:d.minutes,goal:d.required,action:'查看护盘'})+
   rmMission({icon:'⌖',title:'红雾联合巡逻',detail:((RS.p2&&RS.p2.missions&&RS.p2.missions.patrol)||'')+' 每日最多 8 次，全服累计 1,000 次有效巡逻可削弱最终敌人。',label:'全服有效巡逻',valueText:rm(inc.patrols)+' / 1,000',value:inc.patrols,goal:1000,action:'参与巡逻'});
 }else if(ph==='p3a'){
  missions=rmMission({icon:'✦',title:'Boss 第一战 · 红雾之主',detail:(RS.p3a&&RS.p3a.goal)||'通过捐款与巡逻削减蕾米莉亚的生命值。',label:'已造成伤害',valueText:rm(inc.hpMax-inc.hp)+' / '+rm(inc.hpMax),value:inc.hpMax-inc.hp,goal:inc.hpMax,action:'查看决战'});
 }else if(ph==='p3c'){
  missions=rmMission({icon:'↗',title:'Boss 第二战 · 绯红轧空战',detail:(RS.p3c&&RS.p3c.goal)||'蕾米莉亚的巨额空头压在红魔商事上。全服合力买入，把价格推过目标价，逼她回补。',label:'Boss 空头',valueText:rm(inc.boss.qty)+' / '+rm(inc.boss.total),value:inc.boss.qty,goal:inc.boss.total,action:'查看决战'});
 }
 const pct=ph==='p3c'?('目标价 ≥ '+inc.p3Target+' · 现价 '+(inc.scarletPrice||'—')):'';
 return '<div class="rm-metrics"><div class="rm-metric"><label>全服参与人数</label><strong>'+rm(inc.participants)+'</strong><small>人</small></div><div class="rm-metric"><label>个人活动贡献</label><strong>'+rm(inc.myPoints)+'</strong><small>分</small></div><div class="rm-metric"><label>本阶段剩余</label><strong>'+rmLeft(inc.deadline)+'</strong></div></div>'+
  '<div class="rm-h2">当前战略命令<small>'+(missions? '':'事件已结束')+'</small></div><div class="rm-grid">'+missions+'</div>'+
  (pct?'<div class="rm-target">'+pct+'</div>':'')+
  '<div class="rm-h2">文文。财经战报<small>EVENT BULLETIN</small></div>'+rmBulletin(inc);
}
function rmActions(inc){
 const ph=inc.phase;
 if(ph==='p1'){
  const d=inc.defend,s=inc.short;
  return '<div class="rm-action"><h3>01 / 博丽神社紧急募资</h3><p>捐款支持神社的调查经费。单笔至少 1,000，捐后余额至少保留 10 万。</p><div class="rm-amounts"><button data-amount="1000">1,000</button><button data-amount="10000">10,000</button><button data-amount="50000">50,000</button><button data-amount="100000">100,000</button></div><input id="rm-amount" class="rm-input" type="number" min="1000" step="1000" placeholder="输入金额（本阶段单人上限 '+Math.round(inc.donateCap/10000)+' 万）"><button class="rm-btn primary full" data-act="donate">捐款</button><div class="rm-note">捐款 70% 销毁、30% 进保险池，不给现金奖励。</div></div>'+
   '<div class="rm-action"><h3>02 / 冰湖冷链保卫战</h3><p>守住 '+d.floor+' 的地板，累计 '+d.required+' 分钟；至少 '+d.defendersRequired+' 个账户净买入。异变空头已卖出 '+rm(s.qty)+' / '+rm(s.total)+' 份。</p><div class="rm-progress"><span>已守住</span><b>'+d.minutes+' / '+d.required+' 分钟</b></div>'+rmBar(d.minutes,d.required)+'<div class="rm-note">净买入账户：'+d.defenders+' / '+d.defendersRequired+'。实际净承接活动卖单的分钟才计入时长，挂着不买不会推进。</div><button class="rm-btn primary full" data-act="goto" data-asset="mistlake">查看冰湖冷链行情</button></div>'+ '<div class="rm-action"><h3>03 / 雾之湖调查</h3><p>把沿途的见闻交给调查队。每天最多5次，间隔10分钟；每次获得1活动积分。</p><button class="rm-btn primary full" data-act="investigate">前往调查</button></div>';
 }
 if(ph==='p3a'){
  return '<div class="rm-action"><h3>01 / 决战支援</h3><p>捐款直接削减 Boss 生命值，并计入个人贡献。单笔至少 1,000，捐后余额至少保留 10 万。</p><div class="rm-amounts"><button data-amount="1000">1,000</button><button data-amount="10000">10,000</button><button data-amount="50000">50,000</button><button data-amount="100000">100,000</button></div><input id="rm-amount" class="rm-input" type="number" min="1000" step="1000" placeholder="输入金额（本阶段单人上限 '+Math.round(inc.donateCap/10000)+' 万）"><button class="rm-btn primary full" data-act="donate">捐款</button><div class="rm-note">捐款 70% 销毁、30% 进保险池，不给现金奖励。</div></div>'+
   '<div class="rm-action"><h3>02 / 巡逻与调查</h3><p>巡逻每次 +1,000 伤害并增加全服巡逻计数；调查只在 P1 开放。冷却 10 分钟，每天 8 次巡逻 / 5 次调查。</p><div class="rm-row"><button class="rm-btn" data-act="patrol">执行巡逻</button>'+(ph==='p1'?'<button class="rm-btn" data-act="investigate">执行调查</button>':'')+'</div></div>';
 }
 if(ph==='p2'){
  const d=inc.defend;
  return '<div class="rm-action"><h3>护盘支援募资</h3><p>目标 '+rm(inc.donateGoal)+'，已筹 '+rm(inc.raised)+'。每阶段单人最多40万，捐后可用资金至少10万。</p><input id="rm-amount" class="rm-input" type="number" min="1000" step="1000"><button class="rm-btn primary full" data-act="donate">捐款</button></div>'+  '<div class="rm-action"><h3>01 / 重点产业护盘</h3><p>守住 '+d.floor+' 的地板，累计 '+d.required+' 分钟；至少 '+d.defendersRequired+' 个账户净买入。异变空头已卖出 '+rm(inc.short.qty)+' / '+rm(inc.short.total)+' 份。</p><div class="rm-progress"><span>已守住</span><b>'+d.minutes+' / '+d.required+' 分钟</b></div>'+rmBar(d.minutes,d.required)+'<div class="rm-note">净买入账户：'+d.defenders+' / '+d.defendersRequired+'。实际净承接活动卖单的分钟才计入时长，挂着不买不会推进。</div></div>'+
   '<div class="rm-action"><h3>02 / 联合巡逻</h3><p>每日最多 8 次，全服累计 1,000 次有效巡逻可削弱最终敌人。</p><div class="rm-counter">'+rm(inc.patrols)+' / 1,000</div>'+rmBar(inc.patrols,1000)+'<button class="rm-btn primary full" data-act="patrol">执行一次巡逻</button></div>';
 }
 if(ph==='p3c'){
  const b=inc.boss;
  return '<div class="rm-boss"><div class="rm-eyebrow">FINAL BATTLE / PHASE 02</div><div class="rm-boss-name">蕾米莉亚 · 斯卡蕾特</div><div class="rm-progress"><span>Boss 空头</span><b>'+rm(b.qty)+' / '+rm(b.total)+' 份</b></div>'+rmBar(b.qty,b.total)+'<p class="rm-boss-rule">目标：把红魔商事价格推过 <b>'+inc.p3Target+'</b>，迫使蕾米莉亚回补空头。Boss只按实际成交建立空头，达到目标后按真实买单回补；未成交仍需等待。</p><div class="rm-note">当前红魔商事：'+(inc.scarletPrice||'—')+'</div></div>';
 }
 return '<div class="rm-empty">当前阶段没有可执行的行动。</div>';
}
function rmVote(inc){
 const ph=inc.phase;if(ph!=='vote1'&&ph!=='vote2')return '';
 const names=(RS[ph]&&RS[ph].options)||{hakugyoku:['白玉楼文旅','维护冥界相关产业的正常运转。'],myouren:['命莲物流','保障救助与物资运输相关产业。'],kazami:['花田农业','守护花卉产业。'],limit:['放宽投资限制','只调整活动专用参与额度。'],difficulty:['降低决战难度','降低 Boss 血量或削弱特殊能力。']};
 const pool=inc.vote.candidates||[];
 return '<div class="rm-action"><h3>'+(ph==='vote1'?'选择下一阶段需要优先支援的产业':'决战前夜 · 最终战略决策')+'</h3><p>'+(ph==='vote1'?'投票结果决定 P2 的重点护盘标的，每位合格玩家一票。':'两个选项都有明确取舍，资金多少不影响票权。')+'</p><div class="rm-options">'+pool.map(function(c){const n=names[c]||[c,''];return '<label class="rm-vote"><input type="radio" name="rm-vote" value="'+c+'"'+(activityVote===c?' checked':'')+'><strong>'+n[0]+'</strong><small>'+n[1]+'</small></label>';}).join('')+'</div><button class="rm-btn primary full" data-act="vote">提交投票</button><div class="rm-note">本轮捐款满 1 万才有投票资格，一人一票。</div></div>';
}
function rmArchive(inc){
 const log=(inc.log||[]).slice().reverse().map(function(l){return '<div class="rm-archive-item"><b>'+(l.phase?String(l.phase).toUpperCase()+' · ':'')+'战役记录</b><small>'+l.text+'</small></div>';}).join('');
 const out=[];if(inc.p1Won===true)out.push.apply(out,RS.p1.win||[]);if(inc.p1Won===false)out.push.apply(out,RS.p1.fail||[]);if(inc.p2Won===true)out.push.apply(out,RS.p2.win||[]);if(inc.p2Won===false)out.push.apply(out,RS.p2.fail||[]);if(inc.won===true)out.push(RS.p3a.win,RS.p3c.win,RS.end.win,RS.end.notice);if(inc.won===false)out.push(RS.p3c.fail,RS.end.fail);const outcome=out.filter(Boolean).map(function(p){return '<div class="rm-archive-item"><b>战役结果</b><small>'+p+'</small></div>';}).join('');
 const stages=[['P1','调查准备'],['V1','战略投票'],['P2','雾之湖调查'],['V2','决战投票'],['P3','红魔馆决战']];
 const cur=phaseOrder(inc.phase);
 return '<div class="rm-action"><h3>投票结果</h3><p>护盘产业：'+esc(s.assets.find(a=>a.id===inc.vote1Result)?.name||'尚未公布')+' · 决战支援：'+(inc.gain==='limit'?'放宽限额':inc.gain==='difficulty'?'降低难度':'尚未公布')+'</p></div><div class="rm-h2">异变档案<small>GENSOKYO CHRONICLE</small></div><div class="rm-archive"><div class="rm-archive-item"><b>EVENT 001 · 红雾异变</b><small>'+(inc.won===true?'已退治':inc.won===false?'已结束':'进行中')+' · 战役过程将在这里永久保存</small></div>'+log+outcome+'</div>'+
  '<div class="rm-h2">战役时间线<small>REAL RECORD</small></div><div class="rm-timeline">'+stages.map(function(x,i){return '<div class="rm-timeline-item '+(i===Math.min(cur,4)?'on':i<cur?'done':'')+'"><b>'+x[0]+' · '+x[1]+'</b><small>'+(i===Math.min(cur,4)?'进行中':i<cur?'已完成':'未开始')+'</small></div>';}).join('')+'</div>';
}
function rmPoints(inc){
 const mine=inc.myRank,rows=inc.pointsBoard||[];
 return '<div class="rm-action"><h3>红雾异变 · 活动积分榜</h3><p>'+(inc.rewardsSettled?'最终排名已冻结，前十奖励已发放。':'活动结束后按最终积分给前十发成就与称号；当前排名仍会变化。')+'</p><p>第一名：红雾首席退治者；第二、三名：红雾退治·三杰；第四至十名：红雾退治·十杰。积分相同，先达到当前积分者优先，再按账户编号排序。无现金或交易属性加成。</p><p>捐款每满1万计1分，巡逻每次2分，调查每次1分；每阶段有效净买入每满1万计1分、最多50分，卖出抵消相应交易分。阶段胜利另给20分。分数由服务器计算。</p><strong>'+(mine?'我的排名：'+mine.rank+' · '+mine.points+'分':'暂无积分，参与行动后上榜')+'</strong></div>'+
 '<div class="ranking-table"><div class="ranking-row ranking-head"><span>名次</span><span>玩家</span><span>活动积分</span><span>奖励档位</span></div>'+rows.map(r=>'<div class="ranking-row"><b>'+r.rank+'</b><span>'+esc(r.name)+'</span><strong>'+r.points+'</strong><span>'+(r.rank===1?'首席':r.rank<=3?'三杰':r.rank<=10?'十杰':'—')+'</span></div>').join('')+'</div><div class="rm-action"><h3>我的活动成就</h3>'+((inc.achievements||[]).map(a=>'<p>'+esc(a.title)+' · 第'+a.rank+'名 · '+a.points+'分</p>').join('')||'<p>最终榜单前十的奖励会在活动结束时自动记录。</p>')+'</div>';
}
function renderActivity(){
 const box=$('activity-body');if(!box)return;const inc=s&&s.incident;
 if(!inc){box.innerHTML='<div class="rm-empty">异变尚未开始。</div>';return;}
 incidentNotice(inc);
 const ae=document.activeElement;
 if(ae&&ae.id==='rm-amount'&&ae.closest&&ae.closest('#activity-body'))return;
 const prev=$('rm-amount')?$('rm-amount').value:'';
 const ph=inc.phase;const stages=[['P1','准备'],['V1','投票'],['P2','调查'],['V2','投票'],['P3','决战']];
 const order=phaseOrder(ph);
 const tabs=[['overview','战役总览'],['actions','行动中心'],['points','积分榜'],['archive','异变档案']];
 const body=activityTab==='actions'?rmActions(inc)+rmVote(inc):activityTab==='points'?rmPoints(inc):activityTab==='archive'?rmArchive(inc):rmOverview(inc);
 box.innerHTML='<div class="rm-wrap"><section class="rm-hero"><div class="rm-hero-top"><span class="rm-tag">WORLD EVENT 001</span><span class="rm-live"><i></i>'+(inc.phase==='resolved'?'活动已结算':inc.enabled?'全服事件进行中':'活动暂停中')+'</span></div><h1>红雾异变</h1><p>'+phaseStory(inc)+'</p><div class="rm-hero-meta"><span>当前阶段 <b>'+phaseTitle(ph)+'</b></span><span>阶段剩余 <b>'+rmLeft(inc.deadline)+'</b></span></div></section>'+
  '<nav class="rm-stages">'+stages.map(function(x,i){return '<div class="rm-stage '+(i===Math.min(order,4)?'on':i<order?'done':'')+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></div>';}).join('')+'</nav>'+
  '<div class="rm-tabs">'+tabs.map(function(t){return '<button class="rm-tab '+(activityTab===t[0]?'on':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('')+'</div>'+
  '<div class="rm-tab-body">'+body+'</div></div>';if(!inc.enabled)box.querySelectorAll('[data-act]:not([data-act="goto"])').forEach(b=>b.disabled=true);if(prev){const el=$('rm-amount');if(el)el.value=prev;}
}

function renderBulletin(){
 const box=$('bulletin-body');if(!box)return;
 const inc=s&&s.incident;
 const items=((s&&s.news)||[]).filter(function(n){return n.category==='异变通告'||String(n.id).indexOf('incident-')===0;});
 let h='<div class="rm-wrap"><section class="rm-hero"><div class="rm-hero-top"><span class="rm-tag">EVENT 001</span><span class="rm-live"><i></i>异变通告</span></div><h1>红雾异变</h1><p>'+(inc?phaseStory(inc):'红雾异变的全部通告将在这里归档。')+'</p><div class="rm-hero-meta"><span>当前阶段 <b>'+(inc?phaseTitle(inc.phase):'—')+'</b></span><span>通告 <b>'+items.length+'</b> 条</span></div></section>';
 h+='<div class="rm-tabs"><button class="rm-tab on">异变通告</button><button class="rm-tab" data-go="activity">前往活动 →</button></div>';
 h+='<div class="bl-list">'+(items.length?items.map(function(n){return '<article class="rm-bulletin"><span class="rm-date">'+D.time(n.time||Date.now(),true)+' · 异变通告</span><h3>'+n.title+'</h3><p>'+n.body+'</p></article>';}).join(''):'<div class="rm-empty">还没有异变通告。</div>')+'</div>';
 if(inc&&inc.log&&inc.log.length)h+='<div class="rm-h2">战役记录<small>ARCHIVE</small></div>'+inc.log.slice().reverse().map(function(l){return '<div class="rm-archive-item"><small>'+l.text+'</small></div>';}).join('');
 h+='</div>';box.innerHTML=h;
}
// Called once after each successful entry, never by the background quote poll.
function showEventPromo(){
 if(!s?.incident||s.incident.phase==='resolved')return;
 const inc=s.incident;let dlg=$('event-promo');
 if(!dlg){dlg=document.createElement('dialog');dlg.id='event-promo';dlg.setAttribute('aria-labelledby','promo-title');document.body.appendChild(dlg);}
 let progress='';
 if(['p1','p2'].includes(inc.phase)){
  progress='<p>募资进度 <b>'+rm(inc.raised)+' / '+rm(inc.donateGoal)+'</b></p>';
  if(inc.defend){const d=inc.defend,name=s.assets.find(a=>a.id===d.asset)?.name||d.asset;progress+='<p>护盘标的 <b>'+esc(name)+'</b><br>守住 '+rm(d.minutes)+' / '+rm(d.required)+' 分钟 · 净买入账户 '+rm(d.defenders)+' / '+rm(d.defendersRequired)+'</p>';}
 }else if(['vote1','vote2'].includes(inc.phase)){progress='<p>已投票 <b>'+rm(Object.keys(inc.vote?.ballots||{}).length)+'</b> 人，进入活动页参与本轮投票。</p>';}
 else if(inc.phase==='p3a'){progress='<p>Boss剩余护盾 <b>'+rm(inc.hp)+' / '+rm(inc.hpMax)+'</b></p>';}
 else if(inc.phase==='p3c'){progress='<p>目标标记价 <b>'+rm(inc.p3Target)+'</b><br>Boss剩余空头 '+rm(inc.boss?.qty)+'份'+(inc.boss?.settling?' · 正在回补结算':'')+'</p>';}
 dlg.innerHTML='<div class="promo-tag">活动进度 · '+esc(phaseLabel(inc.phase))+'</div><h2 id="promo-title">红雾异变</h2><p>'+esc(phaseStory(inc))+'</p><div class="promo-progress">'+progress+'</div><p class="promo-sub">'+(inc.enabled?'本阶段剩余 '+rmLeft(inc.deadline):'活动暂时暂停，进度保留')+' · 我的积分 '+rm(inc.myPoints)+'</p><div class="promo-actions"><button id="promo-go">查看活动</button><button id="promo-later">进入市场</button></div>';
 $('promo-go').onclick=()=>{dlg.close();navigate('activity');};$('promo-later').onclick=()=>dlg.close();
 if(!dlg.open)dlg.showModal();
}

function showActionStory(action,feedback,phase){
 const f=feedback||{},stories=RS.actions||{};let story;
 if(action==='donate')story=stories.donate?.[f.phase||phase];
 else{const scenes=stories[action]||[];story=scenes[((f.count||1)-1)%Math.max(1,scenes.length)];}
 story ||= {title:'支援行动已完成',place:'红雾异变',speaker:'博丽神社',line:'你的支援已经收到。',after:'最新进度已记入活动。'};
 let dlg=$('event-action-dialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='event-action-dialog';dlg.setAttribute('aria-labelledby','event-action-title');document.body.appendChild(dlg);}
 const phaseNotice=$('incident-notice');if(phaseNotice?.open)phaseNotice.close();
 const metrics=[];if(f.amount!=null)metrics.push(['本次捐款',fmt(f.amount)+' 游戏币']);if(f.insuranceContribution!=null)metrics.push(['保险支援',fmt(f.insuranceContribution)+' 游戏币']);if(f.points!=null)metrics.push(['行动积分','+'+rm(f.points)]);if(f.damage>0)metrics.push(['实际护盾削减',rm(f.damage)]);if(f.patrols!=null)metrics.push(['全服巡逻',rm(f.patrols)+' 次']);if(f.remaining!=null)metrics.push(['今日剩余',rm(f.remaining)+' 次']);
 dlg.innerHTML='<div class="story-place">'+esc(story.place)+'</div><h2 id="event-action-title">'+esc(story.title)+'</h2><blockquote class="story-voice"><b>'+esc(story.speaker)+'</b><p>“'+esc(story.line)+'”</p></blockquote><p class="story-after">'+esc(story.after)+'</p>'+(metrics.length?'<dl class="story-results">'+metrics.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>':'<p>行动成功，最新成果可在战役总览中查看。</p>')+(f.nextAt?'<p class="story-next">下次'+(action==='patrol'?'巡逻':'调查')+'可在北京时间 '+D.time(f.nextAt)+' 后出发。</p>':'')+'<button id="event-action-close" type="button" class="submit-order">返回战役</button>';
 dlg.onclose=()=>{if(s?.incident&&!homeVisible)incidentNotice(s.incident);};$('event-action-close').onclick=()=>dlg.close();if(!dlg.open)dlg.showModal();
}
let incidentActionBusy=false;
async function incidentAction(btn){
 if(incidentActionBusy)return;const act=btn.dataset.act,phase=s?.incident?.phase;
 incidentActionBusy=true;btn.disabled=true;
 try{
  if(act==='donate'){const amount=Number($('rm-amount')?.value);if(!amount)return toast('请输入金额');const result=await remoteMutation('support',{amount});showActionStory('donate',result.support?.feedback,phase);}
  else if(act==='vote'){const opt=activityVote||(btn.dataset.option||'');if(!opt)return toast('请先选择一个选项');await remoteMutation('vote',{option:opt});toast('投票成功');}
  else if(act==='patrol'){const result=await remoteMutation('patrol',{});showActionStory('patrol',result.patrol?.feedback,phase);}
  else if(act==='investigate'){const result=await remoteMutation('investigate',{});showActionStory('investigate',result.investigate?.feedback,phase);}
  else if(act==='goto'){await select(btn.dataset.asset);navigate('market');}
 }catch(e){reportError(e);}finally{incidentActionBusy=false;btn.disabled=false;}
}

document.addEventListener('click',function(e){
 const tab=e.target.closest('[data-tab]');
 if(tab){activityTab=tab.dataset.tab;renderActivity();return;}
 const amt=e.target.closest('[data-amount]');
 if(amt){const el=$('rm-amount');if(el)el.value=amt.dataset.amount;return;}
 const btn=e.target.closest('[data-act]');
 if(btn)incidentAction(btn);
});
document.addEventListener('change',function(e){if(e.target.name==='rm-vote')activityVote=e.target.value;});

})();