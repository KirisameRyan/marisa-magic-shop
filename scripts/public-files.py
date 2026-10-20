"""Positive publication policy shared by preview, manifest and release targets."""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
ASSET_EXT = {'.css','.js','.mjs','.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.woff','.woff2','.ttf','.otf','.mp3','.ogg','.wav','.mp4','.webm','.wasm','.data','.unityweb','.br','.gz','.json'}
DATA_FILES = {
    'data/waifu-db-zh.js','data/waifu-db-zh.json','data/waifu-tags.json',
    'data/waifu-db-male-zh.js','data/waifu-db-male-zh.json',
    'data/waifu-db-all-zh.js','data/waifu-db-all-zh.json',
    'data/waifu-tags-v2.json','data/heartprint-db.js',
}
library=json.loads((ROOT/'js/catalog.js').read_text(encoding='utf-8').split('window.MMS_LIBRARY = ',1)[1].split(';\nwindow.MMS_CATALOG',1)[0])
ROOT_PAGES={item['href'] for item in library['items'] if '/' not in item['href']} | {
    'index.html','games.html','tests.html','stories.html','tools.html','explore.html',
    '404.html','mine.html','leaderboard.html','collect.html','feedback.html','reset.html','polo_pick.html','human-star.html','quiz-drowning.html'
}
def public_file(name):
    path=Path(name);parts=path.parts
    if not parts or path.is_absolute() or '..' in parts or any(p.startswith('.') for p in parts):return False
    rel=path.as_posix()
    if len(parts)==1 and path.suffix=='.html':return path.name in ROOT_PAGES
    if rel in DATA_FILES or rel in {'version.json','nav.js'}:return True
    if rel=='css/vendor/fontawesome/LICENSE.txt':return True
    if parts[0]=='unity' and path.name=='index.html':return True
    if parts[0] in {'css','js','images','audio','unity'}:
        return path.suffix.lower() in ASSET_EXT and not any(p in {'node_modules','src','Editor','Library','Temp'} for p in parts) and path.name!='package.json'
    if parts[0]=='zyms':return len(parts)==2 and path.name=='DREAMCORE __ 旧核·梦核·怪核图片滤镜实验室.html'
    return False
def public_paths():
    for root_name in ['css','js','images','audio','unity','data','zyms']:
        base=ROOT/root_name
        if base.exists():
            for path in base.rglob('*'):
                if path.is_file() and not path.is_symlink() and public_file(path.relative_to(ROOT)):yield path
    if (ROOT/'nav.js').is_file():yield ROOT/'nav.js'
    for path in ROOT.glob('*.html'):
        if public_file(path.relative_to(ROOT)):yield path
if __name__=='__main__':
    for path in sorted(public_paths()):print(path.relative_to(ROOT).as_posix())
