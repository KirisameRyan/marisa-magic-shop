'use strict';
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=fs.realpathSync(path.join(__dirname,'..'));
function inside(parent,child){const rel=path.relative(parent,child);return rel===''||!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
function backup(privateDir=process.env.MMS_PRIVATE_DIR||path.join(root,'var/private'),destination=path.join(os.homedir(),'mms-exchange-backups')){
 for(const name of ['exchange.db','site.db'])if(!fs.existsSync(path.join(privateDir,name)))throw Error('未找到现有 '+name+'；请传入正确的网站私有数据目录');
 fs.mkdirSync(destination,{recursive:true,mode:0o700});const parent=fs.realpathSync(destination);if(inside(root,parent))throw Error('备份必须放在网站代码目录之外');
 const out=path.join(parent,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));fs.mkdirSync(out,{mode:0o700});
 for(const name of ['exchange.db','site.db']){const db=new DatabaseSync(path.join(privateDir,name),{readOnly:true});try{db.exec('PRAGMA busy_timeout=5000');db.prepare('VACUUM INTO ?').run(path.join(out,name));}finally{db.close();}const copy=new DatabaseSync(path.join(out,name),{readOnly:true});try{if(copy.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error(name+' 备份校验失败');}finally{copy.close();}fs.chmodSync(path.join(out,name),0o600);}
 fs.writeFileSync(path.join(out,'complete.json'),JSON.stringify({ok:true,files:['exchange.db','site.db'],createdAt:new Date().toISOString()})+'\n',{mode:0o600});return out;
}
if(require.main===module){try{console.log('备份完成：'+backup(process.argv[2],process.argv[3]));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={backup};
