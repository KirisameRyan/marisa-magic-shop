// Offline administrator recovery. Never invoked by the market scheduler.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{backup}=require('./backup-exchange.cjs');
const KEY='maker-recovery-20261104';
function privateDirectory(envFile='/etc/mms-exchange.env'){
 if(process.env.MMS_PRIVATE_DIR)return process.env.MMS_PRIVATE_DIR;
 const match=fs.readFileSync(envFile,'utf8').match(/^\s*MMS_PRIVATE_DIR\s*=\s*(.+?)\s*$/m);
 if(!match)throw Error('未找到 MMS_PRIVATE_DIR');return match[1].replace(/^["']|["']$/g,'');
}
function repair({privateDir,apply=false,backupRoot,now=Date.now()}={}){
 const file=path.join(privateDir,'exchange.db');if(!fs.existsSync(file))throw Error('未找到现有 exchange.db');
 const db=new DatabaseSync(file,{readOnly:!apply});let inTransaction=false;
 function read(){const s=JSON.parse(db.prepare('SELECT json FROM state WHERE id=1').get().json);if(!Number.isFinite(s.system?.cash)||!Number.isFinite(s.flow?.cash))throw Error('做市资金格式异常，停止修改');return s;}
 function stopped(){const lease=db.prepare('SELECT until_ms FROM lease WHERE id=1').get();if(lease&&lease.until_ms>now)throw Error('交易服务仍在运行或租约尚未释放，请先 systemctl stop mms-exchange，等待15秒后再试');}
 const event='admin-'+KEY;
 try{
  const s=read(),before={maker:s.system.cash,flow:s.flow.cash},after={maker:Math.max(before.maker,10000000),flow:Math.max(before.flow,1000000)},added={maker:Math.round((after.maker-before.maker)*100)/100,flow:Math.round((after.flow-before.flow)*100)/100};
  if(db.prepare('SELECT event_id FROM ledger WHERE event_id=?').get(event))return {ok:true,alreadyApplied:true,current:before};
  if(!apply)return {ok:true,dryRun:true,before,after,added};
  stopped();const destination=backup(privateDir,backupRoot);
  db.exec('BEGIN IMMEDIATE');inTransaction=true;stopped();const current=read();
  if(current.system.cash!==before.maker||current.flow.cash!==before.flow)throw Error('资金已发生变化，停止修改，请重新检查');
  if(db.prepare('SELECT event_id FROM ledger WHERE event_id=?').get(event))throw Error('修复已被其他进程执行');
  current.system.cash=after.maker;current.flow.cash=after.flow;current.revision=(current.revision||0)+1;
  const record={event,userId:0,time:now,kind:'administrator-liquidity-capital',cashDelta:0,before,after,added,backup:destination};
  current.liquidityRecovery={id:KEY,time:now,before,after,added};
  db.prepare('INSERT INTO ledger VALUES(?,?,?,?)').run(event,0,now,JSON.stringify(record));
  db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(current));db.exec('COMMIT');inTransaction=false;
  return {ok:true,applied:true,before,after,added,backup:destination};
 }catch(e){if(inTransaction)db.exec('ROLLBACK');throw e;}finally{db.close();}
}
if(require.main===module){try{const args=process.argv.slice(2);if(args.some(x=>!['--apply'].includes(x)))throw Error('用法：node scripts/repair-exchange-liquidity.cjs [--apply]');console.log(JSON.stringify(repair({privateDir:privateDirectory(),apply:args.includes('--apply')}),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={repair,privateDirectory};
