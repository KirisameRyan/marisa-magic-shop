/* Toy authorization + per-user cloud save; OpenID is never used as a server login proof. */
(()=>{'use strict';
const KEY='gensokyo_exchange_account_v1';let busy=false,pending=null,profile=null;
const message=t=>{document.getElementById('toy-status').textContent=t;};
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
async function cloud(call){for(let i=0;i<3;i++){try{return await call();}catch(e){if(e?.code!==307044||i===2)throw e;message('平台请求较多，稍后自动重试…');await wait(1000*2**i);}}}
async function enter(){if(busy)return;busy=true;const b=document.getElementById('toy-enter');b.disabled=true;
 try{
  if(!window.toy?.getUserProfile||!window.toy?.getCloudStorage||!window.toy?.setCloudStorage)throw Error('请在B站Toy页面内打开，此处无法使用B站授权。');
  message('等待B站授权…');profile=await toy.getUserProfile();
  // Nickname is display metadata; never upload OpenID or use nickname as login proof.
  document.getElementById('toy-profile-name').textContent=profile.nickname||'B站玩家';
  const avatar=document.getElementById('toy-profile-avatar');try{const u=new URL(profile.avatar);if(u.protocol==='https:'&&(u.hostname==='hdslb.com'||u.hostname.endsWith('.hdslb.com'))){avatar.src=u.href;avatar.hidden=false;}}catch{}
  message('正在恢复游戏账户…');const saved=await cloud(()=>toy.getCloudStorage([KEY]));let credential;
  if(saved[KEY]){try{const value=JSON.parse(saved[KEY]);if(value.version!==1||!/^([a-f0-9]{64})$/.test(value.credential))throw Error();credential=value.credential;}catch{throw Error('游戏云存档格式异常，已停止创建新账户，请联系作者。');}}
  const body=new FormData();body.append('action','login');body.append('nickname',profile.nickname||'B站玩家');if(credential)body.append('credential',credential);
  let result=credential?null:pending;if(!result){const r=await fetch(new URL('api/toy.php',window.API_BASE),{method:'POST',body,credentials:'omit'});result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'游戏账户连接失败');pending=result;}
  if(!credential){message('正在保存游戏账户…');await cloud(()=>toy.setCloudStorage({[KEY]:JSON.stringify({version:1,credential:result.credential})}));}
  Auth.toySetSession(result.token,result.user);pending=null;message('已使用B站授权，游戏账户已保存。');document.getElementById('home-enter').click();
 }catch(e){message(e?.code===307044?'平台繁忙，请稍后重试。':e instanceof TypeError?'无法连接交易服务器，请作者检查HTTPS及Toy跨域白名单。当前页面来源：'+location.origin:e?.message||'未完成B站授权，请重试。');}
 finally{busy=false;b.disabled=false;}
}
const gate=document.getElementById('market-gate'),box=document.createElement('div');box.className='toy-account';box.innerHTML='<div class="toy-profile"><img id="toy-profile-avatar" hidden alt="B站头像" width="32" height="32"><strong id="toy-profile-name">使用B站账户游玩</strong></div><button type="button" id="toy-enter">B站一键进入</button><p id="toy-status" role="status">首次授权后自动保存游戏账户，下次使用同一B站账户恢复。</p>';gate.insertBefore(box,gate.querySelector('.gate-actions'));document.getElementById('toy-enter').onclick=enter;
const back=document.getElementById('toy-home-back');if(back)back.onclick=()=>document.getElementById('home-open').click();
Auth.onAuth(user=>{document.getElementById('toy-enter').hidden=!!user;});
})();
