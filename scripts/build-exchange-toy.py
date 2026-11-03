"""Build the exchange as a frontend-only, subpath-safe Toy ZIP. No upload occurs."""
import argparse,json,re,hashlib,zipfile
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
ASSETS=['css/gensokyo-exchange.css','css/gensokyo-auth.css','js/gensokyo-engine.js','js/gensokyo-market-data.js','js/gensokyo-exchange.js','js/gensokyo-tools.js','js/gensokyo-network.js','js/auth.js','js/echarts.min.js','css/vendor/fontawesome/css/all.min.css','css/vendor/fontawesome/LICENSE.txt']+['css/vendor/fontawesome/webfonts/'+n+'.woff2' for n in ['fa-solid-900','fa-regular-400','fa-brands-400','fa-v4compatibility']]
def build(api='https://www.azureflame.cloud/',output=None):
    u=urlparse(api)
    if u.scheme!='https' and not(u.scheme=='http' and u.hostname in ['127.0.0.1','localhost']):raise ValueError('API must use HTTPS (loopback HTTP is allowed for local tests)')
    if u.username or u.password or u.query or u.fragment:raise ValueError('API URL must contain no credentials, query or fragment')
    if not api.endswith('/'):api+='/'
    out=Path(output) if output else ROOT/'dist/toy'/('gensokyo-exchange-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    if out.exists():raise ValueError('Output already exists; choose a new output directory')
    app=out/'app';app.mkdir(parents=True)
    config=(ROOT/'packages/toy/src/gensokyo_exchange/toy-config.js').read_text(encoding='utf-8-sig')
    config=re.sub(r"window.API_BASE = '[^']*';",'window.API_BASE = '+json.dumps(api)+';',config)
    (app/'toy-config.js').write_text(config,encoding='utf-8')
    (app/'toy-entry.js').write_text((ROOT/'packages/toy/src/gensokyo_exchange/toy-entry.js').read_text(encoding='utf-8-sig'),encoding='utf-8')
    html=(ROOT/'gensokyo_exchange.html').read_text(encoding='utf-8-sig')
    html=html.replace('<script src="js/api-config.js" defer></script>','<script src="toy-config.js" defer></script>')
    html=html.replace('href="games.html"','href="'+api+'gensokyo_exchange.html" target="_blank" rel="noopener noreferrer"').replace('aria-label="返回游戏室"','aria-label="打开网页版交易所"')
    html=html.replace('游客身份保存在本浏览器，刷新不丢失；可升级正式账户，避免清理浏览器后无法找回。','Toy版通过B站授权并使用私有云存档恢复游戏账户。')
    html=html.replace('<body','<body class="toy-entry"',1)
    html=html.replace('<script src="toy-config.js"','<script src="https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js" defer></script><script src="toy-config.js"')
    html=html.replace('<script src="js/gensokyo-tools.js','<script src="toy-entry.js" defer></script><script src="js/gensokyo-tools.js')
    html=html.replace('<title>幻想乡交易所 · 霧雨魔法店</title>','<title>幻想乡交易所 · Toy版</title>')
    html=html.replace('<div class="gate-actions">','<p class="insurance-status">Toy版与网页版共用市场和排行榜；B站授权后免注册游玩。</p><div class="gate-actions">')
    html=html.replace('登录网站账户，进入幻想乡市场。','通过B站授权进入幻想乡市场。')
    html=html.replace('十二大产业 · 全天交易','十二大产业 · 全天交易 · Toy版')
    (app/'index.html').write_text(html,encoding='utf-8')
    for name in ASSETS:
        source=ROOT/name
        if source.is_symlink():raise ValueError('Symlink asset rejected')
        data=source.read_text(encoding='utf-8-sig') if source.suffix in ['.js','.css'] else None
        if name=='css/vendor/fontawesome/css/all.min.css':
            data=re.sub(r',url\([^)]*\.ttf\) format\("truetype"\)','',data)
        if name=='js/auth.js':
            data=data.replace('    isLoggedIn: isLoggedIn,','    toySetSession: setSession,\n    isLoggedIn: isLoggedIn,')
            data=data.replace("  var TOKEN_KEY =", "  var toyMemory = new Map();\n  var toySession = {getItem:k=>toyMemory.get(k)||null,setItem:(k,v)=>toyMemory.set(k,String(v)),removeItem:k=>toyMemory.delete(k)};\n  var TOKEN_KEY =").replace('localStorage','toySession').replace('api/auth.php','api/toy.php')
        if name=='js/gensokyo-exchange.js':
            data=data.replace("Auth.openModal('login')","document.getElementById('toy-enter').click()").replace('网站账户登录','B站授权进入').replace('登录网站账户，进入幻想乡市场。','通过B站授权进入幻想乡市场。')
        if name=='js/gensokyo-tools.js':
            data=data.replace("function guide(){wizard=false;", "function guide(){wizard=false;")
            data=data.replace('<b>游客账户</b>是真实保存在游戏服务器里的随机账户，名字是“游客＋六位数字”，不与现有名字重复。','<b>Toy版账户提示：</b>点击B站一键进入，经平台授权后读取你在当前Toy的私有云存档，恢复同一个游戏账户。首次使用会自动创建。凭证保存在Toy私有存档，资金与条件单保存在游戏服务器；授权失败或存档读取失败不会覆盖旧存档。存档凭证一年未使用会过期，请保留同一B站账户与Toy云存档。<br><br><b>下文浏览器长期保存说明适用于网页版：</b><br><b>游客账户</b>是真实保存在游戏服务器里的随机账户，名字是“游客＋六位数字”，不与现有名字重复。')
            data=data.replace('游客刷新不会丢，但建议升级为正式账户，避免浏览器凭证丢失。','Toy版刷新后点B站一键进入，可从私有云存档恢复账户；资金和条件单保存在服务器。')
        if name=='css/gensokyo-exchange.css':
            data+='\n.toy-entry #gate-guest,.toy-entry #gate-register,.toy-entry #gate-login,.toy-entry #guest-note{display:none!important}.toy-account{margin:16px 0}.toy-profile{display:flex;align-items:center;gap:10px;margin-bottom:14px}.toy-profile img{border-radius:50%}.toy-account>button{padding:12px 20px;border-radius:5px;color:#fff;background:#d8443f}.toy-account p{font-size:12px;line-height:1.8;margin-top:12px;color:var(--muted)}\n'
        target=app/name;target.parent.mkdir(parents=True,exist_ok=True)
        if data is None:target.write_bytes(source.read_bytes())
        else:target.write_text(data,encoding='utf-8')
    manifest={p.relative_to(app).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in app.rglob('*') if p.is_file()}
    (out/'manifest.json').write_text(json.dumps({'kind':'toy-frontend-only','api':api,'files':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
    archive=out/'gensokyo-exchange-toy.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for name in sorted(manifest):z.write(app/name,name)
    print(json.dumps({'directory':str(app),'zip':str(archive),'files':len(manifest),'bytes':archive.stat().st_size,'api':api},ensure_ascii=False))
    return out
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--api',default='https://www.azureflame.cloud/');p.add_argument('--output');a=p.parse_args();build(a.api,a.output)
