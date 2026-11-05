/* Shared release copy: the website and Toy use the same clock and announcement. */
(function(root){'use strict';
 const START_AT=Date.parse('2026-11-05T12:00:00+08:00');
 function notice(now,release){
  const r=release||{},at=Number.isFinite(r.startsAt)&&r.startsAt>0?r.startsAt:START_AT,before=now<at;
  const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(at);
  const state=before?'更新预告':!r.known?'实际活动状态待连接服务器确认':r.phase==='resolved'?'本轮活动已结束':r.active?'红雾异变进行中':r.phase?'活动已暂停，已有进度保留':'活动尚未启动';
  return {id:'red-mist-20261105',startsAt:at,state,title:before?'红雾异变 · '+time+'更新预告':'11月5日更新 · 红雾异变',paragraphs:[
   before?'计划于北京时间 '+time+' 开放全服活动。提前部署后，活动将在服务器设定的时间启动。':'今日活动更新内容如下，实际开放状态以服务器为准。',
   '全服战役：神社募资 → 战略投票 → 产业护盘与湖畔巡逻 → 决战支援投票 → 红魔馆决战。',
   '玩家主导攻防：活动卖单进入盘口，普通NPC不与活动空头互成交；普通系统报价退让约1%，每侧每分钟最多辅助100份。护盘时长按实际净承接活动卖单计算。',
   '捐款、巡逻、调查可获得活动积分，并触发角色短剧情与成果反馈。活动结束后冻结积分榜，前十发放成就和限定称号，不提供交易属性加成。',
   '活动行情增加红魔馆、雾之湖和联合护盘氛围，动效可暂停。活动停牌和熔断期间显示停牌印章及原因。',
   '活动期间红魔商事先停牌，后续冰湖冷链进入调查停牌；请留意活动公告。逐仓、全仓与高杠杆仓位仍有强平风险。',
   '本次更新保留现有账户、持仓和历史行情。网页版与Toy版继续共用市场及排行榜。'
  ]};
 }
 const api={START_AT,notice};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GensokyoRelease=api;
})(typeof window==='undefined'?globalThis:window);
