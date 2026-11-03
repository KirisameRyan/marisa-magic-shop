/* Shared website identity, never accepts client-computed balances or rankings. */
(()=>{'use strict';let pending=null;
async function request(route,{body,etag}={}){const headers={'Content-Type':'application/json'},token=window.Auth?.token();if(token)headers.Authorization='Bearer '+token;if(etag)headers['If-None-Match']=etag;let mutation;
 if(body){const signature=JSON.stringify([token,route,body]);if(pending&&pending.signature!==signature)throw Error('上一操作结果未确认，请先重试原操作');mutation=pending||{signature,key:crypto.randomUUID()};pending=mutation;headers['Idempotency-Key']=mutation.key;}
 const [action,query='']=route.split('?'),url=new URL('api/exchange.php',window.API_BASE?new URL(window.API_BASE,document.baseURI):document.baseURI);url.searchParams.set('route',action);for(const [k,v] of new URLSearchParams(query))url.searchParams.set(k,v);
 let response;try{response=await fetch(url,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});}catch(e){if(window.MMS_TOY_MODE)throw Error('无法连接交易服务器，请作者检查HTTPS及Toy跨域白名单。当前页面来源：'+location.origin);throw Error(body?'网络中断，操作结果未确认；请重试原操作，系统会避免重复提交':'暂时无法连接交易所，请稍后重试');}
 if(response.status===304)return {unchanged:true};let data;try{data=await response.json();}catch(e){if(body&&response.status>=400&&response.status<500)pending=null;throw Object.assign(Error(response.status===404?'交易接口暂不可用，请联系管理员':'交易服务返回异常，请稍后重试'),{status:response.status});}if(body&&data.code!=='EXCHANGE_UNAVAILABLE')pending=null;if(!response.ok||!data.ok)throw Object.assign(Error(data.error||'交易操作失败'),{status:response.status,code:data.code});return {...data,etag:response.headers.get('ETag')};}
window.ExchangeNetwork={request,clearPending:()=>{pending=null;}};
})();
