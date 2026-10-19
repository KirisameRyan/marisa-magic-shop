"""Create deployable artifacts from a positive file policy, never copy a checkout."""
import argparse,hashlib,importlib.util,json,shutil,zipfile
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
policy=module('public_files','public-files.py');scanner=module('security_scan','security-scan.py')
def selected_files():return sorted(set(policy.public_paths()))
def manifest(paths):
    files={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    version=hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()[:16]
    return {'version':version,'generated':datetime.now(timezone.utc).isoformat(),'files':files}
def check(paths):
    for path in paths:
        if path.suffix in scanner.TEXT_EXT:
            findings=scanner.scan_text(path.read_text(encoding='utf-8',errors='replace'),path.relative_to(ROOT).as_posix())
            if findings:raise RuntimeError('Credential-like content in '+findings[0]['file']+'; build stopped, values hidden')
def main():
    parser=argparse.ArgumentParser();parser.add_argument('target',choices=['manifest','web','android','toy']);parser.add_argument('--include-api',action='store_true');parser.add_argument('--game',choices=['baka','marisa_survivor','tuoluo']);args=parser.parse_args()
    if args.target=='toy' and not args.game:parser.error('toy requires --game')
    paths=selected_files();check(paths);meta=manifest(paths)
    if args.target=='manifest':
        (ROOT/'version.json').write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8');print(f'Manifest: {len(paths)} public files');return
    from time import time_ns
    folder=meta['version']+'-'+(args.game+'-' if args.game else '')+str(time_ns())
    dest=ROOT/'dist'/args.target/folder;dest.mkdir(parents=True,exist_ok=False)
    if args.target=='web':
        for path in paths:
            rel=path.relative_to(ROOT);target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
        shutil.copy2(ROOT/'.htaccess',dest/'.htaccess')
        (dest/'version.json').write_text(json.dumps(meta,separators=(',',':'))+'\n',encoding='utf-8')
        if args.include_api:
            for path in (ROOT/'api').glob('*.php'):
                if path.name in {'mail-config.php','bot.php','bot_token.php'} or '.local.' in path.name or '.example.' in path.name:continue
                if scanner.scan_text(path.read_text(encoding='utf-8'),path.relative_to(ROOT).as_posix()):raise RuntimeError('Server credential scan failed')
                (dest/'api').mkdir(exist_ok=True);shutil.copy2(path,dest/'api'/path.name)
    elif args.target=='android':
        archive=dest/'www.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
            for path in paths:z.write(path,path.relative_to(ROOT).as_posix())
            z.writestr('version.json',json.dumps(meta,separators=(',',':')))
        assets=ROOT/'apps/android/app/src/main/assets';assets.mkdir(parents=True,exist_ok=True);shutil.copy2(archive,assets/'www.zip')
    else:
        config=json.loads((ROOT/'packages/toy/targets.json').read_text(encoding='utf-8'))[args.game]
        source=(ROOT/config['source']).resolve()
        if not source.is_relative_to(ROOT/'packages/toy/src'):raise RuntimeError('Invalid Toy source path')
        own=[p for p in source.rglob('*') if p.is_file()]
        shared=[]
        for name in config['assets']:
            path=(ROOT/name).resolve()
            if not path.is_relative_to(ROOT) or not policy.public_file(name) or not path.is_file():raise RuntimeError('Missing or non-public Toy asset: '+name)
            shared.append(path)
        check(own+shared)
        with zipfile.ZipFile(dest/(args.game+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
            for path in own:z.write(path,path.relative_to(source).as_posix())
            for path in shared:z.write(path,path.relative_to(ROOT).as_posix())
    (dest/'release.json').write_text(json.dumps({'target':args.target,'version':meta['version'],'publicFileCount':len(paths),'apiIncluded':args.include_api},indent=2)+'\n',encoding='utf-8')
    print('Release created: '+str(dest))
if __name__=='__main__':main()
