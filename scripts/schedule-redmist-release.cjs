'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {backup}=require('./backup-exchange.cjs');
const DEFAULT_AT='2026-11-05T12:00:00+08:00';
function readValue(text,key){const m=text.match(new RegExp('^\\s*'+key+'\\s*=\\s*(.+?)\\s*$','m'));return m?m[1].replace(/^["']|["']$/g,''):'';}
function schedule({envFile='/etc/mms-exchange.env',at=DEFAULT_AT,apply=false,backupRoot,now=Date.now()}={}){
 if(!/(?:Z|[+-]\d{2}:\d{2})$/i.test(at)||!Number.isFinite(Date.parse(at)))throw Error('启动时间必须包含时区，例如 '+DEFAULT_AT);
 envFile=path.resolve(envFile);if(fs.lstatSync(envFile).isSymbolicLink())throw Error('环境文件是符号链接，请使用实际文件路径');
 const original=fs.readFileSync(envFile,'utf8'),privateDir=readValue(original,'MMS_PRIVATE_DIR');
 if(!privateDir||!path.isAbsolute(privateDir))throw Error('环境文件必须配置绝对路径 MMS_PRIVATE_DIR');
 const file=path.join(privateDir,'exchange.db');if(!fs.existsSync(file))throw Error('未找到线上现有 exchange.db，停止配置');
 const db=new DatabaseSync(file,{readOnly:true});let state;try{const row=db.prepare('SELECT json FROM state WHERE id=1').get();if(!row)throw Error('未找到现有市场状态');state=JSON.parse(row.json);}finally{db.close();}
 if(state.halted)throw Error('当前市场处于维护暂停，请先检查服务状态，不能把更新当作自动恢复');
 if(state.incident?.phase==='resolved')throw Error('已有已结束活动，本脚本不会重置或重开，请先检查活动实例');
 const settings={MMS_INCIDENT:'1',MMS_INCIDENT_FAST:'0',MMS_INCIDENT_START_AT:at};
 const result={ok:true,dryRun:!apply,startsAt:at,settings,existingIncident:state.incident?{phase:state.incident.phase,startedAt:state.incident.startedAt}:null,late:now>=Date.parse(at),note:state.incident?'已有活动进度保留，到点仅恢复；不会重置账户或活动。':'提前部署后保持普通市场，到点启动P1。'};
 if(!apply)return result;
 const destination=backup(privateDir,backupRoot);fs.writeFileSync(path.join(destination,'mms-exchange.env.before-release'),original,{mode:0o600});
 const next=original.split(/\r?\n/).filter(line=>!/^\s*(MMS_INCIDENT|MMS_INCIDENT_FAST|MMS_INCIDENT_START_AT)\s*=/.test(line)).join('\n').trimEnd()+'\n'+Object.entries(settings).map(([k,v])=>k+'='+v).join('\n')+'\n';
 const temporary=envFile+'.redmist-'+crypto.randomBytes(5).toString('hex');try{fs.writeFileSync(temporary,next,{mode:0o600,flag:'wx'});if(process.platform!=='win32'){const st=fs.statSync(envFile);fs.chownSync(temporary,st.uid,st.gid);}fs.renameSync(temporary,envFile);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return {...result,dryRun:false,backup:destination,restartRequired:true};
}
if(require.main===module){try{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){const a=args[i];if(a==='--apply')options.apply=true;else if(['--env','--at','--backup'].includes(a)){const value=args[++i];if(!value)throw Error('缺少 '+a+' 参数');options[a==='--env'?'envFile':a==='--at'?'at':'backupRoot']=value;}else throw Error('用法：node scripts/schedule-redmist-release.cjs [--apply] [--env /etc/mms-exchange.env] [--at '+DEFAULT_AT+'] [--backup /站外备份目录]');}console.log(JSON.stringify(schedule(options),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={schedule,DEFAULT_AT};
